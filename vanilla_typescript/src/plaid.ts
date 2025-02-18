import { Configuration, CountryCode, LinkTokenCreateRequest, PlaidApi, PlaidEnvironments, Products, Transaction, TransactionsGetRequest, TransactionsSyncRequest, RemovedTransaction, TransactionsSyncResponse, InvestmentTransaction, AccountSubtype, AccountType } from "plaid";
import dotenv from "dotenv";
import { AxiosError } from "axios";
import { UserInvestmentTransactionEntry, UserTransactionEntry } from "./transaction";
import { addAssetClassToAccount, addXCategoryToTransactions, convertInvestmentIntoAccounts } from "./middleware";
import { TroubledToken } from "./token";
import { deleteTroubledTokens, storeTroubledTokens } from "./firebase";
import { ApiResponse } from "./response";
import { AccountLink } from "./account_link";

dotenv.config();

// Configuration for the Plaid client
const environmentName = process.env.PLAID_ENV ?? "sandbox";

const config = new Configuration({
    basePath: PlaidEnvironments[environmentName],
    baseOptions: {
        headers: {
            "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
            "PLAID-SECRET": process.env.PLAID_SECRET,
            "Plaid-Version": "2020-09-14",
        },
    },
});

//Instantiate the Plaid client with the configuration
const client: PlaidApi = new PlaidApi(config);

const linkConfigObject: LinkTokenCreateRequest = {
    user: { client_user_id: "" },
    client_name: "WealthWeaver",
    language: "en",
    products: [Products.Transactions],
    optional_products: [Products.Investments],
    country_codes: [CountryCode.Us],
    redirect_uri: process.env.PLAID_SANDBOX_REDIRECT_URI,
    transactions: {
        days_requested: 730,
    },
    webhook: process.env.PLAID_WEBHOOK,
};

export async function sandboxItemResetLogin(token: string) {
    return await client.sandboxItemResetLogin({ access_token: token });
}

export async function getPlaidLinkToken(userId: string, accessToken?: string) {
    const tokenResponse = await client.linkTokenCreate({ ...linkConfigObject, user: { client_user_id: userId }, access_token: accessToken, update: { account_selection_enabled: true } });
    console.log("created a link token");
    return tokenResponse;
}

export async function exchangeToken(publicToken: string) {
    console.log("exchange token request");
    const exchangeResponse = await client.itemPublicTokenExchange({
        public_token: publicToken,
    });
    return exchangeResponse;
}

export async function removeAccessToken(accessToken: string) {
    console.log("removing access token: " + accessToken);
    try {
        await client.itemRemove({
            access_token: accessToken,
        });
    } catch (error) {
        console.log("error removing access token: " + error)
    }
}

export async function getAllAccounts(uid: string, accessTokens: string[], allAccounts: AccountLink[], troubledToken: TroubledToken[]) {
    await Promise.all(accessTokens
        .map(async (token) => {
            console.log("Calling plaid accounts API with token: " + token)
            let accountsResponse;
            try {
                accountsResponse = (await getAccounts(token)).data;
            } catch (e) {
                if (e instanceof AxiosError && e.response?.data.error_code === "ITEM_LOGIN_REQUIRED") {
                    const institutionId = (await client.itemGet({ access_token: token })).data.item.institution_id;
                    console.log("failued inst ID: " + institutionId);
                    troubledToken.push({ token: token, iid: institutionId!, reason: "ITEM_LOGIN_REQUIRED" });
                } else {
                    console.log("error getting accounts: " + e);
                }
                return;
            }
            const accountItem = accountsResponse.item
            const institution = await getInstitution(accountItem.institution_id ?? "")
            const accountLink = {
                item_id: accountItem.item_id,
                institution_id: institution.institution_id,
                name: institution.name,
                url: institution.url,
                accounts: addAssetClassToAccount(accountsResponse.accounts
                    .filter(account =>
                        account.subtype === AccountSubtype.Checking
                        || account.subtype === AccountSubtype.Savings
                        || account.type === AccountType.Credit)
                )
            } as AccountLink;
            if (await isInvestmentsAvailable(token)) {
                const investments = await getInvestments(token)
                if (investments) {
                    accountLink.accounts = accountLink.accounts.concat(convertInvestmentIntoAccounts(investments))
                }
            }
            allAccounts.push(accountLink)
        })
    )
    if (troubledToken.length > 0) {
        storeTroubledTokens(uid, troubledToken);
    }
    if (allAccounts.length > 0) {
        deleteTroubledTokens(uid, allAccounts.map(account => account.item_id));
    }
}

export async function getAccounts(accessToken: string) {
    return await client.accountsGet({
        access_token: accessToken,
    })
}

export async function isInvestmentsAvailable(accessToken: string) {
    return (await client.itemGet({ access_token: accessToken })).data.item.available_products.includes(Products.Investments);
}

export async function getInvestments(accessToken: string) {
    try {
        return (await client.investmentsHoldingsGet({
            access_token: accessToken,
        })).data;
    } catch (error) {
        console.log("error getting investments: ", error);
    }
}

