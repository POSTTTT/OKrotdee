# OKroddee

Offline desktop application for a second-hand car dealership: clients, cars,
installment contracts, payments, and repossession warnings.

## Running it during development

```bash
npm install
npm run tauri dev
```

## Tests

```bash
npm test
```

`money.ts`, `validate.ts`, `schema.ts`, and every query in `db.ts` are
covered. React screens are verified by hand.

## Building an installer

- macOS: `npm run tauri build` produces a `.dmg` and `OKroddee.app` in
  `src-tauri/target/release/bundle/`.
- Windows: run the `build` workflow in GitHub Actions, which builds on a
  Windows runner. A Windows installer cannot be produced on macOS.

Both installers are unsigned. macOS asks for approval under System Settings →
Privacy & Security on first launch; Windows shows a SmartScreen warning.

## Where the data lives

The database is `okroddee.db` in the application configuration directory,
with dated copies in `backups/` beside it. The application copies the
database there on every start and keeps the 30 most recent. Use "Backup now"
on the dashboard to write a copy to a USB stick — do this weekly.

## Design and plan

- `docs/superpowers/specs/2026-08-24-okroddee-design.md`
- `docs/superpowers/plans/2026-08-24-okroddee.md`
