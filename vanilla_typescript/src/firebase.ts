import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { AccountBase } from "plaid";
import { UserTransactionEntry } from './transaction';

// Initialize Firebase
initializeApp({
    credential: applicationDefault()
});

const db = getFirestore();
const accessTokenCollection = db.collection('access_tokens');
const accountsCollection = db.collection('accounts');
const transactionsCollection = db.collection('transactions');

export async function getAccessTokens(userId: string): Promise<string[]> {
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

export async function getDbAccounts(userId: string): Promise<AccountBase[]> {
    console.log("Getting accounts for: " + userId)
    const userRef = (await accountsCollection.doc(userId).get()).data()
    if (userRef) {
        return userRef.accounts as AccountBase[]
    }
    return []
}

export async function storeAccounts(userId: string, accountBaseList: AccountBase[]) {
    console.log("storing accounts for: " + userId)
    await accountsCollection.doc(userId).set({ accounts: accountBaseList })
}

export async function getTransactions(userId: string): Promise<FirebaseFirestore.DocumentData | undefined> {
    console.log("getting transactions for: " + userId)
    return (await transactionsCollection.doc(userId).get()).data()
}

export async function storeTransactions(userId: string, userTransEntry: UserTransactionEntry) {
    console.log("storing transactions for: " + userId)
    await transactionsCollection.doc(userId).set(userTransEntry)
}