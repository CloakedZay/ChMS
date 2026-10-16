// Which ledger entries count in a total (balance, income, expenses, fund
// balances, reports): every entry as soon as it's saved, except voided
// ones, which stay in the ledger but never count. The Finance page's totals
// apply the same rule in the database (db/069 finance_summary).
export function countsInTotals(tx) {
  return tx.status !== 'Void'
}
