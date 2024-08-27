import { config } from '../src/plaid'

describe("Test plaid code", () => {
    test("Env set", () => {
        expect(config.basePath?.length).toBeGreaterThan(0)
        expect(config.baseOptions?.headers["PLAID-CLIENT-ID"].length).toBeGreaterThan(0)
        expect(config.baseOptions?.headers["PLAID-SECRET"].length).toBeGreaterThan(0)
    });
})