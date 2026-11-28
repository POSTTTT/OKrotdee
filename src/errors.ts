/**
 * Error codes and the program's log. Every message the staff see for a
 * failure carries a code, so a report over the phone ("it says E4002") points
 * straight at the cause, and the log file says what happened around it.
 *
 * A code, once given, never changes or moves to another error: old reports and
 * old log files must keep meaning the same thing. New errors take the next
 * free number in their group.
 */
import { error as logErrorLine, info as logInfoLine, warn as logWarnLine } from "@tauri-apps/plugin-log";

export const ERROR_CODES: Record<string, string> = {
  // 1xxx clients
  err_name_required: "E1001",
  err_thai_id_digits: "E1002",
  err_thai_id_checksum: "E1003",
  err_thai_id_taken: "E1004",
  err_client_has_contracts: "E1005",
  err_client_already_on_contract: "E1006",
  // 2xxx cars
  err_brand_required: "E2001",
  err_plate_taken: "E2002",
  err_mileage: "E2003",
  err_car_has_contracts: "E2004",
  err_car_not_available: "E2005",
  err_car_has_active_contract: "E2006",
  // 3xxx contracts
  err_choose_client_car: "E3001",
  err_choose_first_due_date: "E3002",
  err_due_day_range: "E3003",
  err_installment_amount_positive: "E3004",
  err_installment_min_one: "E3005",
  err_no_such_contract: "E3006",
  err_rules_invalid: "E3007",
  // 4xxx money
  err_payment_amount_positive: "E4001",
  err_payment_date_future: "E4002",
  err_invalid_amount: "E4003",
  // 5xxx data, files and updates
  err_data_folder_missing: "E5001",
  err_backup_failed: "E5002",
  err_import_date: "E5003",
  err_import_number: "E5004",
  err_update_failed: "E5005",
};

/** Not one of ours: a database, file or runtime failure, passed on as it is. */
export const UNEXPECTED = "E9000";
/** A screen threw while drawing. */
export const RENDER_CRASH = "E9001";
/** Work started by a button or a load failed and nothing caught it. */
export const UNHANDLED = "E9002";

// Writing the log must never become a failure of its own: outside the app
// (tests, a plain browser) there is no log to write to.
const quietly = (write: (line: string) => Promise<void>) => (line: string) => {
  try {
    write(line).catch(() => {});
  } catch {
    // No log available here.
  }
};
export const logInfo = quietly(logInfoLine);
export const logWarn = quietly(logWarnLine);
const logErrorText = quietly(logErrorLine);

/** Write a failure to the log under its code, with the stack when there is one. */
export function logError(code: string, e: unknown): void {
  console.error(code, e);
  const detail = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
  logErrorText(`${code} ${detail}`);
}

/** One of our message keys, translated, with its code after it. */
export function errorText(key: string, t: (key: string) => string): string {
  const code = ERROR_CODES[key];
  return code ? `${t(key)} (${code})` : t(key);
}

/**
 * What to show for a caught failure, logged on the way. Our own keys are a
 * person's mistake to put right and go in as warnings; anything else is
 * unexpected and goes in as an error with its stack.
 */
export function errorMessage(e: unknown, t: (key: string) => string, code = UNEXPECTED): string {
  const message = e instanceof Error ? e.message : String(e);
  if (ERROR_CODES[message]) {
    logWarn(`${ERROR_CODES[message]} ${message}`);
    return errorText(message, t);
  }
  logError(code, e);
  return `${t("err_unexpected")} (${code}) ${message}`;
}
