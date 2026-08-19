# MVP Software Factory: Eight Executive Submissions

**CEO decision:** Phase 1 is auto-approved only after an adversarial PO/BA review. Each product remains an independent two-week build; they are not intended to be built simultaneously by one developer.

**Shared delivery standard:** TypeScript, Next.js App Router, Supabase Postgres/Auth/Storage, Zod, Tailwind, Vitest, Playwright, Vercel, and Resend unless a product has a stronger platform-native choice. Every MVP is multi-tenant, uses row-level security (RLS), stores secrets server-side, and emits an immutable audit event for consequential state changes.

---

# 1. OutcomeWatch — No-Code Outcome Observability

## Executive Summary (PO)

### Vision, buyer, and value

OutcomeWatch tells automation consultants that a business outcome is missing before their client does. The first buyer is a no-code agency owner managing 20–200 Zapier, Make, or n8n workflows. The value proposition is: **prove that source events reached their destination, detect silence and mismatches, and turn reliability into a billable maintenance service.**

### Before / after (BA)

- **Before:** Consultant opens several client accounts, checks histories, waits for native error email, and still misses workflows that never fired or wrote blank data.
- **After:** Each critical flow sends a source and destination event to OutcomeWatch. A scheduled evaluator compares expected cadence/counts and alerts the consultant from one dashboard.

### MVP scope — exactly three features

1. **Universal event ingestion:** source/destination webhook with workflow key, correlation ID, stage, timestamp, and optional validated fields.
2. **Rule evaluation and alerting:** missing cadence, unmatched correlation ID after an SLA, and required-field failure; email alert with deduplication.
3. **Agency dashboard:** workflow health, active incident, last source/destination event, and client-scoped read-only status link.

**Explicitly cut:** native Zapier/Make account APIs, auto-remediation, log retention beyond 30 days, Slack/PagerDuty, AI diagnosis, billing, and arbitrary query builders.

### Success metrics

- 5 agencies instrument at least 10 workflows each.
- At least 80% of seeded missing/mismatched events alert within the configured SLA.
- Fewer than 5% of alerts are marked false positive after one week.
- Median setup time is under 10 minutes per workflow.

### Technical feasibility audit

- **Dependencies:** webhook endpoint, scheduled evaluator, transactional email, Postgres, cryptographic API keys.
- **Bottleneck:** “Expected but absent” cannot be inferred without a declared cadence or source event. The setup UI must force one of those models.
- **Privacy:** payloads may contain PII. MVP stores only correlation IDs and allow-listed fields, rejects unknown payload keys, and supports SHA-256 hashing before transmission.
- **Abuse:** rate-limit by project key; store only key hashes; cap payload size at 8 KB.

### Acceptance criteria

- Given a valid project key, an event is persisted and returns `202`; invalid keys return `401` and persist nothing.
- Given a source event with no matching destination after the SLA, exactly one open incident exists and one email is queued.
- Given a later matching destination event, the incident changes to `resolved`.
- Given a cadence rule whose deadline passes without an event, the workflow displays `degraded`.
- A public status token reveals only workflow name, status, and timestamps for its client.

### PO/BA challenge log and CEO approval

- **BA challenge:** A heartbeat-only product duplicates uptime monitors.
- **PO response:** Correlation-based source-to-destination reconciliation is mandatory in v1; arbitrary observability is cut.
- **PO challenge:** Native integrations would consume the entire schedule.
- **BA response:** Pasteable webhook steps preserve platform neutrality and make a two-week MVP feasible.
- **CEO ruling:** **Approved.** The wedge is outcome reconciliation, not generic workflow logs.

## System Architecture & Data Flow (BA/Dev)

```text
Zapier/Make/n8n source step ─┐
                             ├─ POST /api/v1/events ─ validate key/schema ─ events
Destination/final step ──────┘                                  │
                                      Vercel Cron /api/cron/evaluate
                                                               │
                                     rules → incidents → email_outbox → Resend
                                                               │
                                      authenticated agency dashboard
```

### Relational schema

```sql
create table organizations (id uuid primary key default gen_random_uuid(), name text not null);
create table clients (id uuid primary key default gen_random_uuid(), organization_id uuid references organizations not null, name text not null);
create table workflows (
  id uuid primary key default gen_random_uuid(), client_id uuid references clients not null,
  name text not null, key_hash text not null unique, sla_minutes int not null check (sla_minutes between 1 and 10080),
  cadence_minutes int, required_fields text[] not null default '{}', public_token_hash text
);
create table events (
  id bigint generated always as identity primary key, workflow_id uuid references workflows not null,
  correlation_id text not null, stage text not null check (stage in ('source','destination')),
  occurred_at timestamptz not null, fields jsonb not null default '{}', created_at timestamptz not null default now(),
  unique(workflow_id, correlation_id, stage)
);
create table incidents (
  id uuid primary key default gen_random_uuid(), workflow_id uuid references workflows not null,
  kind text not null, correlation_id text, status text not null default 'open', opened_at timestamptz not null default now(),
  resolved_at timestamptz, unique(workflow_id, kind, correlation_id, status)
);
create index events_lookup on events(workflow_id, correlation_id, stage);
```

### Two-week implementation plan

- **Days 1–2:** auth, organizations, workflows, API-key creation.
- **Days 3–5:** ingestion, idempotency, limits, event viewer.
- **Days 6–8:** evaluator, incident lifecycle, email outbox.
- **Days 9–10:** dashboard and public status page.
- **Days 11–12:** tests, RLS, load/security review.
- **Days 13–14:** instrument five real workflows and fix onboarding friction.

## Core Source Code Blueprint (Dev)

