import type { components } from './schema'

type Schemas = components['schemas']

export type User = Schemas['UserRead']
export type Workspace = Schemas['WorkspaceRead']
export type Account = Schemas['AccountRead']
export type Transaction = Schemas['TransactionRead']
export type TransactionCreate = Schemas['TransactionCreate']
export type TransactionUpdate = Schemas['TransactionUpdate']
export type PaginatedTransactions = Schemas['PaginatedTransactions']
export type Category = Schemas['CategoryRead']
export type CategoryGroup = Schemas['CategoryGroupRead']
export type BudgetVsActual = Schemas['BudgetVsActual']
export type Report = Schemas['ReportResponse']
export type DashboardSummary = Schemas['DashboardSummary']
export type TokenResponse = Schemas['TokenResponse']
export type TwoFactorChallenge = Schemas['TwoFactorChallengeResponse']
export type Session = Schemas['SessionRead']

/** Workspace roles that may not write (`403 Read-only role`). */
export const READ_ONLY_ROLES = new Set(['viewer'])
