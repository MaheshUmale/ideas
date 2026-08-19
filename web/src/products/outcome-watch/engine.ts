import { z } from "zod";
import { randomToken, sha256 } from "@/lib/crypto";

export const EventSchema = z.object({
  correlationId: z.string().min(1).max(200),
  stage: z.enum(["source", "destination"]),
  occurredAt: z.string(),
  fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
});

export type IngestEvent = z.infer<typeof EventSchema>;

export type Workflow = {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  keyHash: string;
  slaMinutes: number;
  cadenceMinutes: number | null;
  requiredFields: string[];
  publicTokenHash: string | null;
};

export type StoredEvent = {
  id: number;
  workflowId: string;
  correlationId: string;
  stage: "source" | "destination";
  occurredAt: string;
  fields: Record<string, string | number | boolean | null>;
  createdAt: string;
};

export type Incident = {
  id: string;
  workflowId: string;
  kind: "unmatched" | "missed_cadence" | "required_field";
  correlationId: string | null;
  status: "open" | "resolved";
  openedAt: string;
  resolvedAt: string | null;
};

export type EmailJob = { id: string; incidentId: string; queuedAt: string };

const MAX_PAYLOAD_BYTES = 8 * 1024;

export class OutcomeWatch {
  workflows = new Map<string, Workflow>();
  events: StoredEvent[] = [];
  incidents: Incident[] = [];
  emails: EmailJob[] = [];
  private nextEventId = 1;

  seedDemo() {
    const key = "ow_live_demo_key_alpha";
    const publicToken = "status_acme_leads";
    this.workflows.set("wf-leads", {
      id: "wf-leads",
      clientId: "client-acme",
      clientName: "Acme Solar",
      name: "Lead → HubSpot",
      keyHash: sha256(key),
      slaMinutes: 30,
      cadenceMinutes: 60,
      requiredFields: ["email"],
      publicTokenHash: sha256(publicToken),
    });
    this.workflows.set("wf-invoices", {
      id: "wf-invoices",
      clientId: "client-north",
      clientName: "North Bookkeeping",
      name: "Invoice → QBO",
      keyHash: sha256("ow_live_demo_key_beta"),
      slaMinutes: 15,
      cadenceMinutes: null,
      requiredFields: ["invoiceId", "total"],
      publicTokenHash: sha256("status_north_invoices"),
    });
    return { demoKey: key, publicToken };
  }

  ingest(rawKey: string | null, body: unknown, payloadBytes: number, now = new Date()) {
    if (!rawKey) return { status: 401 as const, error: "unauthorized" };
    if (payloadBytes > MAX_PAYLOAD_BYTES) return { status: 413 as const, error: "payload_too_large" };
    const keyHash = sha256(rawKey);
    const workflow = [...this.workflows.values()].find((w) => w.keyHash === keyHash);
    if (!workflow) return { status: 401 as const, error: "unauthorized" };
    const parsed = EventSchema.safeParse(body);
    if (!parsed.success) return { status: 400 as const, error: parsed.error.flatten() };
    const unknown = Object.keys(parsed.data.fields).filter((k) => !workflow.requiredFields.includes(k));
    if (unknown.length) return { status: 400 as const, error: "field_not_allowlisted", fields: unknown };

    const exists = this.events.find(
      (e) =>
        e.workflowId === workflow.id &&
        e.correlationId === parsed.data.correlationId &&
        e.stage === parsed.data.stage,
    );
    if (!exists) {
      this.events.push({
        id: this.nextEventId++,
        workflowId: workflow.id,
        correlationId: parsed.data.correlationId,
        stage: parsed.data.stage,
        occurredAt: parsed.data.occurredAt,
        fields: parsed.data.fields,
        createdAt: now.toISOString(),
      });
      const missing = workflow.requiredFields.filter((f) => {
        const value = parsed.data.fields[f];
        return value === undefined || value === null || value === "";
      });
      if (missing.length) {
        this.openIncidentOnce(workflow.id, "required_field", parsed.data.correlationId, now);
      }
    }
    return { status: 202 as const, accepted: true };
  }

