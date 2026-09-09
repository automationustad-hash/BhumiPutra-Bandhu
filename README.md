# Bhumiputra-Bandhu — Implementation Guide

A real, working farmer-to-buyer marketplace: farmers list produce and set their own
rates, buyers browse and request it, both sides confirm delivery, and an admin
approves every account (and can suspend one if a dispute comes up). Login is a
standard email + password — no SMTP or email-sending setup required to get started.

This build uses:
- **Supabase** — the database, authentication, and row-level security (who can see/edit what)
- **GitHub** — where the code lives and gets version-controlled
- **Netlify** — where the live site is hosted, for free

## What's in this folder

| File | Purpose |
|---|---|
| `index.html` | The app's markup + styling |
| `app.js` | All the app's logic (auth, profiles, listings, orders, admin) |
| `schema.sql` | Database tables + security rules — run this once in Supabase |
| `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png` | Make the site installable as a PWA on mobile |

---

## Part 1 — Supabase (your backend)

### 1.1 Create the project
1. Go to [supabase.com](https://supabase.com) → **Start your project** → sign in with GitHub (easiest, since you'll need a GitHub account anyway for Part 2).
2. **New project** → give it a name (e.g. `bhumiputra-bandhu`) → set a database password (save it somewhere) → pick the region closest to your users (e.g. Mumbai/`ap-south-1` if available) → **Create new project**. Takes about 2 minutes to provision.

### 1.2 Run the database schema
1. In the Supabase dashboard, open **SQL Editor** (left sidebar) → **New query**.
2. Open `schema.sql` from this folder, copy its entire contents, paste into the editor.
3. Click **Run**. This creates all four tables (`profiles`, `products`, `orders`, `order_messages`), turns on row-level security, and sets up the access rules described in the comments.

### 1.3 Turn on email + password login (no code, no SMTP needed)
1. **Authentication** (left sidebar) → **Providers** → make sure **Email** is enabled.
2. **Authentication → Providers → Email** → find **"Confirm email"** and turn it **off**. This is the important step: with it off, a new account is active the instant someone signs up — no confirmation email required at all, so you don't need to set up SMTP just to launch.
3. **Authentication → URL Configuration** — you'll come back here in Part 3 to add your live Netlify domain once you have it; `localhost` works for now while testing.

(If you'd rather keep "Confirm email" on for extra security later, you can — you'd just need to set up a free SMTP provider like Resend so Supabase can actually deliver that confirmation email. Not required to get started.)

### 1.4 Get your API keys
1. **Project Settings** (gear icon) → **API**.
2. Copy the **Project URL** and the **anon public** key (never the `service_role` key — that one must stay secret and server-side only).
3. Open `app.js` in this folder, find these two lines near the top, and paste your values in:

   ```js
   const SUPABASE_URL = "REPLACE_ME";
   const SUPABASE_ANON_KEY = "REPLACE_ME";
   ```

### 1.5 Test it locally
Browsers block some things (like the email redirect) on `file://` pages, so serve the folder over a local server:

```bash
cd this-folder
python3 -m http.server 8000
```

Open `http://localhost:8000`, click "New here? Create an account", sign up with your own email and a password, and confirm you land straight in the app (no email needed, since "Confirm email" is off).

### 1.6 Make yourself the first admin
There's no public "become admin" button on purpose. To create the first one:
1. Sign up through the app once with the email you want as admin (pick either role, it won't matter).
2. Fill in the profile form so a row exists in `profiles`.
3. In Supabase: **Table Editor → profiles**, find your row, or just run this in **SQL Editor**:

   ```sql
   update profiles set role = 'admin', status = 'approved'
   where email = 'you@example.com';
   ```
4. Refresh the app — you now see the admin dashboard, where you can approve every other farmer/buyer that signs up.

---

## Part 2 — GitHub (version control)

1. Create a new repository at [github.com/new](https://github.com/new) — call it `bhumiputra-bandhu`, keep it public or private, don't initialize with a README (you already have one).
2. From this folder:

   ```bash
   git init
   git add .
   git commit -m "Bhumiputra-Bandhu — initial version"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/bhumiputra-bandhu.git
   git push -u origin main
   ```

**Important:** `app.js` now contains your Supabase URL and anon key. The anon key is *designed* to be public (it's safe to ship in client-side code — that's the whole point of row-level security), so this is fine to push, even to a public repo.

---

## Part 3 — Netlify (hosting)

1. Go to [app.netlify.com](https://app.netlify.com) → sign in with GitHub.
2. **Add new site → Import an existing project → Deploy with GitHub** → pick your `bhumiputra-bandhu` repo.
3. Build settings: leave **Build command** empty and **Publish directory** as `/` (this is a static site, nothing to build).
4. **Deploy site**. In a minute or two you'll get a live URL like `https://bhumiputra-bandhu-xyz.netlify.app`.
5. Optional: **Site configuration → Domain management** to set a custom domain or a nicer Netlify subdomain.

### Connect Netlify back to Supabase
Go back to Supabase **Authentication → URL Configuration** and add your Netlify URL:
- **Site URL**: `https://your-site.netlify.app`
- **Redirect URLs**: add `https://your-site.netlify.app/*`

Without this step, login will work on `localhost` but not on the live site.

From now on, every `git push` to `main` automatically redeploys the live site — that's Netlify's continuous deployment, no extra steps needed.

---

## What this build covers

Everything from the finished demo, wired to a real backend:
- Email + password login (no SMTP/email setup required)
- Farmer and buyer profile capture, including real geocoded location for distance display
- Admin approval — new accounts sit pending until approved, and can be suspended later for a dispute
- Farmer listings with live stock tracking (an "order book" — the database itself blocks over-ordering)
- Buyer browsing and requesting, with real straight-line distance shown before committing
- Accept/decline → delivery method → **Mark delivered → Confirm received** lifecycle, with a per-order coordination chat, all in a popup
- Column filters (name, category, status, farmer) and date-range filters on every listing and request table
- "Action needed / Pending / Accepted / Completed / Declined / All" tabs on both sides' request tables
- Transaction reports with date range and summary stats — **PDF export** for farmer and buyer, **PDF + Excel export** for the admin's platform-wide report
- Row-level security in the database itself — not just the app's UI — so the rules hold even if someone bypasses the interface
