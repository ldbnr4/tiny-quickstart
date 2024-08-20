import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { AccountBase, Transaction } from "plaid";
import { getAccounts, getTransactions } from "./plaid";

export interface UserTransactionEntry {
    transactions: Transaction[];
    startDate: string;
    endDate: string;
};

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

export async function storeTransactions(start: string, end: string, userId: string) {
    const userTransDocRef = transactionsCollection.doc();
    const userTransactions = (await userTransDocRef.get()).data();
    var userTransEntry: UserTransactionEntry;
    if (!userTransactions) {
        console.log("No user transactions on record");
        userTransEntry = await _getAllTransactoins(await getAccessTokens(userId), start, end);
        await userTransDocRef.set(userTransEntry);
    } else {
        userTransEntry = userTransactions as UserTransactionEntry;
        const updateStart = new Date(start).getTime() < new Date(userTransEntry.startDate).getTime();
        const updateEnd = new Date(end).getTime() > new Date(userTransEntry.endDate).getTime();
        if (updateStart || updateEnd) {
            console.log("Update start: " + updateStart + ", update end: " + updateEnd);
            userTransEntry = await _getAllTransactoins(await getAccessTokens(userId), start, end);
            if (updateStart) userTransEntry.startDate = start;
            if (updateEnd) userTransEntry.endDate = end;
            await userTransDocRef.set(userTransEntry);
        }
    }
    return userTransEntry;
}

export async function getAccessTokens(userId: string): Promise<string[]> {
    const doc = await accessTokenCollection.doc(userId).get();
    if (!doc.exists) {
        console.log('No such document!');
    } else {
        console.log('With tokens:', doc.data());
    }
    return (doc.data() ?? {})['tokens']
}

async function _getAllTransactoins(accessTokens: string[], start: string, end: string) {
    // var newTrans: Transaction[] = [];
    // var modTrans: Transaction[] = [];
    // var removeTrans: RemovedTransaction[] = [];
    var allTrans: Transaction[] = [];
    await Promise.all(
        accessTokens.map(async (token) => {
            // for await (const token of allAccessTokens) {
            // var cursor;
            // var data: TransactionsGetResponse;
            // var counter = 0;
            console.log("calling plaid transactions API with token: " + token);
            // do {
            const data = (await getTransactions({
                access_token: token,
                start_date: start,
                end_date: end,
                // options: {
                //   count: 500,
                //   offset: 0
                // }
                // count: 500,
                // cursor: cursor
            })).data.transactions;
            allTrans = [...allTrans, ...data];
            // newTrans = [...newTrans, ...data.added];
            // modTrans = [...modTrans, ...data.modified];
            // removeTrans = [...removeTrans, ...data.removed]
            // cursor = data.next_cursor;
            // counter++;
            // console.log("counter: " + counter);
            // console.log("has more: " + data.has_more);
            // console.log("cursor: " + data.next_cursor)
            // } while (data.has_more && counter <= 10);
            // }
        })
    );
    // for (const newTran of [...newTrans, ...modTrans]) {
    //   await testTransactionCollection.doc(newTran.transaction_id).set({ newTran });
    // }
    // for (const removeTran of removeTrans.map(x => x.transaction_id)) {
    //   if (removeTran != null) {
    //     await testTransactionCollection.doc(removeTran).delete();
    //   }
    // }
    return {
        transactions: allTrans,
        startDate: start,
        endDate: end
    } as UserTransactionEntry;
}