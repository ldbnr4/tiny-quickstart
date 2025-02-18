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
  InvestmentsHoldingsGetResponse,
  InvestmentTransaction,
  PlaidError,
  Transaction,
} from "plaid";
import cors from "cors";
import moment from "moment";
import { exchangeToken, getAllAccounts, getAllTransactions, getCategories, getInstitution, getInvestments, getInvetmentTransactions, getPlaidLinkToken, sandboxItemResetLogin } from "./plaid";
import { deleteDbTransactions, deleteDbAccounts, getDbAccessTokens, getDbAccounts, getDbTransactions, storeAccessToken, storeAccounts, storeTransactions, getDbInvestments, storeInvestments, deleteDbInvestments, getDbInvestmentTransactions, storeInvestmentTransactions, storeCryptoBalances, getDbCryptoBalances, deleteDbCryptoBalances, getTroubledTokens, deleteAllTroubledTokens, checkForExistingInstitutionLink } from "./firebase";
import { UserInvestmentTransactionEntry, UserTransactionEntry } from './transaction';
import { AccountLinkResponse, AccountResponse } from "./account_link";
import { removeAndDeleteAccessTokens, testFun } from "./middleware";
import { isAddress } from "web3-validator";
import { getTokens } from "./crypto";
import { trainClassifier } from "./transaction_classifier";
import { TroubledToken } from './token';
import { ApiResponse } from "./response";

dotenv.config();
export const app: Application = express();

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

type PotentialPlaidError = Error & {
  response?: {
    data?: any;
  };
};

const errorHandler: ErrorRequestHandler = (
  err: PotentialPlaidError,
  req: Request,
  res: Response, next: NextFunction) => {
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

app.post("/api/test", async (req: Request, res: Response, next: NextFunction) => {
  console.log("received test request");
  await testFun();
  res.json(null);
});

function getUserId(req: Request): string {
  return req.get("wealthweaver-uid") ?? "default";
}

app.get("/api/has_accounts", async (req: Request, res: Response, next: NextFunction) => {
  console.log("received accounts check request");
  const accessTokens = await getDbAccessTokens(getUserId(req));
  res.json({ hasAccounts: accessTokens.length > 0 });
});

app.get("/api/get_troubled_tokens", async (req: Request, res: Response, next: NextFunction) => {
  console.log("received troubled tokens request");
  const troubledTokens = await getTroubledTokens(getUserId(req));
  res.json(troubledTokens);
});

app.put("/api/reset_login", async (req: Request, res: Response, next: NextFunction) => {
  console.log("received reset login request");
  const accessToken = req.body['wealthweaver-at'] as string | undefined;
  if (!accessToken) {
    next(new Error("No access token provided"));
    return;
  }
  if (process.env.PLAID_ENV == 'sandbox') {
    await sandboxItemResetLogin(accessToken);
  }
  res.json(null);
});

//Creates a Link token and return it
app.get("/api/create_link_token", async (req: Request, res: Response, next: NextFunction) => {
  console.log("create link token request")
  try {
    const uid = getUserId(req);
    const accessToken = req.query['wealthweaver-at'] as string | undefined;
    if (!accessToken) {
      console.log("No access token provided")
      // next(new Error("No access token provided"));
      // return;
    }
    const tokenResponse = await getPlaidLinkToken(uid, accessToken);
    res.json(tokenResponse.data);
  } catch (error) {
    console.log(error)
    next(error);
  }
}
);

// Exchanges the public token from Plaid Link for an access token
app.post("/api/exchange_public_token", async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log("exchange token request")
    const institutionId = req.body.institution_id;
    const userId = getUserId(req);
    if (await checkForExistingInstitutionLink(userId, institutionId)) {
      console.log("Institution already linked")
      res.json(false)
      return
    }
    const exchangeResponse = await exchangeToken(req.body.public_token);
    await storeAccessToken(userId, institutionId, exchangeResponse.data.access_token);
    console.log("stored access token: " + exchangeResponse.data.access_token);
    res.json(true)
  } catch (error) {
    console.log(error)
    next(error);
  }
});

