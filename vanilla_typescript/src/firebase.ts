import { initializeApp, applicationDefault, cert, ServiceAccount } from 'firebase-admin/app';
import { FieldValue, getFirestore, CollectionReference, DocumentData } from "firebase-admin/firestore";
import { InvestmentsHoldingsGetResponse } from "plaid";
import { UserInvestmentTransactionEntry, UserTransactionEntry } from './transaction';
import { AccountLink } from './account_link';
import { CryptoBalances, TokenBalance } from './crypto';
import { TroubledToken } from './token';
import dotenv from "dotenv";

// Initialize Firebase
dotenv.config();
initializeApp({
    credential: cert({
        clientEmail: process.env.GCP_SERVICE_ACCOUNT_EMAIL,
        privateKey: process.env.GCP_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        projectId: process.env.GCP_PROJECT_ID,
    } as ServiceAccount),
    databaseURL: `https://${process.env.GCP_PROJECT_ID}.firebaseio.com`,
});

const db = getFirestore();
const accessTokenCollection = db.collection('access_tokens');
const accountsCollection = db.collection('accounts');
const transactionsCollection = db.collection('transactions');
const investmentsCollection = db.collection('investments');
const investmentTransactionsCollection = db.collection('investment_transactions');
const cryptoCollection = db.collection('crypto');
const troubledAccountsCollection = db.collection('troubled_tokens');

const deleteUserData = (collection: CollectionReference<DocumentData>, userId: string) => collection.doc(userId).delete();

export async function getDbAccessTokens(userId: string): Promise<string[]> {
    const doc = await accessTokenCollection.doc(userId).get()
    if (!doc.exists) {
        console.log('No access token document!')
        return []
    } else {
        console.log('Got access tokens:', doc.data())
    }
    const tokens = (doc.data() ?? {})['tokens'] ?? [];
    return tokens.map((token: { iid: string, accessToken: string }) => token.accessToken);
}

export async function storeAccessToken(userId: string, iid: string, accessToken: string) {
    console.log("storing access token in firebase")
    const docRef = accessTokenCollection.doc(userId)
    const doc = await docRef.get()
    const existingTokens = doc.exists ? doc.data()?.tokens ?? [] : []

    if (!existingTokens.includes(accessToken)) {
        await docRef.set({
            tokens: FieldValue.arrayUnion({ iid, accessToken })
        }, {
            merge: true
        });
    } else {
        console.log("Access token already exists")
        deleteTroubledTokens(userId, [accessToken])
    }
}

export async function checkForExistingInstitutionLink(userId: string, iid: string): Promise<boolean> {
    const doc = await accessTokenCollection.doc(userId).get()
    if (!doc.exists) {
        console.log('No access token document!')
        return false
    } else {
        console.log('Got access tokens:', doc.data())
    }
    const tokens = (doc.data() ?? {})['tokens'];
    return tokens.some((token: { iid: string }) => token.iid === iid);
}

export async function storeTroubledTokens(userId: string, token: TroubledToken[]) {
    console.log("storing troubled token in firebase")
    const docRef = troubledAccountsCollection.doc(userId)
    await docRef.set({
        tokens: FieldValue.arrayUnion(...token)
    }, {
        merge: true
    });
}

export async function getTroubledTokens(userId: string): Promise<TroubledToken[]> {
    console.log("getting troubled tokens for: " + userId)
    const userRef = (await troubledAccountsCollection.doc(userId).get()).data()
    if (userRef) {
        return userRef.tokens ? userRef.tokens as TroubledToken[] : []
    }
    return []
}

export async function deleteTroubledTokens(userId: string, tokens: string[]): Promise<void> {
    console.log("deleting troubled tokens for user: " + userId)
    const doc = await troubledAccountsCollection.doc(userId).get();
    if (!doc.exists) {
        console.log('No troubled tokens document found!');
        return;
    }

    const currentTokens = doc.data()?.tokens ?? [];
    const tokensToRemove = currentTokens.filter((t: TroubledToken) => tokens.includes(t.token));

    if (tokensToRemove.length > 0) {
        await troubledAccountsCollection.doc(userId).update({
            tokens: FieldValue.arrayRemove(...tokensToRemove)
        });
    } else {
        console.log('No matching tokens found to remove.');
    }
}

export async function deleteAllTroubledTokens(userId: string): Promise<void> {
    console.log("deleting all troubled tokens for user: " + userId)
    await deleteUserData(troubledAccountsCollection, userId);
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