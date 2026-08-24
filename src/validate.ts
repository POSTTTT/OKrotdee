/** Checks applied where data enters the system. */

export class ValidationError extends Error {}

/** Return the cleaned 13-digit Thai national ID, or throw. */
export function thaiId(value: string): string {
  const text = String(value).replace(/[-\s]/g, "");
  if (!/^\d{13}$/.test(text)) throw new ValidationError("Thai ID must be 13 digits");

  let total = 0;
  for (let i = 0; i < 12; i++) total += Number(text[i]) * (13 - i);
  if (((11 - (total % 11)) % 10) !== Number(text[12])) {
    throw new ValidationError("Thai ID checksum is wrong");
  }
  return text;
}

/** Throw if a payment amount or date is not acceptable. */
export function payment(amountSatang: number, paidOn: string, today: string): void {
  if (amountSatang <= 0) {
    throw new ValidationError("Payment amount must be greater than zero");
  }
  if (paidOn > today) {
    throw new ValidationError("Payment date cannot be in the future");
  }
}
