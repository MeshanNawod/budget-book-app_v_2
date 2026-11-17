# Hosting Budget Book with ticketing

Budget Book has two parts:

| Part | Where it lives | Cost |
|---|---|---|
| The app: budget, book PDF, ticket screens | **GitHub Pages** (your website) | Free |
| The shared ticket list: sellers, entrance, online orders | **Supabase** (online database) | Free plan |

Your **budget records stay on your own device**. Only ticket data goes to Supabase.

The setup takes about 30–40 minutes, and you only do it once.

---

## Part A — The website (GitHub Pages)

You may have done this already.

1. Create a **public** repository on github.com, for example `budget-book`.
2. Upload **everything** in this folder: `index.html`, `config.js`, `sw.js`, `manifest.json`, `favicon.ico` and the `icons` folder. `index.html` must be at the top level.
3. Go to **Settings → Pages**. Set Source to *Deploy from a branch*, Branch to `main` and folder to `/ (root)`, then click **Save**.
4. Your site address is `https://YOUR-USERNAME.github.io/budget-book/`. Write it down; this guide calls it **your site link**.

The `supabase` folder is only for setup. You don't need to upload it, but keeping it in the repository does no harm.

---

## Part B — The ticket database (Supabase)

### 1. Create the project
1. Go to **supabase.com** and click **Start your project**. Sign in with your GitHub account.
2. Click **New project**:
   - **Name:** `budget-book-tickets`
   - **Database password:** click *Generate* and save the password somewhere safe.
   - **Region:** *Southeast Asia (Singapore)*, the closest to Sri Lanka.
   - **Plan:** Free.
3. Wait about two minutes while the project starts.

### 2. Create the tables (one copy-paste)
1. In the left menu, open **SQL Editor** and click **New query**.
2. Open `supabase/schema.sql` from this download, copy **all** of it, paste it in, and click **Run**.
3. You should see *Success. No rows returned*. It's safe to run again later if you get an updated `schema.sql`.

### 3. Set the website address for logins
Open **Authentication → URL Configuration**:
- **Site URL:** your site link.
- **Redirect URLs:** add your site link again.

### 4. Make sign-up emails work (important)
Supabase's built-in email sends only **2 emails an hour**, and only to people on your Supabase team. Sellers would never get their confirmation email.

Use your society Gmail instead. It's free:

1. In the society's Google account, turn on **2-Step Verification**. Then open **Google Account → Security → App passwords**, create one called "Supabase", and copy the 16-letter password.
2. In Supabase, open **Authentication → Emails → SMTP Settings** and turn on **Enable custom SMTP**:
   - **Sender email:** your Gmail address. **Sender name:** your society's name.
   - **Host:** `smtp.gmail.com`. **Port:** `587`.
   - **Username:** your Gmail address. **Password:** the 16-letter app password.
3. Click **Save**.

**Simpler but less safe:** under **Authentication → Sign In / Providers → Email**, you can switch off **Confirm email** instead. Then nobody needs an email. But someone who knows a seller's email could create that account before the seller does. If you choose this, ask every seller to create their account the same day you add them.

### 5. Connect your website to the database
1. In Supabase, open **Project Settings → API**, or **Data API / API Keys** in newer dashboards. Copy:
   - **Project URL**, for example `https://abcdwxyz.supabase.co`
   - The **anon public** key, which is long and starts with `eyJ…`. *Never* use the `service_role` secret key here.
2. On GitHub, open `config.js` in your repository, click the ✏️ pencil, and fill it in:
   ```js
   window.BB_CONFIG = {
     supabaseUrl: 'https://abcdwxyz.supabase.co',
     supabaseKey: 'eyJhbGciOi....',
     siteUrl: 'https://YOUR-USERNAME.github.io/budget-book/'
   };
   ```
3. Click **Commit changes** and wait a minute.

The anon key is designed to be public. The database's security rules decide what each person can see and do.

