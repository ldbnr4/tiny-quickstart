/*
server.js – Configures the Plaid client and uses Express to defines routes that call Plaid endpoints in the Sandbox environment.
Utilizes the official Plaid node.js client library to make calls to the Plaid API.
*/
import dotenv, { configDotenv } from "dotenv";
import express, {
  ErrorRequestHandler,
  Request,
  Response,
  Application,
  NextFunction,
  response,
} from "express";
import bodyParser from "body-parser";
import session from "express-session";
import {
  AccountBase,
  AccountSubtype,
  Configuration,
  CountryCode,
  LinkTokenCreateRequest,
  PlaidApi,
  PlaidEnvironments,
  PlaidError,
  Products,
  RemovedTransaction,
  Transaction,
  TransactionsGetResponse,
} from "plaid";
import path from "path";
import cors from "cors";
import LocalStorage from "node-localstorage";
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue, Filter } from 'firebase-admin/firestore';
import { addDoc } from 'firebase/firestore';
import { credential } from "firebase-admin";
import moment from "moment";
// var serviceAccount = require("black-wall-street-p3vmel-firebase-adminsdk-ua71v-bc6cdd10bb.json");

var localStorage = new LocalStorage.LocalStorage('./scratch');


dotenv.config();
const app: Application = express();

// Let's tell TypeScript we're adding a new property to the session
// Again, don't ever do this in production
declare module "express-session" {
  interface SessionData {
    access_token?: string;
  }
}

// Initialize Firebase
initializeApp({
  credential: applicationDefault()
});

const db = getFirestore();
const accessTokenCollection = db.collection('access_tokens');
const accountsCollection = db.collection('accounts');
const transactionsCollection = db.collection('transactions');

app.use(
  // FOR DEMO PURPOSES ONLY
  // Use an actual secret key in production
  session({
    secret: "use-a-real-secret-key",
    saveUninitialized: true,
    resave: true,
  })
);

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get("/", async (_: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/oauth", async (_: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "oauth.html"));
});

// Configuration for the Plaid client
const environmentName = process.env.PLAID_ENV ?? "sandbox";

const config = new Configuration({
  basePath: PlaidEnvironments[environmentName],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SECRET,
      "Plaid-Version": "2020-09-14",
    },
  },
});

//Instantiate the Plaid client with the configuration
const client: PlaidApi = new PlaidApi(config);

//Creates a Link token and return it
app.get(
  "/api/create_link_token",
  async (req: Request, res: Response, next: NextFunction) => {
    console.log("create link token request")
    try {
      const linkConfigObject: LinkTokenCreateRequest = {
        user: { client_user_id: req.get("User-Id") ?? "default" },
        client_name: "Black Wall Street",
        language: "en",
        products: [Products.Transactions],
        country_codes: [CountryCode.Us],
        redirect_uri: process.env.PLAID_SANDBOX_REDIRECT_URI,
      };
      const tokenResponse = await client.linkTokenCreate(linkConfigObject);
      console.log("created a link token")
      res.json(tokenResponse.data);
    } catch (error) {
      console.log(error)
      next(error);
    }
  }
);

// Exchanges the public token from Plaid Link for an access token
app.post(
  "/api/exchange_public_token",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log("exchange token request")
      const exchangeResponse = await client.itemPublicTokenExchange({
        public_token: req.body.public_token,
      });

      // FOR DEMO PURPOSES ONLY
      // Store access_token in DB instead of local storage
      const userId = req.get("User-Id") ?? "default"
      // localStorage.setItem(userId, exchangeResponse.data.access_token);
      const docRef = accessTokenCollection.doc(userId);
      // Atomically add a new region to the "regions" array field.
      await docRef.set({
        tokens: FieldValue.arrayUnion(exchangeResponse.data.access_token)
      }, {
        merge: true
      });
      console.log("created access token: " + exchangeResponse.data.access_token)
      res.json(true)
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/add_access_token",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const docRef = accessTokenCollection.doc(req.body.user_id);
      // Atomically add a new region to the "regions" array field.
      // const unionRes = await docRef.update({
      //   tokens: FieldValue.arrayUnion('greater_virginia')
      // });
      await docRef.set({
        tokens: FieldValue.arrayUnion('token')
      }, {
        merge: true
      });
      res.json(true)
    } catch (error) {
      console.log("error")
      next(error);
    }
  }
);

