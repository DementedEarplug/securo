// One file per feature area keeps the bundles reviewable as the app grows.
// Add a namespace here and in both languages; locales.test.ts checks parity.
import enAccounts from './en/accounts.json'
import enAccountTypes from './en/accountTypes.json'
import enAdmin from './en/admin.json'
import enAgents from './en/agents.json'
import enAssets from './en/assets.json'
import enAttachments from './en/attachments.json'
import enAuth from './en/auth.json'
import enBudgets from './en/budgets.json'
import enCategories from './en/categories.json'
import enCommon from './en/common.json'
import enConnections from './en/connections.json'
import enData from './en/data.json'
import enErrors from './en/errors.json'
import enGoals from './en/goals.json'
import enGroups from './en/groups.json'
import enImport from './en/import.json'
import enInvoices from './en/invoices.json'
import enMore from './en/more.json'
import enPayees from './en/payees.json'
import enRecurring from './en/recurring.json'
import enReports from './en/reports.json'
import enRoles from './en/roles.json'
import enRules from './en/rules.json'
import enSettings from './en/settings.json'
import enTransactions from './en/transactions.json'
import ptAccounts from './pt-BR/accounts.json'
import ptAccountTypes from './pt-BR/accountTypes.json'
import ptAdmin from './pt-BR/admin.json'
import ptAgents from './pt-BR/agents.json'
import ptAssets from './pt-BR/assets.json'
import ptAttachments from './pt-BR/attachments.json'
import ptAuth from './pt-BR/auth.json'
import ptBudgets from './pt-BR/budgets.json'
import ptCategories from './pt-BR/categories.json'
import ptCommon from './pt-BR/common.json'
import ptConnections from './pt-BR/connections.json'
import ptData from './pt-BR/data.json'
import ptErrors from './pt-BR/errors.json'
import ptGoals from './pt-BR/goals.json'
import ptGroups from './pt-BR/groups.json'
import ptImport from './pt-BR/import.json'
import ptInvoices from './pt-BR/invoices.json'
import ptMore from './pt-BR/more.json'
import ptPayees from './pt-BR/payees.json'
import ptRecurring from './pt-BR/recurring.json'
import ptReports from './pt-BR/reports.json'
import ptRoles from './pt-BR/roles.json'
import ptRules from './pt-BR/rules.json'
import ptSettings from './pt-BR/settings.json'
import ptTransactions from './pt-BR/transactions.json'

export const en = {
  accounts: enAccounts,
  accountTypes: enAccountTypes,
  admin: enAdmin,
  agents: enAgents,
  assets: enAssets,
  attachments: enAttachments,
  auth: enAuth,
  budgets: enBudgets,
  categories: enCategories,
  common: enCommon,
  connections: enConnections,
  data: enData,
  errors: enErrors,
  goals: enGoals,
  groups: enGroups,
  import: enImport,
  invoices: enInvoices,
  more: enMore,
  payees: enPayees,
  recurring: enRecurring,
  reports: enReports,
  roles: enRoles,
  rules: enRules,
  settings: enSettings,
  transactions: enTransactions,
}

export const ptBR: typeof en = {
  accounts: ptAccounts,
  accountTypes: ptAccountTypes,
  admin: ptAdmin,
  agents: ptAgents,
  assets: ptAssets,
  attachments: ptAttachments,
  auth: ptAuth,
  budgets: ptBudgets,
  categories: ptCategories,
  common: ptCommon,
  connections: ptConnections,
  data: ptData,
  errors: ptErrors,
  goals: ptGoals,
  groups: ptGroups,
  import: ptImport,
  invoices: ptInvoices,
  more: ptMore,
  payees: ptPayees,
  recurring: ptRecurring,
  reports: ptReports,
  roles: ptRoles,
  rules: ptRules,
  settings: ptSettings,
  transactions: ptTransactions,
}
