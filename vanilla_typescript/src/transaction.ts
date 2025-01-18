import { InvestmentTransaction, Transaction } from "plaid";

export interface xTransaction extends Transaction {
    xCategory: string;
}
export interface UserTransactionEntry {
    transactions: xTransaction[];
    startDate: string;
    endDate: string;
};
export interface UserInvestmentTransactionEntry {
    transactions: InvestmentTransaction[];
    startDate: string;
    endDate: string;
};