### 6. First login (treasurer)
1. Open **your site link** and go to **Tickets**, or add `#tickets` to the end of the address.
2. Choose **Create an account**, confirm the email, then sign in.
3. Click **Set up ticketing**. You become the admin.
4. Click **Team → Add person** for each seller and entrance helper, using their **email**. Tick what each person may do: *Sells tickets*, *Entrance*, *Admin*.
5. Send them your site link with `#tickets` at the end. They create an account **with that same email** and sign in.

**Desktop app (Windows):** open **Settings → Ticketing** and paste the same three values: URL, key and site link.

---

## Part C — Running a ticketed event

1. **Tickets → New ticket event:** name, date, venue, price, tickets per book, and how many books.
2. **Print ticket books:** a PDF with 5 tickets per A4 page, each with a counterfoil and its own QR code. Print, cut and staple.
3. **Ticket books tab:** give each book to a seller.
4. **Sellers** open their books on their phone, tap a ticket number, and type the buyer's name and phone (or tick *Free*). They can send the buyer the ticket link on WhatsApp.
5. **Online sales:** in *Edit*, tick *Sell tickets on the website*, choose the payment methods, and add the bank details. Then use **Share buying link**: it gives you a QR code for posters and a link for WhatsApp.
   - **Bank transfer:** the buyer uploads a slip. You check the bank and press **Payment received** in *Online orders*.
   - **Pay at entrance:** the ticket shows as reserved. The entrance collects the cash when scanning.
   - **Card:** see Part D.
6. **At the entrance:** open **Scan at entrance** on a phone and allow the camera. The screen shows:
   - Green **ADMIT**: let them in.
   - Red **ALREADY USED** (with the time), **NOT A VALID TICKET** or **CANCELLED**: don't let them in.
   - Yellow **NOT PAID** or **SALE NOT RECORDED**: collect the money or confirm with the seller, then tap the button.
   - **Sell at door** records a walk-in buyer.
7. **Who has the money** shows how much cash each seller and the entrance hold.
8. After the event, press **Copy to budget**. The ticket income goes into your budget, and the *Ticket Books – Detailed Record* table is added to the Budget Book PDF.

---

## Part D — Card payments with PayHere (optional)

This needs a **PayHere merchant account** (payhere.lk). Try it first with a free **sandbox** account at sandbox.payhere.lk.

1. In PayHere, open **Settings → Domains & Credentials**. Add your website domain (for example `YOUR-USERNAME.github.io`) and copy the **Merchant Secret** and **Merchant ID**.
2. In Supabase, open **Edge Functions → Deploy a new function → Via Editor**:
   - **Name** it exactly `payhere`.
   - Replace the sample code with all of `supabase/functions/payhere/index.ts`, then click **Deploy**.
   - Open the function's **Details** and turn **Verify JWT** (JWT verification) **off**. PayHere's server can't log in, so the function checks PayHere's own signature instead.
   - Check this setting again after every redeploy.
3. In Supabase, open **Edge Functions → Secrets**, add the secret `PAYHERE_SECRET`, and paste your Merchant Secret as its value.
4. In Budget Book, open the event's **Edit** dialog, tick **Card payment (PayHere)**, enter the **Merchant ID**, and choose **Sandbox** for testing. Choose **Live** only when everything works.

The function only marks an order as paid when PayHere's signature is correct **and** the amount matches.

---

## Good to know

- **The free Supabase plan pauses a project after 7 days with no activity.** Before ticket sales or an event, open supabase.com and check that your project isn't paused. If it is, click **Restore**; this works for up to 90 days.
- The free plan gives 500 MB of database and 1 GB for slip photos. That's plenty for many events.
- Back up your **budget** often with **Settings → Save backup**. It isn't stored online.
- Ticket QR codes contain a random secret code, so they can't be guessed. Every check happens on the database, so a photocopied ticket is caught as **ALREADY USED** at the entrance.
