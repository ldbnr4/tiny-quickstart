import { Configuration, CountryCode, LinkTokenCreateRequest, PlaidApi, PlaidEnvironments, Products, TransactionsGetRequest } from "plaid";
import dotenv from "dotenv";

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

export async function getTransactions(request: TransactionsGetRequest) {
    return await client.transactionsGet(request);
}

// async function exchangeToken()

// module.exports = {
//     getPlaidLinkToken,
//     exchangeToken,
// }