```ts
// app/api/v1/events/route.ts
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";

const Event = z.object({
  correlationId: z.string().min(1).max(200),
  stage: z.enum(["source", "destination"]),
  occurredAt: z.string().datetime(),
  fields: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({})
});
export async function POST(req: Request) {
  const key = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!key) return Response.json({ error: "unauthorized" }, { status: 401 });
  const keyHash = createHash("sha256").update(key).digest("hex");
  const workflow = await db.workflowByKeyHash(keyHash);
  if (!workflow) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Event.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const unknown = Object.keys(parsed.data.fields).filter(k => !workflow.required_fields.includes(k));
  if (unknown.length) return Response.json({ error: "field_not_allowlisted", fields: unknown }, { status: 400 });
  await db.insertEventIdempotently(workflow.id, parsed.data);
  return Response.json({ accepted: true }, { status: 202 });
}
```

```ts
// lib/evaluate.ts
export async function evaluate(now = new Date()) {
  const overdue = await db.unmatchedSources(now); // source older than workflow SLA, no destination
  for (const event of overdue) {
    const incident = await db.openIncidentOnce(event.workflow_id, "unmatched", event.correlation_id);
    if (incident.created) await db.enqueueEmail(incident.id);
  }
  await db.resolveMatchedIncidents();
  await db.openMissedCadenceIncidents(now);
}
```

```tsx
// app/dashboard/workflows/[id]/HealthCard.tsx
export function HealthCard({ workflow }: { workflow: { name:string; status:string; lastSource?:string; lastDestination?:string } }) {
  return <article aria-label={`${workflow.name} health`} className="rounded border p-4">
    <div className="flex justify-between"><h2>{workflow.name}</h2><strong>{workflow.status}</strong></div>
    <dl><dt>Last source</dt><dd>{workflow.lastSource ?? "Never"}</dd><dt>Last destination</dt><dd>{workflow.lastDestination ?? "Never"}</dd></dl>
  </article>;
}
```

## Verification & Test Report (QA)

```ts
// tests/ingestion.test.ts
it("rejects an invalid key without writing", async () => {
  const r = await postEvent("bad-key", validEvent);
  expect(r.status).toBe(401); expect(await countEvents()).toBe(0);
});
it("is idempotent", async () => {
  await postEvent(key, validEvent); await postEvent(key, validEvent);
  expect(await countEvents()).toBe(1);
});
it("opens one incident for an unmatched source", async () => {
  await seedSource({ ageMinutes: 31, slaMinutes: 30 });
  await evaluate(fixedNow); await evaluate(fixedNow);
  expect(await openIncidents()).toHaveLength(1); expect(await queuedEmails()).toHaveLength(1);
});
```

**Security/edge checklist:** forged project key; 8 KB+ payload; duplicate delivery; timestamps far in future; destination arriving before source; email retry; cross-tenant query; public-token brute force; daylight-saving cadence; quiet weekends. **QA verdict:** buildable, but not releasable until RLS and idempotent incident/email tests pass.

---

# 2. ChangeOrder Lite — Subcontractor Approval Packets

## Executive Summary (PO)

### Vision, buyer, and value

A mobile-first change-order request tool for specialty subcontractors who need documented approval without buying a full construction platform. The buyer is an owner/PM at a 2–30 person subcontractor. Promise: **turn field evidence into an approvable, signed packet in minutes and reduce unpaid extra work.**

### Before / after (BA)

- **Before:** field notes/photos → office spreadsheet → PDF → Bluebeam → email → follow-up → approved file copied into folders/accounting log.
- **After:** PM opens a project, records scope/cost/photos, sends a no-login approval link, and receives a timestamped signed PDF and CSV-ready status.

### MVP scope — exactly three features

1. Create a change-order request with scope, line items, markup/tax, photos, and automatic numbering.
2. Send a single-use approval/rejection link; capture signer name, decision, note, timestamp, and IP hash.
3. Generate an immutable PDF packet and project register export.

**Cut:** estimating, accounting sync, schedules, RFIs, native e-sign regulation claims, payments, mobile apps, and multi-level approval.

### Success metrics

- Median draft-to-send time under 5 minutes.
- 70% of customer requests receive a decision through the link.
- 25 live requests across 5 subcontractors in pilot.
- No approved packet can be edited without issuing a revision.

### Feasibility, risks, and acceptance

- **Dependencies:** Supabase Storage, HTML-to-PDF service/library, email, signed random tokens.
- **Bottleneck:** Some GCs mandate Procore. Target only firms permitted to email CORs.
- **Privacy/legal:** store project contacts and jobsite photos; encrypt transport, private buckets, retention controls. Label as workflow approval, not a jurisdiction-specific qualified e-signature.
- **Done when:** totals are deterministic; unauthenticated users can access only the tokenized request; approve/reject works once; approval freezes revision; PDF hash is stored; CSV matches displayed register.

### PO/BA challenge log and CEO approval

- **PO:** Voice transcription and QuickBooks sync are attractive distractions.
- **BA:** Field adoption matters, but camera upload plus concise fields solves v1; voice can follow usage evidence.
- **BA:** “Signature” could imply legal guarantees.
- **PO:** Call it documented approval and retain full audit evidence.
- **CEO:** **Approved** for contractors whose submission channel is email.

## System Architecture & Data Flow (BA/Dev)

```text
Authenticated PM → draft + line items + private photos → calculate totals
        → issue 256-bit decision token → GC no-login page → approve/reject
        → freeze revision → render PDF → hash/store → notify PM → CSV export
```

```sql
create table projects (id uuid primary key default gen_random_uuid(), organization_id uuid not null, name text not null, next_co_number int not null default 1);
create table change_orders (
 id uuid primary key default gen_random_uuid(), project_id uuid references projects not null, number int not null,
 revision int not null default 0, title text not null, scope text not null, subtotal_cents bigint not null,
 markup_bps int not null default 0, tax_bps int not null default 0, total_cents bigint not null,
 status text not null default 'draft', token_hash text, token_expires_at timestamptz, frozen_at timestamptz,
 unique(project_id, number, revision)
);
create table line_items (id uuid primary key default gen_random_uuid(), change_order_id uuid references change_orders on delete cascade, description text not null, quantity numeric not null, unit text not null, unit_price_cents bigint not null);
create table evidence (id uuid primary key default gen_random_uuid(), change_order_id uuid references change_orders, storage_path text not null, sha256 text not null);
create table decisions (id uuid primary key default gen_random_uuid(), change_order_id uuid unique references change_orders, decision text check(decision in ('approved','rejected')), signer_name text not null, note text, decided_at timestamptz not null, ip_hash text not null);
```

