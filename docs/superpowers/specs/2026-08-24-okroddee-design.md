# OKrotdee — Second-Hand Car Dealership Management System

**Date:** 2026-08-24
**Status:** Approved design, ready for implementation planning

## Purpose

Replace the dealership's Google Sheet and hand-written book with a single
local application that tracks clients, cars, installment contracts, and
payments, and that shows which contracts have fallen far enough behind to
justify repossessing the car.

## Constraints

- An installed desktop application, launched from an icon. No terminal, no
  browser tab, no localhost URL for staff to remember.
- Runs offline on the shop's computer. No internet, no hosting, no cloud
  account, no telemetry.
- Must run on both macOS and Windows.
- Small number of staff, all trusted. No user accounts or permissions.
- Currency is Thai baht. Contracts are hire-purchase style: a down payment
  followed by a fixed number of equal monthly installments.
- The staff, not the software, decide when to repossess a car.

## Success Criteria

1. A contract can be created in under a minute and its full payment schedule
   is generated automatically.
2. At any moment the dashboard answers: who owes money today, who is late,
   and whose car is eligible for repossession.
3. Any car's history — who bought it, when, what was paid, whether it was
   repossessed — is visible on one page.
4. Staff can produce a copy of the entire dataset, on demand, without
   leaving the application.
5. Staff install it by double-clicking an installer, and launch it by
   double-clicking an icon.

## Architecture

A Tauri desktop application: a React interface in a native window, backed by
a SQLite file in the operating system's application-data directory.

- **Tauri 2 + React + TypeScript + Vite.** SQLite is reached through
  `@tauri-apps/plugin-sql`.
- Every business rule lives in TypeScript. The Rust side is untouched
  boilerplate that registers plugins and opens the window, so the
  application can be maintained by someone with web skills alone.
- The database schema is created from TypeScript on first run
  (`CREATE TABLE IF NOT EXISTS`), so the schema has exactly one definition
  and no Rust migration mirrors it.
- Staff install a `.dmg` (macOS) or `.msi` (Windows) and launch from an icon.

Rationale: the deployment target is a shop computer used by staff who are
not developers. A packaged desktop application removes the terminal, the
browser, and the launch URL. Keeping the rules in TypeScript keeps the Rust
surface at zero, so the only toolchain a future maintainer needs is Node.

### File Layout

```
src/
  main.tsx            React entry point
  App.tsx             Layout, navigation, routes, language toggle
  money.ts            Satang arithmetic, schedule generation, status derivation
  validate.ts         Thai ID and payment validation
  schema.ts           The CREATE TABLE statements, as one exported string
  db.ts               Database handle and every query
  lang.ts             Thai/English label dictionary
  backup.ts           Startup backup and pruning
  app.css             All styling
  pages/              One component per screen
src-tauri/
  src/lib.rs          Plugin registration only
  tauri.conf.json     Window, bundle, and identifier configuration
  Cargo.toml
tests/
  money.test.ts       vitest suite for money.ts
  validate.test.ts    vitest suite for validate.ts
  schema.test.ts      vitest suite for schema.ts, run against better-sqlite3
```

`money.ts` and `validate.ts` hold every rule that can silently lose money
and import nothing, so they are tested in plain Node without Tauri running.

## Data Model

All monetary values are stored as **integer satang** (1 THB = 100 satang).
Floating-point money is never stored or computed. Values are formatted for
display only at the template boundary.

### clients

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| first_name | TEXT NOT NULL | |
| last_name | TEXT NOT NULL | |
| thai_id | TEXT UNIQUE | 13 digits, checksum-validated |
| phone | TEXT | |
| address | TEXT | Free text, full address |
| note | TEXT | |
| created_at | TEXT NOT NULL | ISO-8601 |

### cars

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| brand | TEXT NOT NULL | |
| series | TEXT | |
| model_year | INTEGER | |
| color | TEXT | |
| plate_number | TEXT UNIQUE | |
| registration_no | TEXT | |
| chassis_no | TEXT | |
| mileage | INTEGER | Kilometres at acquisition |
| cost_price | INTEGER | Satang. What the dealership paid |
| asking_price | INTEGER | Satang |
| status | TEXT NOT NULL | `available`, `on_contract`, `sold`, `repossessed` |
| note | TEXT | |
| created_at | TEXT NOT NULL | |

