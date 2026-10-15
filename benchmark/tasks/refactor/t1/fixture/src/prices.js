/** Price with 20% VAT, rounded to cents. */
export function withVat(amountEur) {
  const taxed = amountEur * 1.2;
  return Math.round(taxed * 100) / 100;
}

/** Price with 8% sales tax, rounded to cents. */
export function withSalesTax(amountUsd) {
  const taxed = amountUsd * 1.08;
  return Math.round(taxed * 100) / 100;
}