app.get("/api/accounts", async (req: Request, res: Response, next: NextFunction) => {
  console.log("received accounts request");
  try {
    const userId = getUserId(req);
    var allAccounts = await getDbAccounts(userId);
    var troubledLinks: TroubledToken[] = [];
    if (allAccounts.length == 0 || req.query.refresh == "true") {
      console.log("Getting account from Plaid: no_accounts=" + (allAccounts.length == 0) + ", refresh=" + req.query.refresh)
      if (req.query.refresh) {
        allAccounts = []
      }
      await getAllAccounts(userId, await getDbAccessTokens(userId), allAccounts, troubledLinks)
      if (allAccounts.length > 0) {
        await storeAccounts(userId, allAccounts)
      }
    }
    res.json({
      failures: troubledLinks, data: await Promise.all(allAccounts.map(async accountLink => {
        return {
          name: accountLink.name,
          institution_id: accountLink.institution_id,
          institution_logo: (await getInstitution(accountLink.institution_id)).logo ?? "",
          url: accountLink.url,
          accounts: accountLink.accounts.map(account => {
            return {
              id: account.account_id,
              name: account.name,
              official_name: account.official_name,
              available_balance: account.balances.available,
              current_balance: account.balances.current,
              type: account.type,
              sub_type: account.subtype,
              asset_class: account.asset_class,
              institution_id: accountLink.institution_id,
            } as AccountResponse
          }) as AccountResponse[]
        } as AccountLinkResponse
      })
      ) as AccountLinkResponse[]
    } as ApiResponse<AccountLinkResponse[]>)
  } catch (error) {
    console.log(error);
    next(error);
  }
});

app.post("/api/train_classifier", async (req: Request, res: Response, next: NextFunction) => {
  console.log("received train classifier request");
  try {
    const userId = getUserId(req);
    const results = await getAllTransactions(userId, await getDbAccessTokens(userId), moment().subtract(365, 'days').format('YYYY-MM-DD'), moment().format('YYYY-MM-DD'));
    if (!results) {
      console.log("Failed to get user transactions")
      next(new Error("Failed to get user transactions"));
      return;
    }
    trainClassifier(results.data.transactions);
  } catch (error) {
    console.log(error);
    next(error);
  }
});

app.get("/api/transactions", async (req: Request, res: Response, next: NextFunction) => {
  console.log("received transactions request");
  try {
    const accountId = req.get("Account-Id") ?? ""
    const category = req.get("Category") ?? ""
    const start = req.query.startDate === undefined || req.query.startDate.length == 0 ? moment().subtract(30, 'days').format('YYYY-MM-DD') : String(req.query.startDate);
    const end = req.query.endDate === undefined || req.query.endDate.length == 0 ? moment().format('YYYY-MM-DD') : String(req.query.endDate);
    const userId = getUserId(req);
    const results: ApiResponse<UserTransactionEntry> = await _getUserTransactions(
      userId, start, end, req.query.refresh == "true" ? true : false);
    if (!results) {
      console.log("Failed to get user transactions")
      next(new Error("Failed to get user transactions"));
      return;
    }
    else {
      res.json({
        data: results.data.transactions
          .filter((transaction: Transaction) =>
            (accountId.length == 0 || transaction.account_id === accountId)
            && (category.length == 0 || transaction.personal_finance_category?.primary === category)
            && new Date(transaction.date).getTime() >= new Date(start).getTime()
            && new Date(transaction.date).getTime() <= new Date(end).getTime()
          )
          // .sort((a: Transaction, b: Transaction) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .map(transaction => {
            // console.log(tranasction)
            return {
              id: transaction.transaction_id,
              accountId: transaction.account_id,
              date: transaction.date,
              amount: transaction.amount,
              name: transaction.name,
              category: transaction.xCategory,
              pf_category: transaction.personal_finance_category?.primary,
              detailed_category: transaction.personal_finance_category?.detailed,
              category_logo_url: transaction.personal_finance_category_icon_url,
              cp_name: transaction.counterparties?.at(0)?.name,
              cp_logo_url: transaction.counterparties?.at(0)?.logo_url,
              merchant: transaction.merchant_name,
              logo_url: transaction.logo_url,
            };
          }), failures: results.failures
      } as ApiResponse<any>);
    }
  } catch (error) {
    console.log(error);
    next(error);
  }
});