## Core Source Code Blueprint (Dev)

```ts
// lib/money.ts — integer cents and basis points prevent float errors
export function total(subtotal: number, markupBps: number, taxBps: number) {
  const marked = subtotal + Math.round(subtotal * markupBps / 10_000);
  return marked + Math.round(marked * taxBps / 10_000);
}
```

```ts
// app/api/public/change-orders/[token]/decision/route.ts
const Decision = z.object({ decision: z.enum(["approved","rejected"]), signerName: z.string().min(2).max(120), note: z.string().max(1000).optional() });
export async function POST(req: Request, { params }: { params: Promise<{token:string}> }) {
  const body = Decision.parse(await req.json()); const { token } = await params;
  const ipHash = hash(`${process.env.IP_SALT}:${req.headers.get("x-forwarded-for") ?? "unknown"}`);
  const result = await db.transaction(tx => tx.decideByToken(hash(token), body, ipHash));
  if (result.kind === "missing") return Response.json({ error:"invalid_or_expired" }, { status:404 });
  if (result.kind === "decided") return Response.json({ error:"already_decided" }, { status:409 });
  await jobs.renderFrozenPacket(result.changeOrderId);
  return Response.json({ ok:true });
}
```

```tsx
"use client";
import type { FormEvent } from "react";
export function DecisionForm({ token, total }: {token:string; total:string}) {
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); const form=e.currentTarget; const clicked=(e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement;
    const r=await fetch(`/api/public/change-orders/${token}/decision`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({signerName:new FormData(form).get("signerName"),decision:clicked.value})});
    if(!r.ok) throw new Error("Decision could not be saved"); form.replaceWith(document.createTextNode("Decision recorded"));
  }
  return <form onSubmit={submit}><p>Total: <strong>{total}</strong></p><label>Name <input required name="signerName" /></label>
    <button value="approved">Approve</button><button value="rejected">Reject</button></form>;
}
```

## Verification & Test Report (QA)

- Unit-test basis-point totals, negative/zero quantity rejection, and maximum cents.
- Concurrent approval requests: one returns success, one `409`.
- Expired/guessed token returns no project metadata.
- Approved record cannot be updated; “Revise” clones to revision +1.
- PDF displays identical total, evidence hashes, and decision timestamp.
- Storage URLs expire and cannot cross organizations.

**QA verdict:** feasible. PDF generation must run from frozen database state—not request-form values—and the database transaction must enforce one decision.

---

# 3. FixProof — Property Maintenance Handoff Tracker

## Executive Summary (PO)

### Vision, buyer, and value

FixProof closes the gap between a PMS ticket and real-world completion. The buyer is an operations manager overseeing 50–500 units and independent vendors. Promise: **assign by text, collect proof, keep tenants informed, and never confuse “closed” with “fixed.”**

### Before / after (BA)

- **Before:** ticket in PMS, vendor text thread, photos in camera roll, approval in email, tenant calls for updates, manager manually closes ticket.
- **After:** forward a request, send a no-login vendor assignment, collect required proof, notify stakeholders, and close only after manager verification.

### MVP scope — exactly three features

1. Create/import a work order by forwarding email or entering a short form; assign vendor through expiring SMS/email link.
2. Vendor updates status and uploads required before/after evidence without an account.
3. Rules send tenant/manager updates and escalate overdue assignments; manager verifies closure.

**Cut:** rent, leases, accounting, vendor marketplace, quoting, payments, native PMS write-back, and AI diagnosis.

### Metrics, feasibility, and acceptance

- 80% of vendor updates occur without manager follow-up.
- Tenant “what is the status?” contacts decrease 30% in pilot.
- 90% of closed jobs contain required evidence.
- **Dependencies:** Twilio or email-first fallback, Storage, inbound-email parser, scheduler.
- **Risk:** SMS consent and PII. Record consent/source, use transactional templates, mask tenant details from vendor unless needed, and set photo retention.
- **Done:** vendor token exposes one work order; overdue escalation fires once per threshold; closure is blocked until configured evidence exists; tenant receives only approved status text; all transitions are audited.

### PO/BA challenge log and CEO approval

- **BA:** Deep AppFolio/Buildium integration is the obvious demand.
- **PO:** It is also the schedule killer. Forwarded email and CSV import validate the handoff first.
- **PO:** Tenant chat is scope creep.
- **BA:** Transactional status messages are retained because they directly eliminate calls; replies remain out of scope.
- **CEO:** **Approved** with email assignment as default and SMS as a paid/pilot option.

## System Architecture & Data Flow (BA/Dev)

```sql
create table properties (id uuid primary key default gen_random_uuid(), organization_id uuid not null, label text not null);
create table work_orders (id uuid primary key default gen_random_uuid(), property_id uuid references properties, summary text not null, tenant_contact text, status text not null default 'new', due_at timestamptz, evidence_policy jsonb not null default '{"afterPhotos":1}');
create table assignments (id uuid primary key default gen_random_uuid(), work_order_id uuid references work_orders, vendor_name text not null, vendor_contact text not null, token_hash text not null unique, expires_at timestamptz not null, accepted_at timestamptz);
create table updates (id bigint generated always as identity primary key, work_order_id uuid references work_orders, actor text not null, status text not null, note text, created_at timestamptz default now());
create table photos (id uuid primary key default gen_random_uuid(), work_order_id uuid references work_orders, kind text check(kind in ('before','after')), storage_path text not null, sha256 text not null);
create table notifications (id uuid primary key default gen_random_uuid(), work_order_id uuid references work_orders, template text not null, recipient_hash text not null, sent_at timestamptz, unique(work_order_id, template));
```

