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

## Build a distributable installer (.exe) — to share with teammates

> **Do NOT share `electron.exe` by itself.** On its own it fails with
> *"code execution cannot proceed because ffmpeg.dll was not found"* — it needs
> its bundled runtime files. The **Setup .exe** below bundles everything
> (Electron + ffmpeg.dll + app + dependencies) into one file teammates can
> download and run.

On a Windows PC with Node.js installed, from the project folder:
```powershell
powershell -ExecutionPolicy Bypass -File .\Build-Installer.ps1
```
or manually:
```powershell
npm install
npm run dist
```
This produces **`dist\Pipeline Status Cleanup Setup <version>.exe`** — a normal
Windows installer (per-user, so it installs to a writable location and creates
Desktop + Start Menu shortcuts). **Upload that Setup .exe** for teammates; they
download it, run it, and the app is installed like any other program.

First launch still needs the one-time REI login in the Chrome window it opens.