async function _getUserTransactions(userId: string, start: string, end: string, refresh: boolean): Promise<ApiResponse<UserTransactionEntry>> {
  console.log("Getting user transactions with refresh: " + refresh);
  var result: ApiResponse<UserTransactionEntry>;
  const userTransactions = (await getDbTransactions(userId));
  if (userTransactions) {
    console.log("User has transactions on record");
    const updateStart = new Date(start).getTime() < new Date(userTransactions.startDate).getTime();
    const updateEnd = new Date(end).getTime() > new Date(userTransactions.endDate).getTime();
    if (refresh || updateStart || updateEnd) {
      console.log("Updating transactions")
      if (updateStart) userTransactions.startDate = start;
      if (updateEnd) userTransactions.endDate = end;
      result = await getAndStoreTransactions(userId, start, end);
    } else {
      result = { data: userTransactions as UserTransactionEntry, failures: [] } as ApiResponse<UserTransactionEntry>;
    }
  } else {
    console.log("No user transactions on record");
    result = await getAndStoreTransactions(userId, start, end);
  }
  return result;
}

async function getAndStoreTransactions(userId: string, start: string, end: string) {
  const result = await getAllTransactions(userId, await getDbAccessTokens(userId), start, end);
  if (!result || !result.data || result.data.transactions.length == 0) {
    return { data: {} as UserTransactionEntry, failures: [] };
  }
  await storeTransactions(userId, result.data);
  return result;
}

app.get("/api/crypto_balances", async (req: Request, res: Response, next: NextFunction) => {
  const userId = getUserId(req);
  try {
    const balances = await getDbCryptoBalances(userId);
    if (!balances) {
      res.json(false);
      return;
    }
    if (balances.last_updated && moment().diff(moment(balances.last_updated), 'hours') < 24
      || (req.query.refresh ?? false)) {
      res.json(balances);
    } else {
      const newBalances = await getTokens(balances.address);
      await storeCryptoBalances(userId, balances.address, newBalances);
      res.json(newBalances);
    }
  } catch (error) {
    console.log(error);
    next(error);
  }
});

app.post("/api/store_crypto_address", async (req: Request, res: Response, next: NextFunction) => {
  const userId = getUserId(req);
  const walletAddress = req.body.address;

  if (!isAddress(walletAddress)) {
    return res.status(400).json({ error: "Invalid wallet address" });
  }

  try {
    await storeCryptoBalances(userId, walletAddress, await getTokens(walletAddress));
    res.json(true);
  } catch (error) {
    console.log(error);
    next(error);
  }
});

app.get("/api/investments", async (req: Request, res: Response, next: NextFunction) => {
  console.log("received investments request");
  try {
    const userId = getUserId(req);
    var allInvestments: InvestmentsHoldingsGetResponse[] = await getDbInvestments(userId);
    if (allInvestments.length == 0 || req.query.refresh == "true") {
      console.log("Getting investments from Plaid")
      if (req.query.refresh) {
        allInvestments = []
      }
      await Promise.all((await getDbAccessTokens(userId))
        .map(async (token) => {
          console.log("Calling plaid investments API with token: " + token)
          const investments = await getInvestments(token)
          if (investments) {
            allInvestments = [...allInvestments, investments]
          }
        })
      )
      await storeInvestments(userId, allInvestments)
    }
    return res.json(allInvestments)

  } catch (error) {
    console.log(error);
    next(error);
  }
});

