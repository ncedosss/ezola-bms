# LES BMS — EZOLA Lodge & Restaurant Business Management System

Phase 1 implementation of the system designed from the 10 July 2026 discovery walkthrough:
guest house (10 rooms), restaurant, tuck shop, three stock registers, two tills, and end-of-day
reconciliation — with the owner's rules built in as hard constraints.

**Stack:** React (Vite) · Node.js/Express · PostgreSQL (plain `pg`, no ORM) · single repo, Heroku-ready.

---

## 1. Running it on your machine (VS Code)

### Prerequisites
- Node.js 20+ (`node -v`)
- PostgreSQL 14+ running locally (`psql --version`)

### Steps
```bash
# 1. Open the folder in VS Code, then in the integrated terminal:
npm install                # server dependencies
npm install --prefix client  # client dependencies

# 2. Create the database
createdb les_bms
#   (or in psql:  CREATE DATABASE les_bms;)

# 3. Configure environment
cp .env.example .env
#   Edit .env: set DATABASE_URL to your local Postgres and a long random JWT_SECRET, e.g.
#   DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/les_bms"

# 4. Create tables and load the discovery data
npm run db:migrate
npm run db:seed

# 5. Run it — two terminals in VS Code:
npm run dev        # terminal 1: API on http://localhost:5000 (auto-restarts)
npm run client     # terminal 2: React app on http://localhost:5173 (proxies /api)
```

Open **http://localhost:5173**.

### Seeded logins (CHANGE ALL OF THESE BEFORE GO-LIVE — Users screen or seed file)
| Role | Email | Password | Till PIN |
|---|---|---|---|
| Owner | owner@lesengineering.co.za | Owner@2026 | 1111 |
| Office manager | office@lesengineering.co.za | Office@2026 | 2222 |
| Facility manager | facility@lesengineering.co.za | Facility@2026 | 3333 |
| Reception | reception@lesengineering.co.za | Reception@2026 | 4444 |
| Waiter 1 / 2 | waiter1@… / waiter2@… | Waiter1@2026 / Waiter2@2026 | 5555 / 5556 |
| Shop attendant | shop@lesengineering.co.za | Shop@2026 | 6666 |
| Kitchen | kitchen@lesengineering.co.za | Kitchen@2026 | 7777 |

On the shared till tablet, staff switch users with their **4-digit PIN** — every sale, check-in and
payment is recorded against the person signed in.

---

## 2. How the business rules are enforced

| Rule from the walkthrough | Where it lives |
|---|---|
| Keys only after payment | Check-in API records the stay **and** its payment in one transaction; there is no unpaid check-in |
| Hourly 1–5h upfront, top-ups, **no refunds** | `POST /stays`, `POST /stays/:id/topup`; checkout never reduces `amount_due` |
| Overstay charged automatically | Checkout computes extra hours (rounded up) and refuses to close until cash/card is chosen (HTTP 402) |
| Overnight R550 includes R65 plate | Overnight check-in creates a `meal_credit` |
| R65 cash walked to restaurant till | Cash overnight creates a `cash_transfer`; restaurant side must tap **Confirm received**; unconfirmed walks show on the Guest House screen and dashboard |
| Card-paid credit = no cash moves | Credit is `card_noted`; the kitchen card shows a green **CARD-PAID** flag |
| Kitchen cooks nothing without an invoice | Kitchen queue only shows orders with status `paid`+; paying at the till is what issues the numbered slip (R-###, S-###, RM-###, reset daily) |
| Plate = 1 starch + 1 protein + 3 veg, R65/R70 | Plate builder with Starch/Protein option groups; sit-down vs takeaway picks the price |
| Ulusu standalone R20 | Seeded menu item |
| Tshisa Nyama per-kg, closed for renovation | Seeded with per-kg prices but `is_available = false`; owner flips it on from the menu when renovation ends |
| Owner sets prices, no negotiation | `PATCH /menu/:id` is owner-only |
| Three stock registers | `stock_items.register`: kitchen / shop / guest_house, tabbed on the Stock screen |
| Sheep = 10 plates, chicken = 5 | `plate_yield` + `recipe_consumption`; paying an order deducts expected usage automatically |
| Adjustments need owner approval + reason | Reason mandatory; managers submit, only the owner approves/rejects; approval applies the change |
| Two tills, cash vs card, EOD counts | Every payment stores `method`, `till`, `business_date`; End-of-Day screen compares counted vs system per till (system nets confirmed R65 walks correctly on both tills) |
| Trading past midnight (Fri/Sat close 00:00) | `business_date` uses a 04:00 SAST cutoff — a 00:30 payment belongs to the prior day |
| Variance alerts | Variance ≥ R50 raises an owner alert (threshold in `server/routes/admin.js`) |
| Everything auditable | `audit_log` records who did what, when, on every mutation |

---

## 3. Deploying to Heroku (when you're ready)

```bash
heroku login
heroku create les-bms                        # or your app name
heroku addons:create heroku-postgresql:essential-0
heroku config:set JWT_SECRET="$(openssl rand -hex 32)" NODE_ENV=production

git init && git add . && git commit -m "LES BMS phase 1"
git push heroku main
```

The `Procfile` release phase runs `scripts/migrate.js` on every deploy (idempotent), and
`heroku-postbuild` builds the React client, which Express serves. Then seed once:

```bash
heroku run npm run db:seed
```

Open the app: `heroku open`. DATABASE_URL is set automatically by the addon.

---

## 4. Placeholders & open items to confirm with the manager

- **Tuck shop prices are placeholders** — edit via SQL or ask the owner to adjust each `price_unit`
  (Menu editing is owner-only by design).
- **Low-stock thresholds** for shop and guest-house items are unset (`NULL`) — alerts skip them
  until a manager fills them in on the Stock screen (Adjust → item edit or `PATCH /api/stock/items/:id`).
- **Alcohol** items are seeded `is_available = false` pending the licence question.
- **Tshisa Nyama** items are seeded `is_available = false` until renovation completes.
- **Room TV/fridge flags** are all false — informational only (never affects price); set per room in SQL.
- Recipe quantities (veg 0.15 kg/plate etc.) are starting estimates — tune once real usage data comes in.

## 5. Deferred to Phase 2 (by design)
- Offline queue-and-sync for the poor-connectivity restaurant side (currently requires connectivity;
  the tablet UI is built to tolerate slow links with light payloads).
- Native mobile app, push notifications (alerts currently live in the in-app Alerts screen).
- Receipt **photo upload** (capture the receipt number in `receipt_ref` for now).
- Configurable variance threshold & rate cards from an admin screen.

## 6. Project layout
```
server/           Express API (routes/auth, guesthouse, sales, stock, admin)
server/lib/       business date, audit, alerts, stock deduction, order numbering
db/schema.sql     full schema (idempotent)
db/seed.js        discovery data: users, rooms, menu, 3 stock registers, recipes
scripts/migrate.js applies schema (also Heroku release phase)
client/           React (Vite) SPA — one page per screen S01–S15
```
