# OKrotdee

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

- macOS: `npm run tauri build` produces a `.dmg` and `OKrotdee.app` in
  `src-tauri/target/release/bundle/`.
- Windows: run the `build` workflow in GitHub Actions, which builds on a
  Windows runner. A Windows installer cannot be produced on macOS.

Both installers are unsigned. macOS asks for approval under System Settings →
Privacy & Security on first launch; Windows shows a SmartScreen warning.

## Where the data lives

The database is `okrotdee.db` in the application configuration directory. Use
"เปลี่ยนที่เก็บข้อมูล" in the settings dialog to keep it somewhere else — an
external disk, say; the folder is remembered in `datadir.txt` beside the
settings and the program restarts onto it. If that disk is not plugged in the
program says so and offers to go back to the folder on this computer, rather
than opening an empty database.

Dated copies are kept in `backups/` in the configuration directory, on this
computer, whether or not the database itself has moved — two disks holding the
history is the point of taking copies at all. The application writes one on
every start and keeps the 30 most recent. Use "Backup now" in the settings
dialog to write a copy to a USB stick — do this weekly.

## Design and plan

- `docs/superpowers/specs/2026-08-24-okrotdee-design.md`
- `docs/superpowers/plans/2026-08-24-okrotdee.md`