### contracts

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| client_id | INTEGER NOT NULL | FK clients |
| car_id | INTEGER NOT NULL | FK cars |
| car_price | INTEGER NOT NULL | Satang, agreed sale price |
| down_payment | INTEGER NOT NULL | Satang, may be 0 |
| installment_amount | INTEGER NOT NULL | Satang |
| installment_count | INTEGER NOT NULL | e.g. 40 |
| due_day | INTEGER NOT NULL | 1–31, e.g. 15 |
| first_due_date | TEXT NOT NULL | ISO-8601 date |
| status | TEXT NOT NULL | `active`, `completed`, `repossessed`, `cancelled` |
| note | TEXT | |
| created_at | TEXT NOT NULL | |

### installments

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| contract_id | INTEGER NOT NULL | FK contracts |
| seq | INTEGER NOT NULL | 1..installment_count |
| due_date | TEXT NOT NULL | ISO-8601 date |
| amount_due | INTEGER NOT NULL | Satang |
| late_fee | INTEGER NOT NULL DEFAULT 0 | Satang, entered by staff |

Unique on `(contract_id, seq)`.

### payments

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| installment_id | INTEGER NOT NULL | FK installments |
| paid_on | TEXT NOT NULL | ISO-8601 date |
| amount | INTEGER NOT NULL | Satang, > 0 |
| method | TEXT | `cash`, `transfer`, other |
| note | TEXT | |
| created_at | TEXT NOT NULL | |

Multiple payment rows may point at one installment. This is how partial
payments are recorded: the normal case is one payment covering the
installment exactly, but a client who pays 10,000 now and 5,400 later
produces two rows.

### car_events

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| car_id | INTEGER NOT NULL | FK cars |
| event_date | TEXT NOT NULL | ISO-8601 date |
| type | TEXT NOT NULL | `acquired`, `contract_started`, `contract_completed`, `repossessed`, `sold`, `note` |
| contract_id | INTEGER | FK contracts, nullable |
| note | TEXT | |

This table is the car's timeline. Rows are written automatically when a car
is created, when a contract starts or completes, and when a car is
repossessed or sold. Staff can also add a free-text `note` event by hand
(repairs, inspections, anything worth remembering).

## Business Rules

### Schedule Generation

When a contract is created, `installment_count` installment rows are
generated. Installment 1 falls on `first_due_date`; each subsequent
installment falls on the same day of the following month. When the target
month is too short for `due_day` (for example, day 31 in February), the due
date clamps to the last day of that month rather than failing or rolling
into the next month.

Every generated installment has `amount_due = installment_amount`. The
design does not attempt to reconcile `car_price - down_payment` against
`installment_amount * installment_count`; the difference is the dealership's
interest, and the staff type the numbers they have already agreed with the
client.

### Derived Status

No status field is stored for an installment or computed balance. Everything
is derived at read time, so no row can ever go stale:

- `paid_total(installment)` = sum of its payment amounts
- `outstanding(installment)` = `amount_due + late_fee - paid_total`
- Installment state:
  - `PAID` when `outstanding <= 0`
  - `PARTIAL` when `0 < paid_total` and `outstanding > 0`
  - `OVERDUE` when `due_date < today` and `outstanding > 0` and `paid_total == 0`
  - `UPCOMING` otherwise

The states are exclusive labels for display, and `PARTIAL` takes precedence
over `OVERDUE`: an installment that is past due and partly paid displays as
`PARTIAL`. It still counts toward `overdue_count` below, because money is
still owed on a date that has passed.
- `overdue_count(contract)` = number of installments whose `due_date` is in
  the past and whose `outstanding` is greater than zero
- Contract flag:
  - `OK` when `overdue_count == 0`
  - `OVERDUE` when `overdue_count == 1`
  - `REPOSSESS_ELIGIBLE` when `overdue_count >= 2`

When a payment is recorded and it leaves every installment on the contract
`PAID`, the contract is marked `completed`, the car is marked `sold`, and a
`contract_completed` row is written to `car_events`. A contract is marked
`cancelled` only by hand, for contracts entered in error or abandoned before
any payment; cancelling returns the car to `available`.

