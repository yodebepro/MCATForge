# MCAT Block Trainer — web version with its own login

This is your trainer as a normal website. You sign in with a **trainer username and passcode**. Your Claude account is never used, so nothing about it is typed into or saved on a work computer.

Your questions, progress, file list and reading text are saved in a database, so they show up on any computer where you sign in.

Setup takes about 20 minutes and uses three free services:

| Service | What it does |
|---|---|
| **GitHub** | Holds the trainer's code |
| **Neon** | The database that keeps your questions and progress |
| **Render** | Runs the website and gives you the link |

---

## 1. Make the database (Neon)

1. Go to **neon.tech** and sign up. Signing in with GitHub is easiest.
2. Click **Create project**. Any name works, for example `mcat`. Pick the region closest to you.
3. On the project dashboard, click **Connect**. Copy the **connection string**. It starts with `postgresql://` and ends with `?sslmode=require`.
4. Keep that string private, like a password. You'll paste it into Render in step 3.

## 2. Put the code on GitHub

1. Unzip `mcat-block-trainer-web.zip` on your computer.
2. On **github.com**, click **New repository**. Name it `mcat-block-trainer` and choose **Private**. Click **Create repository**.
3. Click **uploading an existing file**.
4. Open the unzipped folder, select **everything inside it**, and drag it into the GitHub page. That includes the `public` folder, `server.js`, `package.json`, `render.yaml`, `README.md` and `.gitignore`.
   - On a Mac, press Cmd+Shift+. to see `.gitignore`. If it doesn't upload, that's fine.
5. Click **Commit changes**.

No passwords or codes go into GitHub. Those only go into Render.

## 3. Start the website (Render)

1. Go to **render.com** and sign up with your GitHub account.
2. Click **New +**, then **Web Service**, and pick your `mcat-block-trainer` repository.
3. Fill in these settings:
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free
4. Under **Environment Variables**, add two entries:
   - `DATABASE_URL`: the Neon connection string from step 1.
   - `SIGNUP_CODE`: a secret phrase you make up, for example `blue-otter-2027`. It's only needed once, when you create your account.
5. Click **Create Web Service** and wait for the log to say **Live**. That takes a few minutes.
6. Your link is at the top of the page, for example `https://mcat-block-trainer.onrender.com`. Bookmark it.

## 4. Make your trainer account

1. Open your link and tap **First time? Create an account**.
2. Choose a username and a passcode of at least 8 characters, then enter your `SIGNUP_CODE`.
3. **Optional, but safer:** in Render, open **Environment** and delete `SIGNUP_CODE`, then save. That stops anyone else from making an account. Your own sign-in keeps working.

## 5. Bring over the questions you already have

1. In the Claude version of the trainer, tap **Download the trainer with my questions**.
2. In the web version, scroll to **Your trainer account** and tap **Bring in questions from the Claude version**.
3. Choose the file you downloaded. Your blocks and passages are added.

## Using it on a work or shared computer

- Leave **Keep me signed in** unchecked. You're signed out when the browser closes.
- Tap **Sign out** when you're done. That also erases everything the trainer kept in that browser.
- Your trainer passcode is the only thing you type there.

## Good to know

- **The first visit after a while is slow.** On the free plan the site sleeps after about 15 minutes of no use, and the first visit takes up to a minute to wake it. Render's Starter plan (about $7/month) keeps it awake.
- **Reading files works the same way.** The built-in reader and text recognition for screenshots run in your browser, so you can add PDFs, Word files, text files and screenshots here too.
- **Claude-powered steps stay in the Claude version.** Generating new questions and "Read with Claude" need your Claude account. Do those in the Claude version, then bring the questions over with step 5.
- **Your original files aren't uploaded.** Only the questions and the readable text are saved, so the reader works on every computer.
- **Wrong passcodes are slowed down.** After 8 wrong tries, sign-in pauses for 15 minutes.
- **Passcodes are never stored as plain text.** They're stored as a one-way scrambled form (scrypt).

## Trying it on your own computer (optional)

With Node 18 or newer installed:

```
npm install
SIGNUP_CODE=test npm start
```

Then open http://localhost:3000. Without `DATABASE_URL`, data is saved in `data/store.json`.
