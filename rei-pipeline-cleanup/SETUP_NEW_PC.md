# Setup on a new Windows PC

Do this once on the new machine. ~10 minutes.

## 1. Install the prerequisites

- **Node.js 18+** — https://nodejs.org (LTS). After installing, open a new
  PowerShell and check: `node -v` (should print v18 or higher).
- **Git** — https://git-scm.com/download/win . Check: `git --version`.
- **Google Chrome** — https://www.google.com/chrome (the automation drives your
  installed Chrome).

If `npm` is blocked in PowerShell ("running scripts is disabled"), run once:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## 2. Get the code

```powershell
cd $HOME\Documents
git clone https://github.com/rosanes-cmyk/Pipe-Automation.git
cd Pipe-Automation\rei-pipeline-cleanup
git checkout claude/pipeline-status-cleanup-test-61hwcr
```

## 3. Install dependencies

```powershell
npm install
```

This pulls Playwright. If it does **not** auto-download the browser, run:

```powershell
npx playwright install chromium
```

(Not needed if the automation finds your installed Chrome — it's configured to
use `channel: "chrome"`.)

## 4. Log into REI once

The login lives in a local Chrome profile folder (`.chrome-profile/`) that is
**NOT** in Git — so each PC logs in on its own the first time.

```powershell
node app.js --audit --max 1
```

A Chrome window opens. **Log into REI BlackBook in that window.** You have ~10
minutes. Once you're in, it reads one lead and exits. The session is saved to
`.chrome-profile/` and reused on later runs (no need to log in every time).

## 5. Run it

- **Dashboard (recommended):**
  ```powershell
  node serve.js
  ```
  Then open http://localhost:8787 , pick Audit or Live, click Start.
  Keep this PowerShell window open while it runs.

- **Command line:**
  ```powershell
  node app.js --audit            # read-only, whole bucket
  node app.js --live             # writes, whole bucket
  node app.js --live --max 10    # writes, first 10 leads (quick test)
  node app.js --live --resume    # continue an interrupted run
  ```

## Notes

- **Nothing sensitive is in Git.** Your REI login is only in the local
  `.chrome-profile/` folder, which is git-ignored.
- **State field is never touched.** Address cleanup fixes Street/City/ZIP only.
- **Safe by default:** `config/settings.json` starts in audit mode; the
  dashboard's Live toggle (or `--live`) is what enables writes.
- To pull the latest code later: `git pull origin claude/pipeline-status-cleanup-test-61hwcr`
