# Kitchen Profit

A mobile web app for a home kitchen business to track **daily cost, sales, profit and margin** — one entry per dish per day (e.g. Lunch Biriyani). Data is stored in **Supabase**, so it syncs across your phone and any device.

## Setup (10 minutes, one time)

### 1. Make a Supabase project (free)
1. Go to https://supabase.com → sign in → **New project**.
2. Pick a name and a strong database password, choose the nearest region, create it.

### 2. Create the table
1. In Supabase, open **SQL Editor → New query**.
2. Paste everything from `schema.sql` and click **Run**.

### 3. Get your keys
1. Supabase → **Project Settings → API**.
2. Copy the **Project URL** and the **anon public** key.

### 4. Open the app and connect
1. Open `index.html` on your phone (see hosting options below).
2. Go to the **⚙️ Setup** tab, paste the URL and anon key, set the currency (e.g. `MVR`), tap **Save & connect**.
3. Done — the keys are remembered on that device.

## Using it
- **➕ Add:** pick/type the item, plates sold, price per plate, and total cost (ingredients + gas). It shows sales, profit and margin live, then **Save**.
- **📊 Records:** daily totals with Today / 7 days / Month / All. Tap **×** to delete an entry.

## How to open it on a phone
Pick one:
- **Easiest:** host the folder free on **Netlify Drop** (https://app.netlify.com/drop) — drag the folder in, get a link, open it on your phone, then "Add to Home Screen".
- **Vercel / Cloudflare Pages / GitHub Pages:** also work — it's a plain static site.
- **Local test:** open `index.html` directly in a desktop browser.

## A note on security
This app connects with only the Supabase **anon** key and no login, so anyone who has your URL + anon key can read and write your data. That's fine for a private tool you keep to yourself. If you ever share it or want real protection, add **Supabase Auth** and change the table policy in `schema.sql` to scope rows to `auth.uid()`.

## Files
- `index.html` — the whole app (HTML + CSS + JS, no build step).
- `schema.sql` — the Supabase table and security policy.
