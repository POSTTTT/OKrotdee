/** Checks applied where data enters the system. */

export class ValidationError extends Error {}

/** Return the cleaned 13-digit Thai national ID, or throw. */
export function thaiId(value: string): string {
  const text = String(value).replace(/[-\s]/g, "");
  if (!/^\d{13}$/.test(text)) throw new ValidationError("err_thai_id_digits");

  let total = 0;
  for (let i = 0; i < 12; i++) total += Number(text[i]) * (13 - i);
  if (((11 - (total % 11)) % 10) !== Number(text[12])) {
    throw new ValidationError("err_thai_id_checksum");
  }
  return text;
}

/** Throw if a payment amount or date is not acceptable. */
export function payment(amountSatang: number, paidOn: string, today: string): void {
  if (amountSatang <= 0) {
    throw new ValidationError("err_payment_amount_positive");
  }
  if (paidOn > today) {
    throw new ValidationError("err_payment_date_future");
  }
}
