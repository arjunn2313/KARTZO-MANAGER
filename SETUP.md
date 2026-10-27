# Kartzo Manager: first-time setup

Do these once. All commands are for **PowerShell**, run inside this folder:

```powershell
cd $HOME\Desktop\kartzo-manager
```

## 1. Install packages

```powershell
npm install
```

## 2. Create the database tables (Supabase)

1. Open your project on supabase.com → **SQL Editor** → **New query**.
2. Open `supabase\migrations\001_init.sql` in VS Code, copy everything, paste into the editor, click **Run**. You should see "Success. No rows returned".
3. New query again → paste everything from `supabase\seed.sql` → **Run**.

## 3. Create your login (Supabase)

1. **Authentication → Users → Add user → Create new user**.
2. Enter your email and a password. Tick **Auto Confirm User**.
3. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up", so nobody else can create an account.

## 4. Add your keys

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

Paste your **Project URL** and **Publishable (anon) key** from Supabase → Project Settings → API. Save and close.
Never share `.env.local` or put the secret / service_role key in it.

## 5. Run it

```powershell
npm run dev
```

Open http://localhost:3000, sign in, and you should see **"✓ Logged in and connected to the database"** with your 2 products and 3 couriers listed.

If you see a red "Database not ready" message, step 2 didn't run fully. Run both SQL files again (they're safe to re-run).
