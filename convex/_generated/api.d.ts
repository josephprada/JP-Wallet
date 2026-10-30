/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as agentGateway from "../agentGateway.js";
import type * as apiAudit from "../apiAudit.js";
import type * as apiTokens from "../apiTokens.js";
import type * as attachments from "../attachments.js";
import type * as auth from "../auth.js";
import type * as budgets from "../budgets.js";
import type * as categories from "../categories.js";
import type * as creditCapitalAbonos from "../creditCapitalAbonos.js";
import type * as creditDestinations from "../creditDestinations.js";
import type * as creditFundContext from "../creditFundContext.js";
import type * as creditPaymentContext from "../creditPaymentContext.js";
import type * as creditPayments from "../creditPayments.js";
import type * as credits from "../credits.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as devLogin from "../devLogin.js";
import type * as fixedExpenseContext from "../fixedExpenseContext.js";
import type * as fixedExpenses from "../fixedExpenses.js";
import type * as http from "../http.js";
import type * as lib_accounts from "../lib/accounts.js";
import type * as lib_apiScopes from "../lib/apiScopes.js";
import type * as lib_apiTokenAuth from "../lib/apiTokenAuth.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_balance from "../lib/balance.js";
import type * as lib_creditAbonoReplay from "../lib/creditAbonoReplay.js";
import type * as lib_creditAmortization from "../lib/creditAmortization.js";
import type * as lib_creditCategories from "../lib/creditCategories.js";
import type * as lib_creditDates from "../lib/creditDates.js";
import type * as lib_creditFixedExpense from "../lib/creditFixedExpense.js";
import type * as lib_creditFundSpend from "../lib/creditFundSpend.js";
import type * as lib_creditPaymentEdit from "../lib/creditPaymentEdit.js";
import type * as lib_creditPaymentRegistration from "../lib/creditPaymentRegistration.js";
import type * as lib_creditProfile from "../lib/creditProfile.js";
import type * as lib_creditRecalc from "../lib/creditRecalc.js";
import type * as lib_creditTransactions from "../lib/creditTransactions.js";
import type * as lib_creditsHelpers from "../lib/creditsHelpers.js";
import type * as lib_fixedExpensePaymentDate from "../lib/fixedExpensePaymentDate.js";
import type * as lib_fixedExpensePayments from "../lib/fixedExpensePayments.js";
import type * as lib_fixedExpensePeriod from "../lib/fixedExpensePeriod.js";
import type * as lib_fixedExpenseTransaction from "../lib/fixedExpenseTransaction.js";
import type * as lib_fixedExpenseUpcoming from "../lib/fixedExpenseUpcoming.js";
import type * as lib_fixedExpenses from "../lib/fixedExpenses.js";
import type * as lib_notifications from "../lib/notifications.js";
import type * as lib_period from "../lib/period.js";
import type * as lib_personalFinance from "../lib/personalFinance.js";
import type * as lib_preferences from "../lib/preferences.js";
import type * as lib_reports from "../lib/reports.js";
import type * as lib_savingsGoalAbono from "../lib/savingsGoalAbono.js";
import type * as lib_savingsGoalFixedExpense from "../lib/savingsGoalFixedExpense.js";
import type * as lib_savingsGoalTransaction from "../lib/savingsGoalTransaction.js";
import type * as lib_taxCategories from "../lib/taxCategories.js";
import type * as lib_taxSuggest from "../lib/taxSuggest.js";
import type * as lib_taxTotals from "../lib/taxTotals.js";
import type * as lib_transactions from "../lib/transactions.js";
import type * as lib_validators from "../lib/validators.js";
import type * as migrations from "../migrations.js";
import type * as notificationActions from "../notificationActions.js";
import type * as notifications from "../notifications.js";
import type * as reports from "../reports.js";
import type * as savingsContributions from "../savingsContributions.js";
import type * as savingsGoals from "../savingsGoals.js";
import type * as seed from "../seed.js";
import type * as taxDocuments from "../taxDocuments.js";
import type * as taxItems from "../taxItems.js";
import type * as taxSuggestions from "../taxSuggestions.js";
import type * as transactions from "../transactions.js";
import type * as userPreferences from "../userPreferences.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  agentGateway: typeof agentGateway;
  apiAudit: typeof apiAudit;
  apiTokens: typeof apiTokens;
  attachments: typeof attachments;
  auth: typeof auth;
  budgets: typeof budgets;
  categories: typeof categories;
  creditCapitalAbonos: typeof creditCapitalAbonos;
  creditDestinations: typeof creditDestinations;
  creditFundContext: typeof creditFundContext;
  creditPaymentContext: typeof creditPaymentContext;
  creditPayments: typeof creditPayments;
  credits: typeof credits;
  crons: typeof crons;
  dashboard: typeof dashboard;
  devLogin: typeof devLogin;
  fixedExpenseContext: typeof fixedExpenseContext;
  fixedExpenses: typeof fixedExpenses;
  http: typeof http;
  "lib/accounts": typeof lib_accounts;
  "lib/apiScopes": typeof lib_apiScopes;
  "lib/apiTokenAuth": typeof lib_apiTokenAuth;
  "lib/auth": typeof lib_auth;
  "lib/balance": typeof lib_balance;
  "lib/creditAbonoReplay": typeof lib_creditAbonoReplay;
  "lib/creditAmortization": typeof lib_creditAmortization;
  "lib/creditCategories": typeof lib_creditCategories;
  "lib/creditDates": typeof lib_creditDates;
  "lib/creditFixedExpense": typeof lib_creditFixedExpense;
  "lib/creditFundSpend": typeof lib_creditFundSpend;
  "lib/creditPaymentEdit": typeof lib_creditPaymentEdit;
  "lib/creditPaymentRegistration": typeof lib_creditPaymentRegistration;
  "lib/creditProfile": typeof lib_creditProfile;
  "lib/creditRecalc": typeof lib_creditRecalc;
  "lib/creditTransactions": typeof lib_creditTransactions;
  "lib/creditsHelpers": typeof lib_creditsHelpers;
  "lib/fixedExpensePaymentDate": typeof lib_fixedExpensePaymentDate;
  "lib/fixedExpensePayments": typeof lib_fixedExpensePayments;
  "lib/fixedExpensePeriod": typeof lib_fixedExpensePeriod;
  "lib/fixedExpenseTransaction": typeof lib_fixedExpenseTransaction;
  "lib/fixedExpenseUpcoming": typeof lib_fixedExpenseUpcoming;
  "lib/fixedExpenses": typeof lib_fixedExpenses;
  "lib/notifications": typeof lib_notifications;
  "lib/period": typeof lib_period;
  "lib/personalFinance": typeof lib_personalFinance;
  "lib/preferences": typeof lib_preferences;
  "lib/reports": typeof lib_reports;
  "lib/savingsGoalAbono": typeof lib_savingsGoalAbono;
  "lib/savingsGoalFixedExpense": typeof lib_savingsGoalFixedExpense;
  "lib/savingsGoalTransaction": typeof lib_savingsGoalTransaction;
  "lib/taxCategories": typeof lib_taxCategories;
  "lib/taxSuggest": typeof lib_taxSuggest;
  "lib/taxTotals": typeof lib_taxTotals;
  "lib/transactions": typeof lib_transactions;
  "lib/validators": typeof lib_validators;
  migrations: typeof migrations;
  notificationActions: typeof notificationActions;
  notifications: typeof notifications;
  reports: typeof reports;
  savingsContributions: typeof savingsContributions;
  savingsGoals: typeof savingsGoals;
  seed: typeof seed;
  taxDocuments: typeof taxDocuments;
  taxItems: typeof taxItems;
  taxSuggestions: typeof taxSuggestions;
  transactions: typeof transactions;
  userPreferences: typeof userPreferences;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
