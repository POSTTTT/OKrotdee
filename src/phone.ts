/**
 * Thai numbers read in groups, and the staff should not have to type the
 * hyphens for them to appear: 0992549191 shows as 099-254-9191, and a Bangkok
 * landline 021234567 as 02-123-4567. Anything else — a foreign number, an
 * extension, a note — is left exactly as it was entered.
 */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== raw.trim().length) return raw.trim();
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  return raw.trim();
}

/** Every number held on one client, each formatted, in the order entered. */
export function phoneList(raw: string | null): string[] {
  return (raw ?? "").split("\n").filter((p) => p.trim()).map(formatPhone);
}