```text
Manager/email → work order → assignment token → vendor browser
                                      ├─ accept/status
                                      └─ signed upload URLs → private evidence
Scheduler → overdue rules → outbox → email/SMS
Manager verifies evidence → closed → tenant completion notice
```

## Core Source Code Blueprint (Dev)

```ts
// app/api/public/assignments/[token]/complete/route.ts
const Complete = z.object({ note:z.string().min(1).max(1000), afterPhotoIds:z.array(z.string().uuid()).min(1) });
export async function POST(req:Request, ctx:{params:Promise<{token:string}>}) {
  const data = Complete.parse(await req.json()); const {token}=await ctx.params;
  const assignment = await db.assignmentByToken(hash(token));
  if (!assignment || assignment.expires_at < new Date()) return Response.json({error:"invalid"},{status:404});
  const owned = await db.photosBelongToWorkOrder(data.afterPhotoIds, assignment.work_order_id, "after");
  if (!owned) return Response.json({error:"invalid_evidence"},{status:400});
  await db.transition(assignment.work_order_id, "awaiting_verification", "vendor", data.note);
  await db.enqueueManagerNotice(assignment.work_order_id);
  return Response.json({ok:true});
}
```

```tsx
export function VendorUpdate({ assignment }:{assignment:{summary:string; status:string}}) {
 return <main><h1>{assignment.summary}</h1><p>Status: {assignment.status}</p>
   <form encType="multipart/form-data"><input type="file" accept="image/*" capture="environment" required />
   <textarea name="note" required /><button>Submit completion proof</button></form></main>;
}
```

## Verification & Test Report (QA)

- Token cannot list other properties, tenant contacts, or vendor records.
- MIME sniffing rejects executable files renamed `.jpg`; uploads have size/count limits.
- Vendor cannot mark `closed`; only `awaiting_verification`.
- Manager cannot close when evidence policy is unmet.
- Scheduler is idempotent and respects property timezone/business hours.
- STOP/opt-out and invalid phone handling do not retry forever.

**QA verdict:** releasable after public-page privacy review, file scanning, and notification idempotency tests.

---

# 4. PlateDelta — Restaurant Invoice Price-Drift Alerts

## Executive Summary (PO)

### Vision, buyer, and value

PlateDelta is an affordable invoice inbox that answers one question: **what became materially more expensive?** The buyer is an owner/operator of one to five restaurants priced out of full restaurant back-office suites.

### Before / after (BA)

- **Before:** invoice photo/PDF → manual line entry → inconsistent units → stale recipe spreadsheet → margin surprise.
- **After:** forward invoice → review uncertain extracted lines → normalized price history → weekly price/pack-size alerts and CSV/Sheets export.

### MVP scope — exactly three features

1. Invoice upload/email ingestion and structured extraction of vendor, invoice number, date, item, pack, quantity, and line price.
2. Human review queue plus vendor-item mapping and unit/pack normalization.
3. Threshold alerts showing prior/current comparable unit price and downloadable verified CSV.

**Cut:** payments, accounting write-back, inventory counts, POS integration, recipe costing UI, ordering, vendor negotiation, and fully autonomous extraction.

### Metrics, feasibility, and acceptance

- 95% of verified lines have correct vendor item, quantity, pack, and price.
- Review takes under 90 seconds for a 30-line familiar-vendor invoice.
- Five restaurants find at least one actionable increase in four weeks.
- **Dependencies:** private storage, OCR/document model, background worker, email ingress.
- **Bottleneck:** unit normalization, credits, substitutions, and pack-size changes—not OCR text recognition.
- **Privacy:** invoices include addresses, account numbers, pricing. Private storage, short raw-file retention, tenant isolation, no training on customer data.
- **Done:** duplicate invoice is detected; low-confidence fields require review; alert compares normalized like-for-like units; user can correct mapping; only verified lines export.

### PO/BA challenge log and CEO approval

- **PO:** Recipe impact is cut despite sales appeal; it requires recipe/unit setup before first value.
- **BA:** Pack normalization cannot be cut because false price alerts destroy trust.
- **QA pre-mortem:** A confident but wrong OCR value is worse than manual work.
- **CEO:** **Approved** as human-in-the-loop price monitoring, never “zero-touch AP.”

## System Architecture & Data Flow (BA/Dev)

```sql
create table vendors (id uuid primary key default gen_random_uuid(), organization_id uuid not null, name text not null);
create table invoices (id uuid primary key default gen_random_uuid(), vendor_id uuid references vendors, invoice_number text not null, invoice_date date, storage_path text not null, sha256 text not null, status text not null default 'queued', unique(vendor_id, invoice_number));
create table catalog_items (id uuid primary key default gen_random_uuid(), vendor_id uuid references vendors, vendor_sku text, canonical_name text not null, base_unit text not null, units_per_pack numeric not null);
create table invoice_lines (id uuid primary key default gen_random_uuid(), invoice_id uuid references invoices, catalog_item_id uuid references catalog_items, raw_description text not null, quantity numeric, pack_text text, line_total_cents bigint, unit_price_micros bigint, confidence numeric, verified_at timestamptz);
create table price_alerts (id uuid primary key default gen_random_uuid(), invoice_line_id uuid unique references invoice_lines, prior_unit_price_micros bigint not null, change_bps int not null, status text not null default 'new');
```

```text
Upload/inbound email → hash/dedupe → private object → extraction worker
 → raw line candidates → review/mapping → normalized micro-price per base unit
 → compare with last verified purchase → alert digest + CSV
```

## Core Source Code Blueprint (Dev)