### Late Fees

There is no automatic late-fee formula. When recording a payment, the screen
shows how many days late the payment is, and staff type the fee they have
decided on. The fee is stored on the installment and added to what is owed.

### Repossession

`REPOSSESS_ELIGIBLE` is a warning, never an action. The application never
changes a contract's status on its own. A staff member clicks "Mark
repossessed" on the contract, which:

1. Sets `contract.status = 'repossessed'`
2. Sets `car.status = 'repossessed'`
3. Writes a `repossessed` row to `car_events`

The car can then be returned to `available` and sold again on a new
contract; its `car_events` history preserves the whole story.

### Validation

Enforced when data is entered, not merely suggested:

- Thai national ID must be 13 digits and pass the standard checksum.
- `thai_id` and `plate_number` are unique.
- Payment amount must be greater than zero.
- Payment date may not be in the future.
- A contract may only be created against a car whose status is `available`.

## Screens

1. **Dashboard** — installments due this month, overdue installments,
   contracts flagged `REPOSSESS_ELIGIBLE`, and cash collected this month.
2. **Clients** — searchable list (name, phone, Thai ID), create and edit
   forms, and a detail page listing the client's contracts.
3. **Cars** — list filtered by status, create and edit forms, and a detail
   page showing the car's event timeline and contract history.
4. **New contract** — choose a client, choose an available car, enter terms,
   preview the generated schedule, confirm.
5. **Contract detail** — the full schedule as a table: due date, amount due,
   late fee, paid, balance, state. Each row has a "record payment" action.
6. **Record payment** — date, amount (pre-filled with the outstanding
   balance), late fee (with "N days late" shown alongside), method, note.

## Internationalisation

`lang.ts` holds a dictionary of interface labels in Thai and English. The
active language is held in React state, persisted to `localStorage`, and
toggled by a link in the header. Only interface labels are translated; data entered by staff is
stored and displayed exactly as typed.

## Testing

`vitest` covers the three modules that import nothing from Tauri:

- `money.ts` — schedule generation including month-end clamping and
  multi-year contracts; satang conversion and formatting round-trips; status
  derivation for paid, partial, overdue, and upcoming installments;
  `overdueCount` and contract flag thresholds; partial payments summing to
  exactly the amount due; late fees included in the outstanding balance.
- `validate.ts` — Thai ID checksums and payment entry rules.
- `schema.ts` — the schema is executed against an in-memory database using
  `better-sqlite3` (a development dependency only), which verifies the
  `CHECK` constraints, the unique indexes, and the foreign keys without
  launching the application.

Screens are verified by hand. The rules that can silently lose money are the
ones that get automated tests.

## Backup

The database lives in the platform application-data directory, where staff
cannot conveniently reach it, so backup is the application's job:

- On every start, the database file is copied to `backups/okrotdee-YYYY-MM-DD.db`
  beside it, and all but the 30 most recent copies are deleted.
- A "Backup now" control on the dashboard writes a copy to a folder the
  staff choose — a USB stick, a synced folder — using the system file
  dialog.
- A "Show backups" control opens the backup folder in Finder or Explorer.

Staff are expected to run "Backup now" onto a USB stick weekly. This remains
the system's largest known risk: one machine, one disk.

## Build and Distribution

Each operating system's installer must be built on that operating system.
A macOS `.dmg` is built on the Mac used for development; a Windows `.msi`
requires a Windows machine or a CI runner. A GitHub Actions workflow that
builds both is included in the repository, but running it requires pushing
to GitHub, which is a separate decision from building the application.

The application is unsigned. macOS will require staff to approve it on first
launch through System Settings, and Windows will show a SmartScreen warning.
Code-signing certificates cost money annually and are out of scope.

## Out of Scope

Deliberately excluded from this version, to be added when actually needed:

- CSV import from the existing Google Sheet. The schema is designed so this
  can be added later as a standalone script without changing any table.
- Printed receipts and contract documents.
- User accounts, logins, and permissions.
- Photographs of cars.
- SMS or email payment reminders.
- Multi-branch or multi-company separation.
- Automatic interest calculation.
- Code signing and notarisation of the installers.
- Automatic updates.
