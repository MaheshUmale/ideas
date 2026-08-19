# Eight MVP implementations

Runnable factory console plus isolated domain engines for every product in
[MVP_FACTORY_BLUEPRINTS.md](MVP_FACTORY_BLUEPRINTS.md). Persistence in this
preview is in-process so the consoles work without Supabase credentials.
Each `apps/*/schema.sql` is the production Postgres contract (RLS still
required before a public deploy).

## Run

```bash
cd web
npm install
npm test
npm run dev
```

Open `/` for the factory index. Each product has a seeded demo.

## Product map

| Console | Engine | Native extras |
|---|---|---|
| `/report-narrator` | `web/src/products/report-narrator` | `apps/report-narrator/apps-script` |
| `/outcome-watch` | `web/src/products/outcome-watch` | `apps/outcome-watch/schema.sql` |
| `/change-order-lite` | `web/src/products/change-order-lite` | `apps/change-order-lite/schema.sql` |
| `/fixproof` | `web/src/products/fixproof` | `apps/fixproof/schema.sql` |
| `/plate-delta` | `web/src/products/plate-delta` | `apps/plate-delta/worker/normalize.py` |
| `/billable-recall` | `web/src/products/billable-recall` | `apps/billable-recall/extension` |
| `/dispute-packet` | `web/src/products/dispute-packet` | `apps/dispute-packet/schema.sql` |
| `/ledger-exit` | `web/src/products/ledger-exit` | `apps/ledger-exit/worker/reconcile.py` |

## Release gates still open

Tenant isolation against live Postgres, Resend/Twilio credentials, Shopify
app review, and the five-interview / three-paying-user gates from the
portfolio CEO decision are **not** claimed here. The code is the operational
backbone specified in the blueprints.
