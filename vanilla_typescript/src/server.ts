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
  AccountSubtype,
  Configuration,
  CountryCode,
  LinkTokenCreateRequest,
  PlaidApi,
  PlaidEnvironments,
  PlaidError,
  Products,
  Transaction,
} from "plaid";
import path from "path";
import cors from "cors";
import LocalStorage from "node-localstorage";
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue, Filter } from 'firebase-admin/firestore';
import { credential } from "firebase-admin";
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

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAcbQotmNlwZY6B4vwBfMYi_qBt7jJpf30",
  authDomain: "black-wall-street-p3vmel.firebaseapp.com",
  projectId: "black-wall-street-p3vmel",
  storageBucket: "black-wall-street-p3vmel.appspot.com",
  messagingSenderId: "639291841708",
  appId: "1:639291841708:web:933776a64c676dd2025309"
};

// Initialize Firebase
// initializeApp(firebaseConfig);

initializeApp({
  credential: applicationDefault()
});

const db = getFirestore();

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
    try {
      const linkConfigObject: LinkTokenCreateRequest = {
        user: { client_user_id: req.get("User-Id") ?? "default" },
        client_name: "Black Wall Street",
        language: "en",
        products: [Products.Auth],
        country_codes: [CountryCode.Us],
        redirect_uri: process.env.PLAID_SANDBOX_REDIRECT_URI,
      };
      const tokenResponse = await client.linkTokenCreate(linkConfigObject);
      console.log("created a link token")
      res.json(tokenResponse.data);
    } catch (error) {
      next(error);
    }
  }
);

// Exchanges the public token from Plaid Link for an access token
app.post(
  "/api/exchange_public_token",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const exchangeResponse = await client.itemPublicTokenExchange({
        public_token: req.body.public_token,
      });

      // FOR DEMO PURPOSES ONLY
      // Store access_token in DB instead of session storage
      // req.session.access_token = exchangeResponse.data.access_token;
      // res.json(exchangeResponse.data.access_token);
      localStorage.setItem(req.body.user_id, exchangeResponse.data.access_token);
      const docRef = db.collection('access_tokens').doc(req.body.user_id);
      // Atomically add a new region to the "regions" array field.
      await docRef.set({
        tokens: FieldValue.arrayUnion(exchangeResponse.data.access_token)
      }, {
        merge: true
      });
      console.log(exchangeResponse.data.access_token)
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
      const docRef = db.collection('access_tokens').doc(req.body.user_id);
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
      res.json(
        (await Promise.all(accessTokens
          .map(async token => {
            const accountsResponse = await client.accountsGet({
              access_token: token,
            });
            return accountsResponse.data.accounts.map(account => {
              // console.log(account)
              return {
                id: account.account_id,
                name: account.name,
                official_name: account.official_name,
                available_balance: account.balances.available,
                current_balance: account.balances.current,
                type: account.subtype
              }
            })
          })
        )).flat()
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
      res.json(
        (await Promise.all((await getAccessTokens(req))
          .map(async token => {
            return (await client.transactionsSync({
              access_token: token,
              count: 10
            })).data.added
              .filter((transaction: Transaction) => accountId.length == 0 || transaction.account_id === accountId)
              .map(tranasction => {
                // console.log(tranasction)
                return {
                  name: tranasction.merchant_name ?? tranasction.name,
                  time: tranasction.date,
                  amount: tranasction.amount
                };
              })
          })
        )).flat()
      )
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
          return (await client.transactionsSync({
            access_token: token,
            count: 10
          })).data.added
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

async function getAccessTokens(req: Request): Promise<string[]> {
  const userId = req.get("User-Id") ?? ""
  const doc = await db.collection('access_tokens').doc(userId).get();
  if (!doc.exists) {
    console.log('No such document!');
  } else {
    console.log('With tokens:', doc.data());
  }
  return (doc.data() ?? {})['tokens']
}

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