```py
# worker/normalize.py
from decimal import Decimal, ROUND_HALF_UP

def normalized_unit_price(line_total_cents:int, quantity:str, units_per_pack:str) -> int:
    denominator = Decimal(quantity) * Decimal(units_per_pack)
    if denominator <= 0: raise ValueError("quantity and pack units must be positive")
    dollars_per_unit = (Decimal(line_total_cents) / Decimal(100)) / denominator
    return int((dollars_per_unit * Decimal(1_000_000)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))

def change_bps(previous:int, current:int) -> int:
    if previous <= 0: raise ValueError("previous price must be positive")
    return round((current - previous) * 10_000 / previous)
```

```ts
// app/api/invoices/[id]/verify/route.ts
const Lines = z.array(z.object({ id:z.string().uuid(), catalogItemId:z.string().uuid(), quantity:z.coerce.number().positive(), unitsPerPack:z.coerce.number().positive(), lineTotalCents:z.number().int().nonnegative() }));
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}) {
 const {id}=await params; const lines=Lines.parse(await req.json());
 await db.verifyInvoiceAtomically(id, lines, { alertThresholdBps:500 });
 return Response.json({verified:true});
}
```

## Verification & Test Report (QA)

- Golden-file tests for 20 invoices: multi-page, credit memo, decimal quantity, repeated SKU, tax/freight, handwritten note.
- Unit tests for case/each/lb/oz conversion and changed pack size.
- Never compare unverified or unlike units.
- Duplicate hash and duplicate vendor/invoice number produce review warning, not double history.
- Cross-tenant signed URL and export attempts fail.
- Extraction timeout moves to retry/dead-letter state; it never leaves “processing” forever.

**QA verdict:** product trust depends on the review UX and golden data set. Do not market an accuracy percentage until measured on customer invoices.

---

# 5. DisputePacket — Shopify Chargeback Evidence Assembler

## Executive Summary (PO)

### Vision, buyer, and value

DisputePacket gives low-volume, high-AOV Shopify merchants a complete, reason-code-specific evidence packet without managed-recovery pricing. Promise: **know what is missing, assemble the timeline, and submit before the deadline.** It does not promise a win.

### Before / after (BA)

- **Before:** dispute notice → search order/tracking/email/chat/policies → screenshots → manually written cover letter/PDF → uncertainty over refund timing.
- **After:** app imports dispute/order evidence, requests missing documents, generates an indexed draft packet, and tracks submission deadline.

### MVP scope — exactly three features

1. Shopify app imports disputes/orders/fulfillments and builds an evidence timeline.
2. Reason-code checklist accepts manual uploads and flags missing required evidence.
3. Generate a merchant-reviewed cover letter and immutable indexed PDF; remind on deadline.

**Cut:** automatic submission, Gmail/helpdesk integrations, fraud scoring, recovery guarantees, customer outreach, and social-media research.

### Metrics, feasibility, and acceptance

- Packet assembly under 15 minutes for an order with tracking.
- 90% of pilot disputes produce a packet before the processor deadline.
- Merchant edits fewer than 20% of generated factual fields.
- **Dependencies:** Shopify OAuth/Admin API/webhooks, private storage, PDF renderer, email.
- **Bottleneck:** API availability differs by payment/dispute context; manual dispute entry is the fallback.
- **Privacy/security:** orders contain PII and payment metadata. Request minimum scopes, verify HMAC, encrypt secrets, redact unnecessary fields, delete on uninstall per Shopify requirements.
- **Done:** valid webhook only; no unsupported factual claims; every assertion links to evidence; missing items remain visible; generated packet is versioned and hashed; refund warning appears while dispute is open.

### PO/BA challenge log and CEO approval

- **BA:** Email/chat integration would eliminate the largest manual collection step.
- **PO:** OAuth breadth and provider variability delay launch; upload/forward evidence first.
- **QA:** LLM-authored legal claims create hallucination and liability.
- **PO:** Deterministic templates populate facts only; optional language polishing cannot add claims.
- **CEO:** **Approved** as evidence organization, not legal advice or outcome prediction.

## System Architecture & Data Flow (BA/Dev)

```sql
create table shops (id uuid primary key default gen_random_uuid(), shop_domain text unique not null, access_token_ciphertext text not null, uninstalled_at timestamptz);
create table disputes (id uuid primary key default gen_random_uuid(), shop_id uuid references shops, external_id text, reason_code text not null, amount_cents bigint not null, due_at timestamptz not null, status text not null, unique(shop_id, external_id));
create table evidence_items (id uuid primary key default gen_random_uuid(), dispute_id uuid references disputes, kind text not null, source text not null, occurred_at timestamptz, storage_path text, facts jsonb not null default '{}', sha256 text);
create table packet_versions (id uuid primary key default gen_random_uuid(), dispute_id uuid references disputes, version int not null, storage_path text not null, sha256 text not null, created_at timestamptz default now(), unique(dispute_id, version));
```

## Core Source Code Blueprint (Dev)

```ts
// app/api/shopify/webhooks/route.ts
import crypto from "node:crypto";
export async function POST(req:Request) {
 const raw=Buffer.from(await req.arrayBuffer());
 const provided=req.headers.get("x-shopify-hmac-sha256") ?? "";
 const expected=crypto.createHmac("sha256",process.env.SHOPIFY_API_SECRET!).update(raw).digest("base64");
 const valid=provided.length===expected.length && crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(expected));
 if(!valid) return new Response("invalid hmac",{status:401});
 await jobs.enqueueWebhook(req.headers.get("x-shopify-webhook-id")!, raw.toString("utf8"));
 return new Response(null,{status:200});
}
```

```tsx
export function EvidenceChecklist({items}:{items:{label:string; state:"present"|"missing"; source?:string}[]}) {
 return <ul>{items.map(i=><li key={i.label}><span aria-label={i.state}>{i.state==="present"?"✓":"!"}</span> {i.label}{i.source&&<small> — {i.source}</small>}</li>)}</ul>;
}
```

## Verification & Test Report (QA)

