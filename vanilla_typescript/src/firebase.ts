import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { FieldValue, getFirestore, CollectionReference, DocumentData } from "firebase-admin/firestore";
import { InvestmentsHoldingsGetResponse } from "plaid";
import { UserInvestmentTransactionEntry, UserTransactionEntry } from './transaction';
import { AccountLink } from './account_link';
import { CryptoBalances, TokenBalance } from './crypto';

// Initialize Firebase
initializeApp({
    credential: applicationDefault()
});

const db = getFirestore();
const accessTokenCollection = db.collection('access_tokens');
const accountsCollection = db.collection('accounts');
const transactionsCollection = db.collection('transactions');
const investmentsCollection = db.collection('investments');
const investmentTransactionsCollection = db.collection('investment_transactions');
const cryptoCollection = db.collection('crypto');

const deleteUserData = (collection: CollectionReference<DocumentData>, userId: string) => collection.doc(userId).delete();

export async function getDbAccessTokens(userId: string): Promise<string[]> {
    const doc = await accessTokenCollection.doc(userId).get()
    if (!doc.exists) {
        console.log('No access token document!')
        return []
    } else {
        console.log('Got access tokens:', doc.data())
    }
    return (doc.data() ?? {})['tokens']
}

export async function storeAccessToken(accessToken: String, userId: string) {
    console.log("storing access token in firebase")
    const docRef = accessTokenCollection.doc(userId)
    await docRef.set({
        tokens: FieldValue.arrayUnion(accessToken)
    }, {
        merge: true
    });
}

export async function deleteDbAccessTokens(userId: string): Promise<void> {
    console.log("deleting all db access tokens for user: " + userId)
    await deleteUserData(accessTokenCollection, userId);
}

export async function getDbAccounts(userId: string): Promise<AccountLink[]> {
    console.log("Getting db accounts links for: " + userId)
    const userRef = (await accountsCollection.doc(userId).get()).data()
    if (userRef) {
        return userRef.accountLinks as AccountLink[]
    }
    return []
}

export async function storeAccounts(userId: string, accountLinks: AccountLink[]) {
    console.log("storing accounts for: " + userId)
    await accountsCollection.doc(userId).set({ "accountLinks": accountLinks })
}

export async function deleteDbAccounts(userId: string): Promise<void> {
    console.log("deleting all accounts for user: " + userId)
    await deleteUserData(accountsCollection, userId);
}

export async function getDbInvestments(userId: string): Promise<InvestmentsHoldingsGetResponse[]> {
    console.log("getting db investments for: " + userId)
    const userRef = (await investmentsCollection.doc(userId).get()).data()
    if (userRef) {
        return userRef.investments as InvestmentsHoldingsGetResponse[]
    }
    return []
}

export async function storeInvestments(userId: string, investmentsData: InvestmentsHoldingsGetResponse[]) {
    console.log("storing investments for: " + userId)
    await investmentsCollection.doc(userId).set({ investments: investmentsData })
}

export async function deleteDbInvestments(userId: string): Promise<void> {
    console.log("deleting all db investments for user: " + userId)
    await deleteUserData(investmentsCollection, userId);
}

export async function getDbTransactions(userId: string): Promise<FirebaseFirestore.DocumentData | undefined> {
    console.log("getting db transactions for: " + userId)
    return (await transactionsCollection.doc(userId).get()).data()
}

export async function storeTransactions(userId: string, userTransEntry: UserTransactionEntry) {
    console.log("storing transactions for: " + userId)
    await transactionsCollection.doc(userId).set(userTransEntry)
}

export async function deleteDbTransactions(userId: string): Promise<void> {
    console.log("deleting all db transactions for user: " + userId)
    await deleteUserData(transactionsCollection, userId);
}

export async function storeInvestmentTransactions(userId: string, userInvestmentTransEntry: UserInvestmentTransactionEntry) {
    console.log("storing investment transactions for: " + userId)
    await investmentTransactionsCollection.doc(userId).set(userInvestmentTransEntry)
}

export async function getDbInvestmentTransactions(userId: string): Promise<FirebaseFirestore.DocumentData | undefined> {
    console.log("getting investment transactions for: " + userId)
    return (await investmentTransactionsCollection.doc(userId).get()).data()
}

export async function deleteDbInvestmentTransactions(userId: string): Promise<void> {
    console.log("deleting all db investment transactions for user: " + userId)
    await deleteUserData(investmentTransactionsCollection, userId);
}

export async function getDbCryptoBalances(userId: string): Promise<CryptoBalances> {
    console.log("getting crypto for: " + userId)
    return (await cryptoCollection.doc(userId).get()).data() as CryptoBalances
}

export async function storeCryptoBalances(userId: string, address: string, cryptoBalances: TokenBalance[]) {
    console.log("storing crypto for: " + userId)
    await cryptoCollection.doc(userId).set({
        address,
        balances: cryptoBalances,
        last_updated: Date.now()
    });
}

export async function deleteDbCryptoBalances(userId: string): Promise<void> {
    console.log("deleting all db crypto for user: " + userId)
    await deleteUserData(cryptoCollection, userId);
}