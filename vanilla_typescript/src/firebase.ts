import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { AccountBase, Transaction } from "plaid";
import { getAccounts, getAllTransactions } from "./plaid";
import { UserTransactionEntry } from './transaction';

// Initialize Firebase
initializeApp({
    credential: applicationDefault()
});

const db = getFirestore();
const accessTokenCollection = db.collection('access_tokens');
const accountsCollection = db.collection('accounts');
const transactionsCollection = db.collection('transactions');

export async function storeAccessToken(accessToken: String, userId: string) {
    console.log("storing access token in firebase");
    const docRef = accessTokenCollection.doc(userId);
    await docRef.set({
        tokens: FieldValue.arrayUnion(accessToken)
    }, {
        merge: true
    });
}

export async function getAllAccounts(accessTokens: string[], userId: string) {
    const accountsRef = accountsCollection.doc(userId);
    const userAccounts = await accountsRef.get();
    var allAccounts: AccountBase[] = [];
    if (!userAccounts.exists) {
        await Promise.all(accessTokens
            .map(async (token) => {
                console.log("Calling plaid accounts API with token: " + token);
                const accountsResponse = await getAccounts(token);
                allAccounts = [...allAccounts, ...accountsResponse.data.accounts];
            })
        );
        await accountsRef.set({ accounts: allAccounts });
    } else {
        allAccounts = userAccounts.data()?.accounts as AccountBase[];
    }
    return allAccounts;
}

export async function getTransactions(userId: string): Promise<FirebaseFirestore.DocumentData | undefined> {
    console.log("getting transactions for: " + userId)
    return (await transactionsCollection.doc(userId).get()).data();
}

export async function storeTransactions(userId: string, userTransEntry: UserTransactionEntry) {
    console.log("storing transactions for: " + userId)
    await transactionsCollection.doc(userId).set(userTransEntry);
}

export async function getAccessTokens(userId: string): Promise<string[]> {
    const doc = await accessTokenCollection.doc(userId).get();
    if (!doc.exists) {
        console.log('No access token document!');
        return []
    } else {
        console.log('Got access tokens:', doc.data());
    }
    return (doc.data() ?? {})['tokens']
}