app.get("/api/investment_transactions", async (req: Request, res: Response, next: NextFunction) => {
  console.log("received investment transactions request");
  try {
    const start = req.query.startDate === undefined || req.query.startDate.length == 0 ? moment().subtract(30, 'days').format('YYYY-MM-DD') : String(req.query.startDate);
    const end = req.query.endDate === undefined || req.query.endDate.length == 0 ? moment().format('YYYY-MM-DD') : String(req.query.endDate);
    const userId = getUserId(req);
    const userInvestmentTransEntry = await _getInvetmentTransactions(
      userId, start, end, req.query.refresh == "true" ? true : false);
    if (!userInvestmentTransEntry) {
      console.log("Failed to get user investment transactions")
      res.json([])
    }
    else {
      res.json(userInvestmentTransEntry.transactions
        .filter((transaction: InvestmentTransaction) =>
          new Date(transaction.date).getTime() >= new Date(start).getTime()
          && new Date(transaction.date).getTime() <= new Date(end).getTime()
        )
        .map(transaction => {
          // console.log(tranasction)
          return {
            id: transaction.investment_transaction_id,
            accountId: transaction.account_id,
            date: transaction.date,
            amount: transaction.amount,
            name: transaction.name,
            type: transaction.type,
            quantity: transaction.quantity,
            price: transaction.price,
          };
        }))
    }
  } catch (error) {
    console.log(error);
    next(error);
  }
});

app.get("/api/token_values", async (req: Request, res: Response, next: NextFunction) => {
  const address = req.query.address as string;
  if (!isAddress(address)) {
    return res.status(400).json({ error: "Invalid address" });
  }

  try {
    res.json(await getTokens(address));
  } catch (error) {
    console.log(error);
    next(error);
  }
});

app.post("/api/reset", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    console.log(`Resetting data for user: ${userId}`);
    await Promise.all([
      (req.body.accounts ?? true) && deleteDbAccounts(userId),
      (req.body.transactions ?? true) && deleteDbTransactions(userId),
      (req.body.investments ?? true) && deleteDbInvestments(userId),
      (req.body.tokens ?? true) && removeAndDeleteAccessTokens(userId),
      (req.body.crypto ?? true) && deleteDbCryptoBalances(userId),
      (req.body.troubled ?? true) && deleteAllTroubledTokens(userId),
    ].filter(Boolean) as Promise<void>[]);
    res.json({ success: true });
  } catch (error) {
    console.log(error);
    next(error);
  }
}
);

app.get("/api/transaction_categories", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await getCategories());
  } catch (error) {
    console.log(error);
    next(error);
  }
});

async function _getInvetmentTransactions(userId: string, start: string, end: string, refresh: boolean): Promise<UserInvestmentTransactionEntry | undefined> {
  var userInvestmentTransEntry: UserInvestmentTransactionEntry | undefined;
  const userInvestmentTransactions = (await getDbInvestmentTransactions(userId));
  if (userInvestmentTransactions) {
    console.log("User has investment transactions on record");
    const updateStart = new Date(start).getTime() < new Date(userInvestmentTransactions.startDate).getTime();
    const updateEnd = new Date(end).getTime() > new Date(userInvestmentTransactions.endDate).getTime();
    if (refresh || updateStart || updateEnd) {
      console.log("Updating investment transactions")
      if (updateStart) userInvestmentTransactions.startDate = start;
      if (updateEnd) userInvestmentTransactions.endDate = end;
      userInvestmentTransEntry = await getInvetmentTransactions(await getDbAccessTokens(userId), start, end);
      if (userInvestmentTransEntry) {
        await storeInvestmentTransactions(userId, userInvestmentTransEntry);
      } else {
        console.log("Did not store investment transactions")
      }
    } else {
      userInvestmentTransEntry = userInvestmentTransactions as UserInvestmentTransactionEntry;
    }
  } else {
    console.log("No user investment transactions on record");
    userInvestmentTransEntry = await getInvetmentTransactions(await getDbAccessTokens(userId), start, end);
    if (userInvestmentTransEntry) {
      await storeInvestmentTransactions(userId, userInvestmentTransEntry);
    } else {
      console.log("Did not store investment transactions")
    }
  }
  return userInvestmentTransEntry;
}

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

export const server = app.listen(process.env.PORT || 8080);
