/*
server.js – Configures the Plaid client and uses Express to defines routes that call Plaid endpoints in the Sandbox environment.
Utilizes the official Plaid node.js client library to make calls to the Plaid API.
*/
import dotenv from "dotenv";
import express, {
  ErrorRequestHandler,
  Request,
  Response,
  Application,
  NextFunction,
} from "express";
import bodyParser from "body-parser";
import {
  AccountBase,
  PlaidError,
  Transaction,
} from "plaid";
import cors from "cors";
import moment from "moment";
import { exchangeToken, getPlaidLinkToken } from "./plaid";
import { getAccessTokens, getAllAccounts, storeAccessToken, storeTransactions, UserTransactionEntry } from "./firebase";

dotenv.config();
export const app: Application = express();

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

//Creates a Link token and return it
app.get(
  "/api/create_link_token",
  async (req: Request, res: Response, next: NextFunction) => {
    console.log("create link token request")
    try {
      const tokenResponse = await getPlaidLinkToken(getUserId(req));
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
      const exchangeResponse = await exchangeToken(req.body.public_token);
      await storeAccessToken(exchangeResponse.data.access_token, getUserId(req));
      console.log("stored access token: " + exchangeResponse.data.access_token);
      res.json(true)
    } catch (error) {
      console.log(error)
      next(error);
    }
  }
);

// app.post(
//   "/api/add_access_token",
//   async (req: Request, res: Response, next: NextFunction) => {
//     try {
//       const docRef = accessTokenCollection.doc(req.body.user_id);
//       // Atomically add a new region to the "regions" array field.
//       // const unionRes = await docRef.update({
//       //   tokens: FieldValue.arrayUnion('greater_virginia')
//       // });
//       await docRef.set({
//         tokens: FieldValue.arrayUnion('token')
//       }, {
//         merge: true
//       });
//       res.json(true)
//     } catch (error) {
//       console.log("error")
//       next(error);
//     }
//   }
// );

app.get(
  "/api/accounts",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accessTokens = await getAccessTokens(getUserId(req));
      if (!accessTokens || accessTokens.length == 0) {
        console.log("No access tokens")
        res.json([])
        return
      }
      console.log("received accounts request");
      var allAccounts: AccountBase[] = await getAllAccounts(accessTokens, getUserId(req));
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
      var userTransEntry = await storeTransactions(start, end, getUserId(req));
      if (!userTransEntry) {
        res.json([])
      }
      else {
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
              date: transaction.date,
              amount: transaction.amount,
              name: transaction.name,
              category: transaction.personal_finance_category?.primary,
              detailed_category: transaction.personal_finance_category?.detailed,
              category_logo_url: transaction.personal_finance_category_icon_url,
              cp_name: transaction.counterparties?.at(0)?.name,
              cp_logo_url: transaction.counterparties?.at(0)?.logo_url,
              merchant: transaction.merchant_name,
              logo_url: transaction.logo_url,
            };
          }))
      }
    } catch (error) {
      next(error);
    }
  }
);

// app.get("/api/transaction_categories",
//   async (req: Request, res: Response, next: NextFunction) => {
//     try {
//       const accountId: String = req.get("Account-Id") ?? "";
//       res.json(Array.from((await Promise.all((await getAccessTokens(req))
//         .map(async (token) => {
//           const data = (await client.transactionsSync({
//             access_token: token,
//             count: 500
//           })).data;
//           return [...data.added, ...data.modified]
//             .filter((transaction: Transaction) => accountId.length == 0 || transaction.account_id === accountId)
//             .map(tranasction => {
//               console.log(tranasction);
//               return {
//                 category: tranasction.personal_finance_category?.primary,
//                 amount: tranasction.amount,
//               };
//             });
//         }))
//       ).flat().reduce((accum, value) => accum.set(value.category, (accum.get(value.category) ?? 0) + value.amount), new Map()), ([category, amount]) => ({ category, amount })));
//     } catch (error) {
//       next(error);
//     }
//   }
// );

type PotentialPlaidError = Error & {
  response?: {
    data?: any;
  };
};

const errorHandler: ErrorRequestHandler = (
  err: PotentialPlaidError,
  req: Request,
  res: Response) => {
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

function getUserId(req: Request): string {
  return req.get("User-Id") ?? "default";
}

export const server = app.listen(process.env.PORT || 8080);
