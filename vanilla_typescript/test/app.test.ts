import request from 'supertest';
import { app, server } from '../src/server';
import { exchangeToken, getPlaidLinkToken } from '../src/plaid'
import { AxiosResponse } from 'axios';
import { ItemPublicTokenExchangeResponse, LinkTokenCreateResponse } from 'plaid';
import { storeAccessToken } from '../src/firebase';

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
    });
});