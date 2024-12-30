import request from 'supertest';
import { app, server } from '../src/server';
import { exchangeToken, getAccounts, getAllTransactions, getPlaidLinkToken } from '../src/plaid'
import { AxiosResponse } from 'axios';
import { AccountBase, AccountsGetResponse, AccountSubtype, AccountType, ItemPublicTokenExchangeResponse, LinkTokenCreateResponse } from 'plaid';
import { getDbAccessTokens, getDbAccounts, getDbTransactions } from '../src/firebase';
import { UserTransactionEntry } from '../src/transaction';

jest.mock("../src/plaid")
jest.mock("../src/firebase")

describe("Test server.ts", () => {

    test("Create link token", async () => {
        jest.mocked(getPlaidLinkToken).mockReturnValueOnce(
            { data: 123 } as unknown as Promise<AxiosResponse<LinkTokenCreateResponse>>
        )

        await request(app).get("/api/create_link_token").expect(200, '123');
        server.close()
    });

    test("Exchange token", async () => {
        jest.mocked(exchangeToken).mockReturnValueOnce(
            {
                data: { access_token: "access_token" }
            } as unknown as Promise<AxiosResponse<ItemPublicTokenExchangeResponse>>
        )

        await request(app).post("/api/exchange_public_token").expect(200, 'true');
        server.close()
    });

    test("Get accounts, no previous record", async () => {
        setupMockAccessTokens();
        jest.mocked(getDbAccounts).mockReturnValueOnce([] as unknown as Promise<AccountBase[]>);
        jest.mocked(getAccounts).mockReturnValueOnce(
            {
                data: {
                    accounts: [getTestAccount()],
                }
            } as unknown as Promise<AxiosResponse<AccountsGetResponse>>
        )

        await request(app).get("/api/accounts").expect(200, [getTestAccountResult()]);
        server.close()
    });

    test("Get accounts, has previous record", async () => {
        jest.mocked(getDbAccounts).mockReturnValueOnce([getTestAccount()] as unknown as Promise<AccountBase[]>);

        await request(app).get("/api/accounts").expect(200, [getTestAccountResult()]);
        server.close()
    });

    test("Get accounts, updates becuase of refresh", async () => {
        setupMockAccessTokens();
        jest.mocked(getDbAccounts).mockReturnValueOnce([getTestAccount()] as unknown as Promise<AccountBase[]>);
        jest.mocked(getAccounts).mockReturnValueOnce(
            {
                data: {
                    accounts: [getTestAccount(), getTestAccount("test2")],
                }
            } as unknown as Promise<AxiosResponse<AccountsGetResponse>>
        )

        await request(app).get("/api/accounts")
            .query({ "refresh": "true" })
            .expect(200, [getTestAccountResult(), getTestAccountResult("test2")]);
        server.close()
    });

    test("Get transactions, no previous record", async () => {
        jest.mocked(getAllTransactions).mockReturnValueOnce(
            {
                transactions: [getTestTransaction()],
            } as unknown as Promise<UserTransactionEntry>
        )

        await request(app).get("/api/transactions")
            .query({ "startDate": "2024-08-20", "endDate": "2024-08-20" })
            .expect(200, [getTestTransactionResult()]);
        server.close()

    });

    test("Get transactions, update because of end date", async () => {
        setupMockAccessTokens()
        jest.mocked(getDbTransactions).mockReturnValueOnce(
            {
                startDate: "2024-08-20",
                endDate: "2024-08-20",
                transactions: []
            } as unknown as Promise<FirebaseFirestore.DocumentData>
        )
        jest.mocked(getAllTransactions).mockReturnValueOnce(
            {
                transactions: [getTestTransaction()],
            } as unknown as Promise<UserTransactionEntry>
        )

        await request(app).get("/api/transactions")
            .query({ "startDate": "2024-08-20", "endDate": "2024-08-21" })
            .expect(200, [getTestTransactionResult()]);
        server.close()
    });

    test("Get transactions, update because of start date", async () => {
        setupMockAccessTokens()
        jest.mocked(getDbTransactions).mockReturnValueOnce(
            {
                startDate: "2024-08-20",
                endDate: "2024-08-20",
                transactions: []
            } as unknown as Promise<FirebaseFirestore.DocumentData>
        )
        jest.mocked(getAllTransactions).mockReturnValueOnce(
            {
                transactions: [getTestTransaction()],
            } as unknown as Promise<UserTransactionEntry>
        )

        await request(app).get("/api/transactions")
            .query({ "startDate": "2024-08-19", "endDate": "2024-08-21" })
            .expect(200, [getTestTransactionResult()]);
        server.close()
    });

    test("Get transactions, empty because no response from plaid", async () => {
        await request(app).get("/api/transactions")
            .query({ "startDate": "2024-08-20", "endDate": "2024-08-21" })
            .expect(200, []);
        server.close()
    });

    test("Get transactions, no update because of same dates", async () => {
        setupMockAccessTokens()
        jest.mocked(getDbTransactions).mockReturnValueOnce(
            {
                startDate: "2024-08-20",
                endDate: "2024-08-20",
                transactions: [getTestTransaction()]
            } as unknown as Promise<FirebaseFirestore.DocumentData>
        )
        jest.mocked(getAllTransactions).mockReturnValueOnce(
            {
                transactions: [getTestTransaction(), getTestTransaction()],
            } as unknown as Promise<UserTransactionEntry>
        )

        await request(app).get("/api/transactions")
            .query({ "startDate": "2024-08-20", "endDate": "2024-08-20" })
            .expect(200, [getTestTransactionResult()]);
        server.close()
    });

    test("Get transactions, update because of refresh", async () => {
        setupMockAccessTokens()
        jest.mocked(getDbTransactions).mockReturnValueOnce(
            {
                startDate: "2024-08-20",
                endDate: "2024-08-20",
                transactions: []
            } as unknown as Promise<FirebaseFirestore.DocumentData>
        )
        jest.mocked(getAllTransactions).mockReturnValueOnce(
            {
                transactions: [getTestTransaction(), getTestTransaction()],
            } as unknown as Promise<UserTransactionEntry>
        )

        await request(app).get("/api/transactions")
            .query({ "startDate": "2024-08-20", "endDate": "2024-08-20", "refresh": "true" })
            .expect(200, [getTestTransactionResult(), getTestTransactionResult()]);
        server.close()
    });
});

