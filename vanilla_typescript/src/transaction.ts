import { Transaction } from "plaid";

export interface UserTransactionEntry {
    transactions: Transaction[];
    startDate: string;
    endDate: string;
};