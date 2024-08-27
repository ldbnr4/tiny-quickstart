import request from 'supertest';
import { app, server } from '../src/server';
import { exchangeToken, getPlaidLinkToken } from '../src/plaid'
import { AxiosResponse } from 'axios';
import { AccountSubtype, AccountType, ItemPublicTokenExchangeResponse, LinkTokenCreateResponse } from 'plaid';
import { getAccessTokens, getAllAccounts, storeAccessToken, storeTransactions, UserTransactionEntry } from '../src/firebase';

jest.mock("../src/plaid")
jest.mock("../src/firebase")

describe("Test server.ts", () => {

    test("Create link token", async () => {
        const mockedGetLinkToken = jest.mocked(getPlaidLinkToken)
        mockedGetLinkToken.mockReturnValueOnce(
            { data: 123 } as unknown as Promise<AxiosResponse<LinkTokenCreateResponse>>
        );
        await request(app).get("/api/create_link_token").expect(200, '123');
        server.close()

        expect(mockedGetLinkToken.mock.calls).toHaveLength(1)
    });

    test("Exchange token", async () => {
        const mockedExchangeToken = jest.mocked(exchangeToken)
        const mockedStore = jest.mocked(storeAccessToken)
        mockedExchangeToken.mockReturnValueOnce(
            {
                data:
                    { access_token: "access_token" }
            } as unknown as Promise<AxiosResponse<ItemPublicTokenExchangeResponse>>
        );
        await request(app).post("/api/exchange_public_token").expect(200, 'true');
        server.close()

        expect(mockedExchangeToken.mock.calls).toHaveLength(1)
        expect(mockedStore.mock.calls).toHaveLength(1)
    });

    test("Get accounts", async () => {
        const mockedGetAccessTokens = jest.mocked(getAccessTokens)
        const mockGetAllAccounts = jest.mocked(getAllAccounts)
        mockedGetAccessTokens.mockResolvedValue(
            ["access_token"]
        );
        mockGetAllAccounts.mockResolvedValue(
            [{
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
                official_name: 'test_official_name',
                type: AccountType.Depository,
                subtype: AccountSubtype.Checking
            }]
        )

        await request(app).get("/api/accounts").expect(200, [{
            "id": "test_id",
            "name": "test_name",
            "official_name": "test_official_name",
            "available_balance": 100,
            "current_balance": 100,
            "type": "depository",
            "subtype": "checking"
        }]);
        server.close()

        expect(mockedGetAccessTokens.mock.calls).toHaveLength(1)
        expect(mockedGetAccessTokens.mock.calls).toHaveLength(1)
    });

    test("Get transactions", async () => {
        const mockStoreTransactions = jest.mocked(storeTransactions)
        mockStoreTransactions.mockResolvedValue(
            {
                transactions: [
                    {
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
                ],
            } as UserTransactionEntry
        )

        await request(app).get("/api/transactions")
            .query({ "startDate": "2024-08-20", "endDate": "2024-08-20" })
            .expect(
                200,
                [{
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
                }]);
        server.close()

        expect(mockStoreTransactions.mock.calls).toHaveLength(1)
    });
});