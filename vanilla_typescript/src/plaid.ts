import { Configuration, CountryCode, LinkTokenCreateRequest, PlaidApi, PlaidEnvironments, Products, Transaction, TransactionsGetRequest } from "plaid";
import dotenv from "dotenv";
import { UserTransactionEntry } from "./transaction";

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
    country_codes: [CountryCode.Us],
    redirect_uri: process.env.PLAID_SANDBOX_REDIRECT_URI,
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

export async function getAccounts(accessToken: string) {
    return await client.accountsGet({
        access_token: accessToken,
    })
}

export async function getAllTransactions(accessTokens: string[], start: string, end: string): Promise<UserTransactionEntry | undefined> {
    // var newTrans: Transaction[] = [];
    // var modTrans: Transaction[] = [];
    // var removeTrans: RemovedTransaction[] = [];
    if (accessTokens.length == 0) {
        console.log("Can not get transactions without access tokens")
        return undefined
    }
    var allTrans: Transaction[] = [];
    await Promise.all(
        accessTokens.map(async (token) => {
            // for await (const token of allAccessTokens) {
            // var cursor;
            // var data: TransactionsGetResponse;
            // var counter = 0;
            console.log("calling plaid transactions API with token: " + token);
            // do {
            const data = (await _getTransactions({
                access_token: token,
                start_date: start,
                end_date: end,
                // options: {
                //   count: 500,
                //   offset: 0
                // }
                // count: 500,
                // cursor: cursor
            })).data.transactions;
            allTrans = [...allTrans, ...data];
            // newTrans = [...newTrans, ...data.added];
            // modTrans = [...modTrans, ...data.modified];
            // removeTrans = [...removeTrans, ...data.removed]
            // cursor = data.next_cursor;
            // counter++;
            // console.log("counter: " + counter);
            // console.log("has more: " + data.has_more);
            // console.log("cursor: " + data.next_cursor)
            // } while (data.has_more && counter <= 10);
            // }
        })
    );
    // for (const newTran of [...newTrans, ...modTrans]) {
    //   await testTransactionCollection.doc(newTran.transaction_id).set({ newTran });
    // }
    // for (const removeTran of removeTrans.map(x => x.transaction_id)) {
    //   if (removeTran != null) {
    //     await testTransactionCollection.doc(removeTran).delete();
    //   }
    // }
    return {
        transactions: allTrans,
        startDate: start,
        endDate: end
    } as UserTransactionEntry;
}

async function _getTransactions(request: TransactionsGetRequest) {
    return await client.transactionsGet(request);
}
