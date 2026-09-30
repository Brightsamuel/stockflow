# StockFlow

Multi-store inventory for teams that receive stock, move it between stores and issue it to projects in the field.

- **Stores and categories.** Stock in (one ref no. for many items), transfers between stores, and stock out to a project (recorded as *used*, with *Taken by*) or to an external party (*issued*).
- **Products.** One catalogue for every store, with opening balances that can be issued like any other stock.
- **Stock owners.** Optional, per batch; shown in stores, reports and history.
- **History.** Every movement of a product, permanently kept: received, transferred, used, issued, adjusted, removed and restored. Pick any period to see the opening balance, what came in and went out, the closing balance and each store's balance after every movement; print it, save it as a PDF or export it to Excel.
- **Reports.** Store and category balances (opening, added, deducted, adjusted, closing and value), a movement ledger, external issues, low stock, field records and ref no. lookups. Every report can be printed, saved as a PDF or exported to Excel, with the company header.
- **Documents.** Printable Goods Received, Material Issue, Goods Issue and Stock Transfer notes with signature lines, by ref no. (or, for stock saved without one, from the store's movement log). A note entered by mistake can be deleted with all its lines by a Super admin; see below.
- **Administration.** Users with Standard / Admin / Super admin roles, lists (units, owners, projects, recipients) and company settings.

## Tech stack

Next.js 16 (App Router) · React 19 · Prisma 6 · PostgreSQL (Neon) · jsPDF + AutoTable · SheetJS · Tabler icons. Fonts and icons are bundled with the app; nothing loads from a CDN at runtime.

## Running it locally

Requires Node.js 20 or later.

```bash
npm install                  # also generates the Prisma client
cp .env.example .env         # then fill in the values (see below)
npx prisma migrate deploy    # creates or updates the database tables
npm run dev                  # http://localhost:3000
```

With an empty database, the first sign-in creates the **Super admin** account from the username and password you enter.

### Environment variables

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Pooled connection used by the app (Neon: the *pooled* connection string). |
| `DIRECT_URL` | Direct connection used for migrations (Neon: the string with *connection pooling* turned off). |
| `SESSION_SECRET` | A long random string that signs sign-in sessions. Changing it signs everyone out. |

The app adds `connect_timeout=30` to the database URL when it isn't set, so a database waking from sleep (Neon free tier) doesn't fail requests.

### Scripts

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Applies pending migrations, then builds for production |
| `npm start` | Runs the production build (port 3000, or `PORT`) |
| `npm run lint` | ESLint |

## Roles

| | Standard | Admin | Super admin |
|---|---|---|---|
| Stock in, transfer, stock out, edit items, reports, documents | ✓ | ✓ | ✓ |
| Opening balances, stores and categories, lists, users, settings | | ✓ | ✓ |
| Remove / restore items, delete / restore notes, activity tracking, delete users, create Super admins | | | ✓ |

## Records are permanent

History is never deleted. Stores, products, units, owners, projects, recipients and users can only be deleted while nothing refers to them; otherwise they are kept (users can be deactivated instead). Edits to an item's quantity and removals are recorded as adjustments, so reports always reconcile with the stock on hand.

### Deleting a note entered by mistake

A Super admin can delete a whole received, issue or transfer note from **Documents** (the *Delete note* button on the note). Deleting it takes back what its lines did: stock it received comes out of the store again, and stock it issued or transferred goes back to the store it left. The dialog shows each store's balance before and after, and asks for a reason.

Nothing is erased. The note's lines stay in the database marked as deleted, and are left out of stock, reports, product history, documents and the movement log. **Documents → Deleted** lists every deleted note with who deleted it, when and why; each can be viewed and restored, which counts it again and moves its stock back as it was recorded.

A delete (or restore) is refused rather than let a balance go below zero: for example a receipt whose stock has since been issued, until that issue is dealt with. Opening balances are changed from Products, not deleted as notes.

## Security

- Sessions last 7 days and end straight away when a password is changed or reset, or an account is deactivated.
- Five wrong passwords in a row lock an account for 15 minutes; an admin can unlock it from Users.
- New passwords need at least 8 characters.
- Every API route requires a signed-in user; changes to the store structure, lists, users and settings need an admin.

## Deploying

The app is a standard Next.js Node.js server with a PostgreSQL database; it has no platform-specific code.

### Vercel

Import the repository, add the three environment variables, and deploy. The build command (`npm run build`) applies migrations before building.

### AWS

- **Amplify Hosting:** connect the repository, keep the build command `npm run build`, use Node.js 20, and add the environment variables.
- **App Runner, ECS or EC2:** build with `npm ci && npm run build` and start with `npm start` behind a load balancer. Point its health check at **`/api/health`**, which returns 200 when the app can reach the database.
- **Docker / containers:** add `output: 'standalone'` to `next.config.mjs`, then run `node .next/standalone/server.js` after copying `.next/static` into `.next/standalone/.next/` (and `public/`, if one is added).
- **Database:** keep Neon or move to Amazon RDS for PostgreSQL. Set `DATABASE_URL` and `DIRECT_URL`; if the build machine can't reach the database, run `npx prisma migrate deploy` as a separate release step and build with `npx next build`.

## Project structure

```
app/
  (app)/          signed-in pages: overview, store/[id], products, search (product history),
                  field-records, reports, notes (documents), lists, users, settings, account
  api/            route handlers (JSON), including /api/health
  login/          sign-in page
components/       screens and the app shell; components/ui/ holds shared building blocks
dashboard/        the store page and its stock in / transfer / stock out / edit forms
lib/              data access and rules: auth, reports, history, notes and their deletion, stock
                  movements, formatting (dates are whole days in Kampala time, UTC+3)
prisma/           schema and migrations
styles/           the design system (ui.module.css)
```
