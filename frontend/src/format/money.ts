import { MISSING } from "../api/expense";

/**
 * An amount for display: grouping and 2 decimals in the browser's locale (or `locale`), with the
 * currency symbol only when `currency` (an ISO 4217 code such as PHP) is given. Display only:
 * amounts are stored as plain numbers. Form values keep using `formatAmount`.
 */
export function formatMoney(amount: number | null, currency?: string, locale?: string): string {
  if (amount === null) return MISSING;
  const decimals = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  if (currency) {
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
    } catch {
      // not a currency code this browser knows: show the plain number
    }
  }
  return new Intl.NumberFormat(locale, decimals).format(amount);
}
