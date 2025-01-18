import { Configuration, CountryCode, LinkTokenCreateRequest, PlaidApi, PlaidEnvironments, Products, Transaction, TransactionsGetRequest, TransactionsSyncRequest, RemovedTransaction, TransactionsSyncResponse, InvestmentsHoldingsGetResponse, InvestmentTransaction } from "plaid";
import dotenv from "dotenv";
import { UserInvestmentTransactionEntry, UserTransactionEntry, xTransaction } from "./transaction";
import { addXCategoryToTransactions } from "./middleware";

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
    client_name: "Black Wall Street",
    language: "en",
    products: [Products.Transactions],
    additional_consented_products: [Products.Investments],
    country_codes: [CountryCode.Us],
    redirect_uri: process.env.PLAID_SANDBOX_REDIRECT_URI,
    transactions: {
        days_requested: 730,
    }
};

export async function getPlaidLinkToken(userId: string) {
    const tokenResponse = await client.linkTokenCreate({ ...linkConfigObject, user: { client_user_id: userId } });
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

export async function getAccounts(accessToken: string) {
    return await client.accountsGet({
        access_token: accessToken,
    })
}

export async function getInvestments(accessToken: string) {
    try {
        return (await client.investmentsHoldingsGet({
            access_token: accessToken,
        })).data;
    } catch (error) {
        console.log("error getting investments: " + error);
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

export async function getAllTransactions(accessTokens: string[], start: string, end: string): Promise<UserTransactionEntry | undefined> {
    if (accessTokens.length == 0) {
        console.log("Can not get transactions without access tokens")
        return undefined
    }
    var allTrans: xTransaction[] = [];
    await Promise.all(
        accessTokens.map(async (token) => {
            var hasMore = true;
            var counter = 0;
            console.log("calling plaid transactions API with token: " + token);
            do {
                const data = (await _getTransactions({
                    access_token: token,
                    start_date: start,
                    end_date: end,
                    options: {
                        count: 500,
                        offset: counter
                    }
                })).data
                allTrans = [...allTrans, ...addXCategoryToTransactions(data.transactions)]
                counter += data.transactions.length
                hasMore = counter < data.total_transactions
                console.log("got " + counter + " transactions of " + data.total_transactions + " total.")
            } while (hasMore);
        })
    );
    return {
        transactions: allTrans,
        startDate: start,
        endDate: end
    } as UserTransactionEntry;
}

export async function getCategories(): Promise<string[]> {
    return (await client.categoriesGet({})).data.categories.flatMap((category) => category.hierarchy);
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
