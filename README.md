# MCAT Block Trainer

This one set of files works in two ways:

| Version | Address | Sign-in | Where your questions are saved |
|---|---|---|---|
| **A. GitHub Pages** | `https://<your-name>.github.io/<repository>/` | None | Only in the browser you use |
| **B. GitHub Pages + Render** | The same GitHub link | Trainer username and passcode | Your own database, so every device sees the same questions |

Your Claude account is never used by either version.

---

## A. Put the trainer on GitHub Pages (10 minutes)

1. Unzip the file and open the folder.
2. In your GitHub repository, click **Add file → Upload files**.
3. Drag in **everything inside the folder**, including the `tess` folder, `index.html` and `config.js`, then click **Commit changes**.
   - If you uploaded the older version before, delete the old `public` folder from the repository.
   - Files whose names start with a dot (`.nojekyll`, `.gitignore`) are hidden on a Mac until you press Cmd+Shift+. — upload them if you can, but the trainer works without them.
4. In the repository, go to **Settings → Pages**.
   - **Source:** Deploy from a branch.
   - **Branch:** `main`, folder `/ (root)`.
   - Click **Save**.
5. Wait 1–2 minutes, then open your link, for example `https://yodebepro.github.io/MCATForge/`. The trainer opens instead of this page.

In this version, your questions and progress stay in the browser on that device. Use **Download the trainer with my questions** to move them to another device.

On a free GitHub account, a Pages site is public even if the code is private. Anyone with the link can open the trainer, but they only see what is saved in their own browser, never yours.

## B. Add sign-in and the same questions everywhere (optional, about 20 minutes)

This needs a small server on Render and a free database on Neon.

### 1. Make the database (Neon)
1. Go to **neon.tech** and sign up.
2. Click **Create project**.
3. Click **Connect** and copy the **connection string**. It starts with `postgresql://`. Keep it private.

### 2. Start the server (Render)
1. Go to **render.com** and sign up with GitHub.
2. Click **New + → Web Service** and pick this repository.
3. Use these settings:
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free
4. Under **Environment Variables**, add:
   - `DATABASE_URL`: the Neon connection string.
   - `SIGNUP_CODE`: a secret phrase you make up. You need it once, to create your account.
   - `ALLOWED_ORIGINS`: your GitHub Pages address without the repository name, for example `https://yodebepro.github.io`.
5. Click **Create Web Service** and wait for **Live**.
6. Copy your Render link, for example `https://mcat-block-trainer.onrender.com`.

### 3. Connect the GitHub Pages trainer to your server
1. In your GitHub repository, open `config.js` and click the pencil icon to edit it.
2. Change the last line to your Render link with `/api` added at the end:
   ```
   window.MBT_API = "https://mcat-block-trainer.onrender.com/api";
   ```
3. Click **Commit changes**. After a minute or two, your GitHub link shows a sign-in screen.

### 4. Create your account
1. Open your link and tap **First time? Create an account**.
2. Pick a username and a passcode of at least 8 characters, and enter your `SIGNUP_CODE`.
3. To stop anyone else from signing up, delete `SIGNUP_CODE` from Render's Environment settings afterward.

Your Render link opens the same trainer with sign-in, so you can use either link.

### 5. Bring over your questions
1. In the Claude version, tap **Download the trainer with my questions**.
2. In this version, tap **Bring in questions from the Claude version** and choose that file.

## On a work or shared computer
- With sign-in turned on, leave **Keep me signed in** unchecked, and tap **Sign out** when you're done. Signing out also erases what the trainer kept in that browser.
- Without sign-in (version A), your progress stays in that computer's browser.

## Good to know
- **Generating new questions needs the Claude version.** Generate there, then bring the questions over (step 5).
- **The server sleeps on Render's free plan.** After about 15 minutes of no use, the first sign-in can take up to a minute.
- **No secrets belong in GitHub.** `config.js` holds only your Render link, which is fine to be public. The database string and sign-up code go only into Render.