  evaluate(now = new Date()) {
    for (const event of this.unmatchedSources(now)) {
      const created = this.openIncidentOnce(event.workflowId, "unmatched", event.correlationId, now);
      if (created) this.enqueueEmail(created.id, now);
    }
    this.resolveMatchedIncidents(now);
    this.openMissedCadenceIncidents(now);
  }

  unmatchedSources(now: Date): StoredEvent[] {
    return this.events.filter((event) => {
      if (event.stage !== "source") return false;
      const workflow = this.workflows.get(event.workflowId);
      if (!workflow) return false;
      const ageMs = now.getTime() - new Date(event.occurredAt).getTime();
      if (ageMs < workflow.slaMinutes * 60_000) return false;
      return !this.events.some(
        (other) =>
          other.workflowId === event.workflowId &&
          other.correlationId === event.correlationId &&
          other.stage === "destination",
      );
    });
  }

  openIncidentOnce(
    workflowId: string,
    kind: Incident["kind"],
    correlationId: string | null,
    now: Date,
  ): Incident | null {
    const existing = this.incidents.find(
      (i) =>
        i.workflowId === workflowId &&
        i.kind === kind &&
        i.correlationId === correlationId &&
        i.status === "open",
    );
    if (existing) return null;
    const incident: Incident = {
      id: randomToken(8),
      workflowId,
      kind,
      correlationId,
      status: "open",
      openedAt: now.toISOString(),
      resolvedAt: null,
    };
    this.incidents.push(incident);
    return incident;
  }

  enqueueEmail(incidentId: string, now: Date) {
    if (this.emails.some((e) => e.incidentId === incidentId)) return;
    this.emails.push({ id: randomToken(8), incidentId, queuedAt: now.toISOString() });
  }

  resolveMatchedIncidents(now: Date) {
    for (const incident of this.incidents) {
      if (incident.status !== "open" || incident.kind !== "unmatched" || !incident.correlationId) continue;
      const dest = this.events.find(
        (e) =>
          e.workflowId === incident.workflowId &&
          e.correlationId === incident.correlationId &&
          e.stage === "destination",
      );
      if (dest) {
        incident.status = "resolved";
        incident.resolvedAt = now.toISOString();
      }
    }
  }

  openMissedCadenceIncidents(now: Date) {
    for (const workflow of this.workflows.values()) {
      if (!workflow.cadenceMinutes) continue;
      const last = this.events
        .filter((e) => e.workflowId === workflow.id)
        .sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt))[0];
      const lastAt = last ? new Date(last.occurredAt) : new Date(0);
      if (now.getTime() - lastAt.getTime() > workflow.cadenceMinutes * 60_000) {
        const created = this.openIncidentOnce(workflow.id, "missed_cadence", null, now);
        if (created) this.enqueueEmail(created.id, now);
      }
    }
  }

  health(workflow: Workflow) {
    const related = this.events.filter((e) => e.workflowId === workflow.id);
    const lastSource = related.filter((e) => e.stage === "source").at(-1)?.occurredAt;
    const lastDestination = related.filter((e) => e.stage === "destination").at(-1)?.occurredAt;
    const open = this.incidents.some((i) => i.workflowId === workflow.id && i.status === "open");
    const status = open ? "degraded" : related.length ? "healthy" : "idle";
    return { ...workflow, status, lastSource, lastDestination };
  }

  publicStatus(token: string) {
    const hash = sha256(token);
    const workflow = [...this.workflows.values()].find((w) => w.publicTokenHash === hash);
    if (!workflow) return null;
    const card = this.health(workflow);
    return { name: card.name, status: card.status, lastSource: card.lastSource, lastDestination: card.lastDestination };
  }
}

export const outcomeWatch = new OutcomeWatch();
outcomeWatch.seedDemo();
