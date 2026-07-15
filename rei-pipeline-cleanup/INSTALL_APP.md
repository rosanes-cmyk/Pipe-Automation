# Install as a desktop app (its own window — no terminal, no browser tab)

The dashboard runs inside a real application window (Electron). You launch it
from your Desktop or Start Menu like any other program.

## One-time install

1. Have the code on the PC and Node.js installed (see `SETUP_NEW_PC.md`).

2. In the project folder, run the installer once:
   ```powershell
   cd C:\Users\<you>\Documents\Pipe-Automation\rei-pipeline-cleanup
   powershell -ExecutionPolicy Bypass -File .\Install-App.ps1
   ```
   It installs the app runtime (Electron) if needed and creates a
   **"Pipeline Status Cleanup"** shortcut on the **Desktop** and **Start Menu**.

## Using it

- Double-click **Pipeline Status Cleanup**.
- The app opens in **its own window** — toolbar, stat cards, clock, Daily Report.
- Pick **Audit** or **Live**, click **Start**. Close the window to quit.
- The first time it opens REI, log in once in the Chrome window it opens — the
  session is saved for next time.
- Links to REI (from the cards / report) open in your normal browser.

## Run it without installing a shortcut

From the project folder:
```powershell
npm run app
```
Same app window, handy for testing.

## Build a distributable installer (.exe) — optional / advanced

To hand teammates a single installer they can run without Node:
```powershell
npm install
npm run dist
```
This produces `dist\Pipeline Status Cleanup Setup <version>.exe` (NSIS installer).

Caveats (why this is "advanced"):
- Must be built **on Windows**.
- The app writes reports/logs and stores the REI login next to itself, so install
  it somewhere writable (its default per-user location is fine; avoid
  `C:\Program Files`). If you plan to distribute widely, those paths should be
  moved to the per-user AppData folder first — ask and I'll wire that up.

For a single office machine, the **shortcut install above is the recommended,
reliable option**.