app.get(
  "/api/accounts",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accessTokens = await getAccessTokens(req);
      if (!accessTokens || accessTokens.length == 0) {
        console.log("No access tokens")
        res.json([])
        return
      }
      console.log("received accounts request");
      const accountsRef = accountsCollection.doc(req.get("User-Id") ?? "default");
      const userAccounts = await accountsRef.get()
      var allAccounts: AccountBase[] = []
      if (!userAccounts.exists) {
        await Promise.all(accessTokens
          .map(async token => {
            console.log("Calling plaid accounts API with token: " + token)
            const accountsResponse = await client.accountsGet({
              access_token: token,
            });
            allAccounts = [...allAccounts, ...accountsResponse.data.accounts]
          })
        )
        await accountsRef.set({ accounts: allAccounts })
      } else {
        allAccounts = userAccounts.data()?.accounts as AccountBase[]
      }
      res.json(allAccounts.map(account => {
        // console.log(account)
        // Add filter for checking and savings accounts
        return {
          id: account.account_id,
          name: account.name,
          official_name: account.official_name,
          available_balance: account.balances.available,
          current_balance: account.balances.current,
          type: account.type,
          subtype: account.subtype
        }
      })
      )
    } catch (error) {
      next(error);
    }
  }
);

app.get("/api/transactions",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountId = req.get("Account-Id") ?? ""
      const category = req.get("Category") ?? ""
      const start = req.query.startDate === undefined || req.query.startDate.length == 0 ? moment().subtract(30, 'days').format('YYYY-MM-DD') : String(req.query.startDate);
      const end = req.query.endDate === undefined || req.query.endDate.length == 0 ? moment().format('YYYY-MM-DD') : String(req.query.endDate);
      console.log("received transactions request starting " + start + " and ending " + end);
      const userTransDocRef = transactionsCollection.doc(req.get("User-Id") ?? "default");
      const userTransactions = (await userTransDocRef.get()).data()
      var userTransEntry: UserTransactionEntry;
      if (!userTransactions) {
        userTransEntry = await getAllTransactoins(await getAccessTokens(req), start, end);
        await userTransDocRef.set(userTransEntry)
      } else {
        userTransEntry = userTransactions as UserTransactionEntry
        const updateStart = new Date(start).getTime() < new Date(userTransEntry.startDate).getTime();
        const updateEnd = new Date(end).getTime() > new Date(userTransEntry.endDate).getTime();
        if (updateStart || updateEnd) {
          userTransEntry = await getAllTransactoins(await getAccessTokens(req), start, end);
          if (updateStart) userTransEntry.startDate = start
          if (updateEnd) userTransEntry.endDate = end
          await userTransDocRef.set(userTransEntry)
        }
      }
      res.json(userTransEntry.transactions
        .filter((transaction: Transaction) =>
          (accountId.length == 0 || transaction.account_id === accountId)
          && (category.length == 0 || transaction.personal_finance_category?.primary === category)
          && new Date(transaction.date).getTime() >= new Date(start).getTime()
          && new Date(transaction.date).getTime() <= new Date(end).getTime()
        )
        .map(transaction => {
          // console.log(tranasction)
          return {
            id: transaction.transaction_id,
            accountId: transaction.account_id,
            merchant: transaction.merchant_name ?? transaction.name,
            date: transaction.date,
            amount: transaction.amount,
            logo_url: transaction.logo_url,
            category: transaction.personal_finance_category?.primary
          };
        }))
    } catch (error) {
      next(error);
    }
  }
);

app.get("/api/transaction_categories",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountId: String = req.get("Account-Id") ?? "";
      res.json(Array.from((await Promise.all((await getAccessTokens(req))
        .map(async (token) => {
          const data = (await client.transactionsSync({
            access_token: token,
            count: 500
          })).data;
          return [...data.added, ...data.modified]
            .filter((transaction: Transaction) => accountId.length == 0 || transaction.account_id === accountId)
            .map(tranasction => {
              console.log(tranasction);
              return {
                category: tranasction.personal_finance_category?.primary,
                amount: tranasction.amount,
              };
            });
        }))
      ).flat().reduce((accum, value) => accum.set(value.category, (accum.get(value.category) ?? 0) + value.amount), new Map()), ([category, amount]) => ({ category, amount })));
    } catch (error) {
      next(error);
    }
  }
);

async function getAllTransactoins(accessTokens: string[], start: string, end: string) {
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
      console.log("calling plaid transacrtions API with token: " + token);
      // do {
      const data = (await client.transactionsGet({
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

async function getAccessTokens(req: Request): Promise<string[]> {
  const userId = req.get("User-Id") ?? ""
  const doc = await accessTokenCollection.doc(userId).get();
  if (!doc.exists) {
    console.log('No such document!');
  } else {
    console.log('With tokens:', doc.data());
  }
  return (doc.data() ?? {})['tokens']
}

interface UserTransactionEntry {
  transactions: Transaction[];
  startDate: string;
  endDate: string;
};

type PotentialPlaidError = Error & {
  response?: {
    data?: any;
  };
};

const errorHandler: ErrorRequestHandler = (
  err: PotentialPlaidError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(`Received an error for ${req.method} ${req.path}`);
  if (err.response) {
    const plaidError: PlaidError = err.response.data;
    console.error(err.response.data);
    res.status(500).send(plaidError);
  } else {
    console.error(err);
    res.status(500).send({
      error_code: "OTHER_ERROR",
      error_message: "I got some other message on the server.",
    });
  }
};

app.use(errorHandler);

app.listen(process.env.PORT || 8080);
