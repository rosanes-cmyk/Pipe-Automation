# Install as a Windows app (double-click, no terminal)

This turns the automation into a normal app you launch from your Desktop or
Start Menu. Under the hood it still uses Node + Chrome, but you never touch
PowerShell after setup.

## One-time install

1. Make sure the code is on the PC (see `SETUP_NEW_PC.md` for Node/Git and the
   `git clone`). You only need Node.js installed once.

2. In the project folder, run the installer once:
   ```powershell
   cd C:\Users\<you>\Documents\Pipe-Automation\rei-pipeline-cleanup
   powershell -ExecutionPolicy Bypass -File .\Install-App.ps1
   ```
   This creates a **"Pipeline Status Cleanup"** shortcut on your **Desktop** and
   in the **Start Menu**.

## Using it

- Double-click **Pipeline Status Cleanup** (Desktop or Start Menu).
- A small window opens (that's the engine — leave it open) and your browser
  opens the dashboard at `http://localhost:8787` automatically.
- Pick **Audit** or **Live**, click **Start**.
- To stop: close that window, or press Ctrl+C in it.

### First launch
- The very first launch runs `npm install` automatically (one-time, ~1 min).
- The first time it opens REI, log in once in the Chrome window it opens — the
  session is saved for future launches.

### Sharing with teammates
While it's running, the dashboard shows a "Share on this Wi-Fi" URL with a Copy
button — teammates on the same network open that to watch progress.

## Uninstall
Delete the two shortcuts (Desktop + Start Menu). To remove everything, delete
the project folder.

## Note on a single .exe
A true standalone `.exe` (no Node install, no window) is possible but heavier to
build and maintain because Playwright ships its own browser and the app launches
a child process. The shortcut approach above is the reliable option and behaves
like an installed app. If you specifically want a packaged `.exe`/installer
later, it can be added.
