import { AccountBase, AccountType, InvestmentsHoldingsGetResponse, Transaction } from "plaid";
import { xTransaction } from "./transaction";
import { xAccountBase } from "./account_link";
import { deleteDbAccessTokens, getDbAccessTokens } from "./firebase";
import { removeAccessToken } from "./plaid";
import { xAssetClasses, xCategories } from "./consts";
import { classifyTransaction, getClassifier, trainClassifier } from "./transaction_classifier";

function findAssetClass(value: string): string {
    for (const assetClass of xAssetClasses) {
        for (const item of assetClass.items) {
            if (item === value) {
                return assetClass.name;
            }
        }
    }
    return "";
}

// Function to map a transaction to a budget category
export function mapCategoriesToXCategory(
    categories: string[],
): string {
    for (const plaidCategory of categories) {
        for (const xCat of xCategories) {
            for (const keyword of xCat.items) {
                if (plaidCategory.includes(keyword)) {
                    return xCat.name;
                }
            }
        }
    }
    // console.log("Uncategorized transaction: ", categories);
    return "Uncategorized";
}

export async function addXCategoryToTransactions(transactions: Transaction[]): Promise<xTransaction[]> {
    let classifier;
    try {
        classifier = await getClassifier();
    } catch (error) {
        console.error("Error getting classifier:", error);
        classifier = null;
    }
    return transactions.map(transaction => {
        const predictedCategory = classifier ? classifyTransaction(transaction, classifier) : "Uncategorized";
        const categories = [...(transaction.category ?? []), transaction.personal_finance_category?.primary ?? "", transaction.personal_finance_category?.detailed ?? ""];
        const fallbackCategory = mapCategoriesToXCategory(categories);

        if (predictedCategory !== fallbackCategory && classifier != null) {
            console.log(`Predicted category (${predictedCategory}), fallback category (${fallbackCategory}), differ for transaction:`, transaction);
        }

        // Combine predictions (e.g., use prediction primarily, fallback if it's "Uncategorized" or uncertain)
        const xCategory = predictedCategory !== "Uncategorized" ? predictedCategory : fallbackCategory;

        return {
            ...transaction,
            xCategory,
        };
    });
}

export function addAssetClassToAccount(accounts: AccountBase[]): xAccountBase[] {
    return accounts.map((account) => {
        return { ...account, asset_class: findAssetClass(account.type) }
    }) as xAccountBase[];
}

export function convertInvestmentIntoAccounts(investment: InvestmentsHoldingsGetResponse): xAccountBase[] {
    return investment.holdings
        .map((holding) => {
            const security = investment.securities.find((security) => security.security_id === holding.security_id);
            if (!security) {
                console.log("No security found for holding: ", holding);
                return null;
            }
            const type = security.type ?? "";
            return {
                account_id: security.security_id,
                institution_id: investment.item.institution_id,
                name: security.ticker_symbol ?? "",
                official_name: security.name ?? "",
                type: AccountType.Investment,
                subtype: type,
                asset_class: findAssetClass(type),
                balances: {
                    available: 0,
                    current: holding.institution_value,
                }
            } as xAccountBase;
        })
        .filter((account) => account !== null) as xAccountBase[];
}

export async function removeAndDeleteAccessTokens(userId: string) {
    console.log("deleting all db access tokens for user: " + userId)
    const accessTokens = await getDbAccessTokens(userId);
    await Promise.all(accessTokens.map((token) => removeAccessToken(token)))
    await deleteDbAccessTokens(userId);
}

export async function testFun() { }