- Reject altered webhook body/HMAC and duplicate webhook IDs.
- Uninstalled shop token is unusable and deletion workflow removes PII.
- Reason-code fixtures produce expected checklist without claiming universal bank rules.
- A packet cannot say “customer never contacted us” unless evidence explicitly supports it.
- Currency, partial refunds, split fulfillment, digital delivery, and returned-item cases render correctly.
- Deadline timezone is visible and reminder jobs are idempotent.

**QA verdict:** feasible but platform review and privacy compliance may exceed two weeks. A custom-app pilot with 3–5 stores should precede public App Store submission.

---

# 6. LedgerExit — Accounting Migration Verifier

## Executive Summary (PO)

### Vision, buyer, and value

LedgerExit independently verifies that an accounting migration is complete. The buyer is a bookkeeper or migration consultant moving a client from QuickBooks to another ledger. Promise: **find missing, duplicated, and out-of-balance records before the old system is cancelled.**

### Before / after (BA)

- **Before:** export/import → spot-check reports → discover missing attachments or duplicates later → expensive cleanup and professional risk.
- **After:** upload standardized source/destination exports → map accounts/entities → run deterministic reconciliations → deliver signed exception report and archive manifest.

### MVP scope — exactly three features

1. Securely ingest a documented QuickBooks CSV export bundle and one destination format (Xero CSV first).
2. Reconcile trial balance, transaction counts/totals, AR/AP aging, contacts, classes/tracking, and duplicate signatures as of a chosen date.
3. Produce an exception report plus file/archive manifest with checksums.

**Cut:** direct database access, write-back, automated migration, payroll, inventory valuation, tax advice, every destination, and attachment content transfer.

### Metrics, feasibility, and acceptance

- Detect 100% of seeded missing/duplicate/out-of-balance fixtures.
- Process 100k transactions in under 10 minutes.
- Three bookkeeping firms pay for a real validation.
- **Dependencies:** Python worker, object storage, Postgres job metadata, PDF report.
- **Bottleneck:** exports differ by locale/version and accounting semantics. Start with a prescribed export checklist, not arbitrary files.
- **Privacy:** highly sensitive financial records. Signed uploads, encryption, configurable deletion, no production data in logs, regional disclosure, processor agreements.
- **Done:** debit/credit signs normalize consistently; opening/closing balance equations are explicit; every exception links to source rows; rerun is deterministic; report labels unsupported areas; deletion is verifiable.

### PO/BA challenge log and CEO approval

- **PO:** “Support any migration” is rejected.
- **BA:** QuickBooks Desktop CSV to Xero CSV is narrow but still needs locale and account mapping.
- **QA:** A false clean report is catastrophic.
- **PO:** Product reports tested checks only and prominently lists unverified domains; no global “migration certified” badge.
- **CEO:** **Approved** for accountant-assisted use, not self-serve owner migration.

## System Architecture & Data Flow (BA/Dev)

```sql
create table migration_jobs (id uuid primary key default gen_random_uuid(), organization_id uuid not null, cutoff_date date not null, source_type text not null, destination_type text not null, status text not null default 'uploaded', deletion_due_at timestamptz not null);
create table uploaded_files (id uuid primary key default gen_random_uuid(), migration_job_id uuid references migration_jobs, side text check(side in ('source','destination')), kind text not null, storage_path text not null, sha256 text not null, row_count int);
create table checks (id uuid primary key default gen_random_uuid(), migration_job_id uuid references migration_jobs, code text not null, status text check(status in ('pass','fail','unsupported')), source_value jsonb, destination_value jsonb, unique(migration_job_id, code));
create table exceptions (id bigint generated always as identity primary key, check_id uuid references checks, severity text not null, entity_key text, explanation text not null, source_refs jsonb, destination_refs jsonb);
```

```text
Browser → signed upload URLs → encrypted storage → job queue
 → isolated Python parser/normalizer → canonical temporary tables
 → deterministic checks → exceptions/check status → PDF + JSON report
 → scheduled hard deletion of raw and canonical data
```

## Core Source Code Blueprint (Dev)

```py
# worker/reconcile.py
from dataclasses import dataclass
from decimal import Decimal
@dataclass(frozen=True)
class Entry:
    external_id:str; account:str; date:str; debit:Decimal; credit:Decimal

def signature(e:Entry):
    return (e.account, e.date, e.debit.quantize(Decimal('.01')), e.credit.quantize(Decimal('.01')))

def reconcile(source:list[Entry], destination:list[Entry]):
    def aggregate(rows):
        out={}
        for r in rows: out[r.account]=out.get(r.account,Decimal(0))+r.debit-r.credit
        return out
    sa,da=aggregate(source),aggregate(destination)
    accounts=sorted(set(sa)|set(da))
    balances=[{"account":a,"source":sa.get(a,0),"destination":da.get(a,0),"delta":sa.get(a,0)-da.get(a,0)} for a in accounts]
    return {"balances":balances,"balanced":all(x["delta"]==0 for x in balances)}
```

```ts
// app/api/migrations/[id]/run/route.ts
export async function POST(_:Request,{params}:{params:Promise<{id:string}>}) {
 const {id}=await params; const job=await db.authorizedJob(id);
 if(!job) return Response.json({error:"not_found"},{status:404});
 const missing=await db.requiredFilesMissing(id);
 if(missing.length) return Response.json({error:"missing_files",missing},{status:409});
 await db.markQueuedOnce(id); await queue.send({jobId:id});
 return Response.json({status:"queued"},{status:202});
}
```

## Verification & Test Report (QA)

- Property-based tests preserve total debits/credits through parser normalization.
- Golden fixtures: comma decimal locale, multiline memo, duplicate ID, same-value legitimate transactions, deleted/void entry, foreign currency, cutoff boundary.
- Seed one missing transaction and one duplicate; both must be identified with row references.
- Worker has no public network egress and logs no row content.
- Tenant cannot access signed file/report URLs after deletion or expiry.
- Report distinguishes `pass`, `fail`, and `unsupported`; unsupported is never counted as pass.