function getTestAccountResult(official_name: String = "test_official_name"): any {
    return {
        "id": "test_id",
        "name": "test_name",
        "official_name": official_name,
        "available_balance": 100,
        "current_balance": 100,
        "type": "depository",
        "subtype": "checking"
    };
}

function getTestAccount(official_name: String = 'test_official_name') {
    return {
        account_id: 'test_id',
        balances: {
            available: 100,
            current: 100,
            limit: null,
            iso_currency_code: null,
            unofficial_currency_code: null
        },
        mask: null,
        name: 'test_name',
        official_name: official_name,
        type: AccountType.Depository,
        subtype: AccountSubtype.Checking
    };
}

function setupMockAccessTokens() {
    jest.mocked(getDbAccessTokens).mockReturnValueOnce(
        ["access_token"] as unknown as Promise<string[]>
    )
}

function getTestTransaction() {
    return {
        transaction_id: "test_id",
        account_id: "test_accnt_id",
        date: '2024-08-20',
        name: "name",
        amount: 100,
        personal_finance_category: {
            primary: "test_primary",
            detailed: "test_detailed",
        },
        personal_finance_category_icon_url: "test_pf_url",
        merchant_name: "test_merchant",
        logo_url: "test_url"
    }
}

function getTestTransactionResult(): any {
    return {
        id: 'test_id',
        accountId: 'test_accnt_id',
        date: '2024-08-20',
        amount: 100,
        name: 'name',
        category: 'test_primary',
        detailed_category: 'test_detailed',
        category_logo_url: 'test_pf_url',
        merchant: 'test_merchant',
        logo_url: 'test_url'
    }
}
