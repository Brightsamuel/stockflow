# StockFlow

Multi-store inventory for teams that receive stock, move it between stores and issue it to projects in the field.

- **Stores and categories.** Stock in (one ref no. for many items), transfers between stores, stock out to a project (recorded as *used*, with *Taken by*) or to an external party (*issued*), and returns from a project. Names for the note's signature blocks (delivered by, received by, issued by…) are typed when recording; left empty, the line is signed by hand. A save that repeats one made moments before asks before saving it again.
- **Products.** One catalogue for every store, with opening balances that can be issued to stores, projects or external parties (see *Opening stock* below).
- **Project stock.** Stock received for a project is kept for it; see below.
- **Stock owners.** Optional, per batch; shown in stores, reports and history.
- **History.** Every movement of a product, permanently kept: received, transferred, used, issued, adjusted, removed and restored. Pick any period to see the opening balance, what came in and went out, the closing balance and each store's balance after every movement; print it, save it as a PDF or export it to Excel.
- **Reports.** Store and category balances (opening, added, deducted, adjusted, closing and value; one line per item and owner, with stock kept for a project included), stock balances for the whole inventory, a movement ledger, external issues, project materials, low stock, field records and ref no. lookups. Every report, the Products catalogue and each store's stock sheet can be printed, saved as a PDF or exported to Excel, with the company header.
- **Documents.** Printable Goods Received, Material Issue, Goods Issue, Stock Transfer and Material Return notes with signature lines, by ref no. (or, for stock saved without one, from the store's movement log). A Goods Received Note with a wrong or missing line can be edited by an Admin, and a note entered by mistake deleted with all its lines by a Super admin; see below.
- **Approvals.** Stock outs are signed off in the system after the stock has left; see below.
- **Administration.** Users with Viewer / Standard / Admin / Super admin roles and the Approver permission, lists (units, owners, projects, recipients) and company settings.

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

| | Viewer | Standard | Admin | Super admin |
|---|---|---|---|---|
| See and print everything: stores, products, history, reports, documents | ✓ | ✓ | ✓ | ✓ |
| Stock in, transfer, stock out, returns, edit items, products | | ✓ | ✓ | ✓ |
| Opening balances, stores and categories, lists, users, settings, release project stock, edit Goods Received Notes | | | ✓ | ✓ |
| Remove / restore items, delete items for good, delete / restore notes, activity tracking, delete users, create Super admins | | | | ✓ |

A user's role is changed from **Users**: click their role (e.g. *Admin · Change*).

**Approver** is a permission an admin gives to any user (Viewers included) under Users: it lets them approve or query stock outs. An approver can't approve a stock out they recorded themselves. Viewers sign in with a username and password like everyone else.

## Opening stock

An opening balance is entered on a product (Products) and held apart from the stores until it is issued. Issuing it to a store makes it that store's **opening stock**: stock on hand from the start, shown under *Opening* in the store's reports for any period (never as stock added that day) and included in its closing balance. Whatever has not been issued yet stays as *opening stock not yet in a store*; the **Stock balances** report shows it beside the stock in stores, so the whole inventory per item is in one place. Product history shows each issue once, as *Opening stock*.

**Owners.** An opening balance has no owner: stock belonging to several owners can be entered as one quantity. Issuing it to a store asks whose it is (an owner, or *No owner*), and from then on it is that owner's stock in that store, in reports and on the issue note. Stock shared by several owners is issued once per owner. The owner can't be changed afterwards; to correct it, delete the issue note in Documents and issue the stock again. Opening stock issued straight to a project or an external party has no owner.

## Project stock and returns

- **Received for a project.** On Stock in, choose *For project* when the stock was supplied for a project (e.g. by the contractor). It gets its own line in the store, marked *For <project>*.
- **Kept for it.** That line can only be issued to that project, or moved to another store where it stays kept for it; it can't go to an external party or another project. An admin can **release** what is left to general stock (the open-padlock button on the line). In the store and category balance reports it is not split out: each item has one line per owner.
- **Dates.** Stock can't go out of a store dated earlier than it arrived there. Each line in the store counts on its own: opening stock issued to the store dated 21 Sep can go out from 21 Sep, even if the same item came in for a project on 3 Oct.
- **Returns.** *Return* on a store records stock coming back from a project's site, onto the project's line or into general stock. Nothing more can come back than was issued to that project from that store, less earlier returns. Each return has a printable Material Return Note.
- **Project materials** (Reports and Field records): per store and item, what was received for the project, issued to it, returned, used (issued − returned), released and still held for it, for any period. For example: received 500, issued 450, returned 30 → used 420, held 80.

## Approvals

Stock outs to a project or an external party are approved in the system after the stock has left; nobody waits at the store. Each issue note shows *Awaiting approval* until an approver approves it on the **Approvals** page (or on the note in Documents), and their name and the date then fill its *Approved by* line. An approver can also **query** a note with a comment; it stays on the Approvals page until it is approved. Every decision is kept, and Field records and External issues show who approved each line. Goods Received and Stock Transfer notes keep an *Approved by* line to sign by hand.

## Records are permanent

History is never deleted. Stores, products, units, owners, projects, recipients and users can only be deleted while nothing refers to them; otherwise they are kept (users can be deactivated instead). Edits to an item's quantity and removals are recorded as adjustments, so reports always reconcile with the stock on hand.

### Deleting a note entered by mistake

A Super admin can delete a whole received, issue or transfer note from **Documents** (the *Delete note* button on the note). Deleting it takes back what its lines did: stock it received comes out of the store again, and stock it issued or transferred goes back to the store it left. The dialog shows each store's balance before and after, and asks for a reason.

Nothing is erased. The note's lines stay in the database marked as deleted, and are left out of stock, reports, product history, documents and the movement log. **Documents → Deleted** lists every deleted note with who deleted it, when and why; each can be viewed and restored, which counts it again and moves its stock back as it was recorded.

A delete (or restore) is refused rather than let a balance go below zero: for example a receipt whose stock has since been issued, until that issue is dealt with. Opening balances are changed from Products, not deleted as notes.

### Editing a Goods Received Note

An Admin or Super admin can correct a Goods Received Note from **Documents** (*Edit note*): change a line's quantity or rate (e.g. 90 entered where 79 came in), take a line off, or add a forgotten one. The store's stock moves by the difference, and an edit is refused if less is left than it takes out. In Documents the note then shows *Edited* with the date, who changed what and the reason; the printed note and PDF show only the corrected lines. The lines as they were are kept in the database but no longer count anywhere, so reports and product history show the corrected note with no adjustments. To change it back, edit the note again.

### Deleting an item for good

A removed item (a store's **Removed items**) can be deleted for good by a Super admin. When everything recorded for it in that store is stock received on notes and corrections made in the store (edits, removals, restores), its whole history goes with it: it leaves product history, reports and the notes it was on (a note with other lines keeps them). The dialog lists what goes and asks for a reason; it is kept under **Documents → Deleted** and can be restored from there, back into Removed items. If some of its stock was issued or moved, only the row goes and its history stays, since those records depend on it.

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