**QA verdict:** highest-risk build. Limit pilot to synthetic/redacted exports, obtain accountant review of equations, and carry professional disclaimers before accepting production books.

---

# 7. ReportNarrator — Governed Agency Reports

## Executive Summary (PO)

### Vision, buyer, and value

ReportNarrator turns a controlled Google Sheet into a branded Google Slides report whose commentary is traceable to source cells. The buyer is a boutique PPC/SEO agency with 5–30 clients. Promise: **generate the repetitive 80%, keep human approval for the meaningful 20%.**

### Before / after (BA)

- **Before:** account manager exports metrics, copies charts, updates dates, drafts narrative, duplicates slides, checks every number, and sends PDF.
- **After:** mapped ranges populate a locked template, deterministic insight rules draft claims with source links, manager approves, and PDF is created.

### MVP scope — exactly three features

1. Google Sheets sidebar maps named ranges to text/chart placeholders in one Slides template.
2. Generate client-specific deck and rule-based commentary with a citation note pointing to source range and refresh time.
3. Approval checklist and PDF export to a chosen Drive folder.

**Cut:** ad-platform connectors, autonomous email, LLM free-writing, portal, scheduling, billing, multi-language, and non-Google formats.

### Metrics, feasibility, and acceptance

- Reduce preparation time by 60% for recurring report.
- Zero metric values in approved reports differ from mapped cells.
- Five agencies generate two monthly cycles.
- **Dependencies:** Google Apps Script, Sheets/Slides/Drive APIs, Workspace OAuth.
- **Bottleneck:** chart fidelity and template drift. Use explicit placeholder IDs and validation.
- **Privacy:** agency controls Drive files; request least-privilege scopes and avoid copying data to an external server in v1.
- **Done:** missing placeholder blocks generation; values carry range/timestamp metadata; source edits after generation mark report stale; export requires all checklist items; client files are never cross-populated.

### PO/BA challenge log and CEO approval

- **BA:** Users asked for insights, not only mail merge.
- **PO:** Deterministic rules—threshold, trend, target variance—provide useful narrative without hallucinating causes.
- **QA:** Apps Script tests are awkward.
- **Dev:** Isolate pure mapping/insight functions for local unit tests and keep Google adapters thin.
- **CEO:** **Approved** as a Google Workspace add-on prototype.

## System Architecture & Data Flow (BA/Dev)

```text
Sheets sidebar → validate named ranges + template placeholder IDs
 → duplicate Slides template → replace text/table/chart snapshots
 → apply deterministic insight rules → write source-note metadata
 → approval checklist → Drive PDF export
No external database in v1; config lives in hidden protected sheet + Script Properties.
```

## Core Source Code Blueprint (Dev)

```ts
// apps-script/src/generate.ts
export type Metric={key:string; label:string; current:number; previous?:number; target?:number; sourceRange:string};
export function insight(m:Metric):string {
 if(m.target!==undefined){const d=(m.current-m.target)/Math.abs(m.target||1); if(Math.abs(d)>=.05) return `${m.label} is ${Math.abs(d*100).toFixed(1)}% ${d>0?"above":"below"} target.`;}
 if(m.previous!==undefined){const d=(m.current-m.previous)/Math.abs(m.previous||1); return `${m.label} ${d>=0?"increased":"decreased"} ${Math.abs(d*100).toFixed(1)}% versus the previous period.`;}
 return `${m.label} is ${m.current.toLocaleString()}.`;
}
export function replacePlaceholders(deckId:string, values:Record<string,string>){
 const deck=SlidesApp.openById(deckId);
 const allText=deck.getSlides().flatMap(s=>s.getShapes()).map(s=>s.getText().asString()).join("\n");
 for(const [key,value] of Object.entries(values)) {
   const token=`{{${key}}}`;
   if(!allText.includes(token)) throw new Error(`Missing placeholder: ${key}`);
   deck.replaceAllText(token,value);
 }
 deck.saveAndClose();
}
```

```html
<!-- apps-script/src/sidebar.html -->
<form id="generate"><label>Client <select id="client"></select></label><label>Template URL <input id="template" required></label><button>Validate and generate</button></form>
<script>document.querySelector('#generate').onsubmit=e=>{e.preventDefault();google.script.run.withSuccessHandler(id=>alert(`Created ${id}`)).generateReport({client:client.value,template:template.value});};</script>
```

## Verification & Test Report (QA)

- Pure-function unit tests cover zero previous value, negative metrics, target direction, rounding, and locale.
- Template fixture missing one placeholder must fail before creating client output.
- Two client fixtures run sequentially and verify no value leakage.
- Change a source cell after generation; stale marker appears and approval is revoked.
- OAuth scopes contain only required current-file/Drive capabilities.
- Export blocked until metric freshness, client identity, date range, and human review checks pass.

**QA verdict:** easiest MVP. Replace the illustrative regex adapter with exact-token replacement and test on copies, never client originals.

---

# 8. BillableRecall — Privacy-First Time Reconstruction

## Executive Summary (PO)

### Vision, buyer, and value

BillableRecall helps consultants recover forgotten billable fragments without screenshots or keylogging. The buyer is a fractional consultant or freelancer with 3–10 active clients. Promise: **a private daily timeline that suggests—not submits—clear billable entries.**

### Before / after (BA)

- **Before:** forget timer → inspect calendar/tabs/messages on Friday → guess project and duration → rewrite fragments for invoice → miss retainer threshold.
- **After:** opt-in domains and calendar events form a local timeline; user groups/edits suggestions, approves export, and gets a budget warning.

### MVP scope — exactly three features

1. Chrome MV3 extension records active time for explicitly allow-listed domains into IndexedDB; idle time is excluded.
2. Import Google Calendar `.ics`/OAuth events and locally suggest client/project groups plus editable descriptions.
3. User-approved CSV export and local retainer budget warnings.

