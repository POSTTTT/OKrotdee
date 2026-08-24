# OKroddee — Second-Hand Car Dealership Management System

**Date:** 2026-08-24
**Status:** Approved design, ready for implementation planning

## Purpose

Replace the dealership's Google Sheet and hand-written book with a single
local application that tracks clients, cars, installment contracts, and
payments, and that shows which contracts have fallen far enough behind to
justify repossessing the car.

## Constraints

- Runs on one office computer, offline. No internet, no hosting, no cloud
  account.
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
4. The entire dataset is one file that can be copied to a USB stick.

## Architecture

A single Python process serving server-rendered HTML on `localhost`, backed
by a SQLite file.

- **Python 3 + Flask + Jinja2 + `sqlite3` (standard library).** No ORM, no
  JavaScript build step, no external services.
- Staff launch it with `run.command` (macOS) and use it in a browser.
- All data lives in `okroddee.db` in the project directory.

Rationale: the deployment target is one offline machine. A server-rendered
application has no build step to break, no dependency tree to maintain
offline, and its database is a single file that non-technical staff can back
up by copying it.

### File Layout

```
app.py           Flask routes and request handling
db.py            Schema definition, migrations, queries
money.py         Satang arithmetic, schedule generation, status derivation
lang.py          Thai/English label dictionary
templates/       base.html plus one template per screen
static/app.css   All styling
test_money.py    pytest suite for money.py
run.command      Launcher: back up the database, then start the server
```

`money.py` holds every rule that can silently lose money and depends on
nothing but the standard library, so it can be tested in isolation.

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

`lang.py` holds a dictionary of interface labels in Thai and English. The
active language is stored in the session and toggled by a link in the
header. Only interface labels are translated; data entered by staff is
stored and displayed exactly as typed.

## Testing

`test_money.py` covers `money.py` with pytest:

- Schedule generation, including month-end clamping and multi-year contracts
- Satang conversion and formatting round-trips
- Status derivation for paid, partial, overdue, and upcoming installments
- `overdue_count` and contract flag thresholds
- Partial payments summing to exactly the amount due
- Late fees included in the outstanding balance

Screens are verified by hand. The rules that can silently lose money are the
ones that get automated tests.

## Backup

`run.command` copies `okroddee.db` to `backups/okroddee-YYYY-MM-DD.db`
before starting the server, and prunes backups older than the most recent
30. Staff copy the `backups/` folder to a USB stick weekly. This is the
whole backup story for an offline single-machine deployment, and it is the
system's largest known risk.

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