export async function getInvetmentTransactions(accessTokens: string[], start: string, end: string): Promise<UserInvestmentTransactionEntry | undefined> {
    if (accessTokens.length == 0) {
        console.log("Can not get transactions without access tokens")
        return undefined
    }
    var allTrans: InvestmentTransaction[] = [];
    await Promise.all(
        accessTokens.map(async (token) => {
            var hasMore = true;
            var counter = 0;
            console.log("calling plaid investment transactions API with token: " + token);
            do {
                const data = (await _getInvestmentTransactions({
                    access_token: token,
                    start_date: start,
                    end_date: end,
                    options: {
                        // count: 500,
                        offset: counter
                    }
                })).data
                if (data == undefined) {
                    break
                }
                allTrans = [...allTrans, ...data.investment_transactions]
                counter += data.investment_transactions.length
                hasMore = counter < data.total_investment_transactions
                console.log("got " + counter + " transactions of " + data.total_investment_transactions + " total.")
            } while (hasMore);
        })
    );
    return {
        transactions: allTrans,
        startDate: start,
        endDate: end
    } as UserInvestmentTransactionEntry;
}

export async function getTransactionsSync(accessTokens: string[], start: string, end: string): Promise<UserTransactionEntry | undefined> {
    var newTrans: Transaction[] = [];
    var modTrans: Transaction[] = [];
    var removeTrans: RemovedTransaction[] = [];
    if (accessTokens.length == 0) {
        console.log("Can not get transactions without access tokens")
        return undefined
    }
    var allTrans: Transaction[] = [];
    await Promise.all(
        accessTokens.map(async (token) => {
            var cursor;
            var hasMore = true;
            var counter = 0;
            console.log("calling plaid transactions API with token: " + token);
            do {
                const data: TransactionsSyncResponse = (await _getTransactionsSync({
                    access_token: token,
                    count: 500,
                    cursor: cursor
                })).data
                newTrans = [...newTrans, ...data.added];
                modTrans = [...modTrans, ...data.modified];
                removeTrans = [...removeTrans, ...data.removed]
                cursor = data.next_cursor;
                counter++;
                console.log("counter: " + counter)
                console.log("cursor: " + cursor)
            } while (cursor != null);
        })
    );
    return {
        transactions: allTrans,
        startDate: start,
        endDate: end
    } as UserTransactionEntry;
}

export async function getAllTransactions(uid: string, accessTokens: string[], start: string, end: string, forTraining: boolean = false): Promise<ApiResponse<UserTransactionEntry>> {
    if (accessTokens.length == 0) {
        console.log("Can not get transactions without access tokens")
        return { data: {} as UserTransactionEntry, failures: [] }
    }
    var allTrans: Transaction[] = [];
    var failedTokens: TroubledToken[] = [];
    var successTokens: string[] = [];
    console.log("getting transactions from " + start + " to " + end);
    await Promise.all(
        accessTokens.map(async (token) => {
            var hasMore = true;
            var counter = 0;
            var failed = false;
            console.log("calling plaid transactions API with token: " + token);
            do {
                try {
                    const data = (await _getTransactions({
                        access_token: token,
                        start_date: start,
                        end_date: end,
                        options: {
                            count: 500,
                            offset: counter
                        }
                    })).data;
                    allTrans = [...allTrans, ...data.transactions];
                    counter += data.transactions.length;
                    hasMore = counter < data.total_transactions;
                    console.log("got " + counter + " transactions of " + data.total_transactions + " total.");
                } catch (e) {
                    if (!forTraining && e instanceof AxiosError && e.response?.data.error_code === "ITEM_LOGIN_REQUIRED") {
                        const institutionId = (await client.itemGet({ access_token: token })).data.item.institution_id;
                        console.log("failued inst ID: " + institutionId);
                        failedTokens.push({ token: token, iid: institutionId!, reason: "ITEM_LOGIN_REQUIRED" });
                    } else {
                        console.log("error getting transactions: ", e);
                    }
                    hasMore = false;
                    failed = true;
                }
            } while (hasMore);
            if (!failed) {
                successTokens.push(token);
            }
        })
    );
    if (failedTokens.length > 0) {
        storeTroubledTokens(uid, failedTokens);
    }
    if (successTokens.length > 0) {
        deleteTroubledTokens(uid, successTokens);
    }
    return {
        data: {
            transactions: await addXCategoryToTransactions(allTrans),
            startDate: start,
            endDate: end
        },
        failures: failedTokens
    } as ApiResponse<UserTransactionEntry>;
}

export async function getCategories(): Promise<string[]> {
    return Array.from(new Set((await client.categoriesGet({})).data.categories.flatMap((category) => category.hierarchy)));
}

export async function getInstitution(institutionId: string) {
    return (await client.institutionsGetById({ institution_id: institutionId, country_codes: [CountryCode.Us], options: { include_optional_metadata: true } })).data.institution;
}

async function _getTransactions(request: TransactionsGetRequest) {
    return await client.transactionsGet(request);
}

async function _getTransactionsSync(request: TransactionsSyncRequest) {
    return await client.transactionsSync(request);
}

async function _getInvestmentTransactions(request: TransactionsGetRequest) {
    try {
        return await client.investmentsTransactionsGet(request);
    } catch (error) {
        console.log("error getting investment transactions: " + error)
        return { data: undefined }
    }
}