**Cut:** screenshots, keystrokes, page content, native desktop activity, cloud sync, invoicing APIs, teams, AI server calls, and automatic submission.

### Metrics, feasibility, and acceptance

- Users recover at least 30 minutes/week they would otherwise omit.
- Daily review takes under 3 minutes.
- 70% of suggested blocks are accepted after edit/grouping.
- **Dependencies:** Chrome extension APIs, IndexedDB, idle permission; optional Google Calendar OAuth may complicate store review, so ICS import is first.
- **Privacy:** URLs can reveal sensitive data. Store hostname only, never path/title/content; local-only by default; clear pause/delete/export controls; narrow permissions.
- **Done:** non-allow-listed domains are never persisted; idle time is excluded; no data leaves browser during normal use; export contains only approved entries; deleting local data is irreversible; retainer warning uses approved + draft totals distinctly.

### PO/BA challenge log and CEO approval

- **BA:** Browser-only misses IDE, email apps, calls, and thinking time.
- **PO:** True, but native desktop monitoring violates the two-week and privacy wedge. Calendar plus browser validates demand.
- **QA:** Even hostnames can be sensitive.
- **PO:** Explicit per-domain consent, local storage, pause indicator, and deletion are launch blockers.
- **CEO:** **Approved** as a Chrome extension, with no backend in v1.

## System Architecture & Data Flow (BA/Dev)

```text
chrome.tabs + chrome.idle → allow-list check → local active intervals (IndexedDB)
ICS calendar import ────────────────────────┘
 → local grouping rules (domain/calendar keyword → client/project)
 → review UI → approved entries → CSV download + retainer counters
No remote server, analytics payload, or cloud database in MVP.
```

## Core Source Code Blueprint (Dev)

```json
{
  "manifest_version": 3,
  "name": "BillableRecall",
  "version": "0.1.0",
  "permissions": ["tabs", "idle", "storage", "alarms"],
  "background": {"service_worker": "background.js", "type": "module"},
  "action": {"default_popup": "popup.html"},
  "options_page": "options.html"
}
```

```ts
// extension/src/background.ts
const state:{tabId?:number; host?:string; startedAt?:number; idle:boolean}={idle:false};
chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener(s=>{state.idle=s!=="active"; if(state.idle) void flush();});
chrome.tabs.onActivated.addListener(async ({tabId})=>{await flush(); const tab=await chrome.tabs.get(tabId); await begin(tab);});
chrome.tabs.onUpdated.addListener(async (tabId,info,tab)=>{if(tab.active&&info.url){await flush();await begin(tab);}});
async function begin(tab:chrome.tabs.Tab){
 if(state.idle||!tab.url)return; const host=new URL(tab.url).hostname; const {allowlist=[]}=await chrome.storage.local.get("allowlist");
 if(allowlist.includes(host)){state.tabId=tab.id;state.host=host;state.startedAt=Date.now();}
}
async function flush(){
 if(state.host&&state.startedAt){const endedAt=Date.now(); if(endedAt-state.startedAt>=15_000) await saveInterval({host:state.host,startedAt:state.startedAt,endedAt});}
 delete state.tabId;delete state.host;delete state.startedAt;
}
```

```tsx
// extension/src/review/Review.tsx
export function Review({blocks,onApprove}:{blocks:{id:string;client?:string;minutes:number;description:string}[];onApprove:(id:string)=>void}){
 return <main><h1>Review locally recorded time</h1>{blocks.map(b=><article key={b.id}><strong>{b.client??"Unassigned"}</strong><span>{b.minutes} min</span><input defaultValue={b.description}/><button onClick={()=>onApprove(b.id)}>Approve</button></article>)}</main>;
}
```

## Verification & Test Report (QA)

- Visit a non-allow-listed sensitive domain and verify IndexedDB contains no hostname or interval.
- Transition active → idle → active and verify no idle duration is counted.
- Close browser/service worker mid-interval; recovery does not create an overnight block.
- Paths, query strings, titles, and page contents never appear in storage/export.
- Export includes approved rows only and escapes spreadsheet-formula prefixes (`=`, `+`, `-`, `@`).
- Pause icon/state is visible; delete wipes IndexedDB and extension storage.
- Static scan confirms no fetch/XHR/WebSocket/analytics dependency in production bundle.

**QA verdict:** feasible and privacy-differentiated. Chrome permission copy and local-data behavior must be independently audited before store submission.

---

# Portfolio-Level CEO Decision

## Build order

1. **ReportNarrator** — fastest paid concierge test and lowest platform/backend risk.
2. **OutcomeWatch** — strongest recurring B2B value and agency distribution.
3. **ChangeOrder Lite** — direct revenue outcome, but requires domain interviews.
4. **FixProof** — attractive operational pain; validate vendor link/SMS adoption.
5. **PlateDelta** — valuable but data-normalization heavy.
6. **BillableRecall** — good privacy wedge in a crowded category.
7. **DisputePacket** — platform review and competitive pressure.
8. **LedgerExit** — high willingness to pay, highest correctness/liability burden.

## Cross-product release gates

No product advances from blueprint to public MVP until it has:

- Five problem interviews using a recent real incident or artifact.
- At least three users who commit money, data, or a live workflow—not only an email address.
- Passing tenant-isolation, authorization, idempotency, and deletion tests where applicable.
- A written list of unsupported behavior visible in onboarding.
- One measurable before/after outcome captured during a concierge pilot.

## Executive conclusion

All eight pain points can support narrowly scoped MVPs, but building eight products at once would violate the PO’s ROI discipline. The factory should validate them in portfolio order, stop weak candidates quickly, and reuse only proven infrastructure. The code above is the operational backbone for each MVP; production delivery still requires repository scaffolding, migrations, environment configuration, platform credentials, and the QA release gates specified in each submission.
