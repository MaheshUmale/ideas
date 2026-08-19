import { z } from "zod";
import { randomToken, sha256 } from "@/lib/crypto";

export const CompleteSchema = z.object({
  note: z.string().min(1).max(1000),
  afterPhotoIds: z.array(z.string().uuid()).min(1),
});

export type WorkOrder = {
  id: string;
  propertyId: string;
  propertyLabel: string;
  summary: string;
  tenantContact: string | null;
  status: "new" | "assigned" | "in_progress" | "awaiting_verification" | "closed";
  dueAt: string;
  evidencePolicy: { afterPhotos: number };
};

export type Assignment = {
  id: string;
  workOrderId: string;
  vendorName: string;
  vendorContact: string;
  tokenHash: string;
  expiresAt: string;
  acceptedAt: string | null;
};

export type Photo = { id: string; workOrderId: string; kind: "before" | "after"; name: string; sha256: string };
export type Update = { id: number; workOrderId: string; actor: string; status: string; note: string; createdAt: string };
export type Notice = { workOrderId: string; template: string; recipientHash: string; sentAt: string };

export class FixProof {
  properties = [
    { id: "prop-12b", organizationId: "org-pm", label: "12B Willow Court" },
    { id: "prop-4a", organizationId: "org-pm", label: "4A Cedar Walk" },
  ];
  workOrders: WorkOrder[] = [];
  assignments: Assignment[] = [];
  photos: Photo[] = [];
  updates: Update[] = [];
  notices: Notice[] = [];
  tokens = new Map<string, string>();
  private nextUpdate = 1;

  seedDemo() {
    const token = "fp_vendor_willow_leak";
    const wo: WorkOrder = {
      id: "wo-100",
      propertyId: "prop-12b",
      propertyLabel: "12B Willow Court",
      summary: "Kitchen sink leak under disposal",
      tenantContact: "tenant@example.com",
      status: "assigned",
      dueAt: new Date(Date.now() + 8 * 3600_000).toISOString(),
      evidencePolicy: { afterPhotos: 1 },
    };
    this.workOrders.push(wo);
    this.assignments.push({
      id: "as-1",
      workOrderId: wo.id,
      vendorName: "River Plumbing",
      vendorContact: "river@vendors.test",
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 3 * 864e5).toISOString(),
      acceptedAt: null,
    });
    this.tokens.set(token, "as-1");
    this.photos.push({
      id: "11111111-1111-1111-1111-111111111111",
      workOrderId: wo.id,
      kind: "before",
      name: "leak-before.jpg",
      sha256: sha256("leak-before.jpg"),
    });
    return { token };
  }

  create(input: { propertyId: string; summary: string; tenantContact?: string; hours: number; vendorName: string; vendorContact: string }) {
    const property = this.properties.find((p) => p.id === input.propertyId);
    if (!property) throw new Error("unknown_property");
    const wo: WorkOrder = {
      id: randomToken(8),
      propertyId: property.id,
      propertyLabel: property.label,
      summary: input.summary,
      tenantContact: input.tenantContact ?? null,
      status: "assigned",
      dueAt: new Date(Date.now() + input.hours * 3600_000).toISOString(),
      evidencePolicy: { afterPhotos: 1 },
    };
    const token = randomToken(24);
    this.workOrders.push(wo);
    const assignment: Assignment = {
      id: randomToken(8),
      workOrderId: wo.id,
      vendorName: input.vendorName,
      vendorContact: input.vendorContact,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 5 * 864e5).toISOString(),
      acceptedAt: null,
    };
    this.assignments.push(assignment);
    this.tokens.set(token, assignment.id);
    this.transition(wo.id, "assigned", "manager", `Assigned to ${input.vendorName}`);
    this.enqueueNotice(wo.id, "vendor_assigned", sha256(input.vendorContact));
    this.enqueueNotice(wo.id, "tenant_assigned", sha256(input.tenantContact ?? "none"));
    return { workOrder: wo, token };
  }

  vendorView(token: string, now = new Date()) {
    const assignment = this.assignmentByToken(token);
    if (!assignment || new Date(assignment.expiresAt) < now) return null;
    const wo = this.workOrders.find((w) => w.id === assignment.workOrderId);
    if (!wo) return null;
    return {
      summary: wo.summary,
      status: wo.status,
      propertyLabel: wo.propertyLabel,
      vendorName: assignment.vendorName,
      dueAt: wo.dueAt,
      photos: this.photos.filter((p) => p.workOrderId === wo.id),
      tenantContact: undefined,
    };
  }

  accept(token: string, now = new Date()) {
    const assignment = this.assignmentByToken(token);
    if (!assignment || new Date(assignment.expiresAt) < now) return { kind: "invalid" as const };
    assignment.acceptedAt = now.toISOString();
    this.transition(assignment.workOrderId, "in_progress", "vendor", "Vendor accepted");
    return { kind: "ok" as const };
  }

  addPhoto(token: string, kind: "before" | "after", name: string, mime: string) {
    const looksImage = /^image\/(jpeg|png|webp)$/.test(mime);
    const disguised = /\.(exe|bat|cmd|js|msi|sh)(?:\.|$)/i.test(name);
    const extOk = /\.(jpe?g|png|webp)$/i.test(name);
    if (!looksImage || disguised || !extOk) {
      return { kind: "rejected" as const, error: "invalid_mime" };
    }
    const assignment = this.assignmentByToken(token);
    if (!assignment) return { kind: "invalid" as const };
    const photo: Photo = {
      id: crypto.randomUUID(),
      workOrderId: assignment.workOrderId,
      kind,
      name,
      sha256: sha256(name),
    };
    this.photos.push(photo);
    return { kind: "ok" as const, photo };
  }

  complete(token: string, body: unknown, now = new Date()) {
    const parsed = CompleteSchema.safeParse(body);
    if (!parsed.success) return { kind: "invalid" as const, error: parsed.error.flatten() };
    const assignment = this.assignmentByToken(token);
    if (!assignment || new Date(assignment.expiresAt) < now) return { kind: "invalid" as const };
    const owned = parsed.data.afterPhotoIds.every((id) =>
      this.photos.some((p) => p.id === id && p.workOrderId === assignment.workOrderId && p.kind === "after"),
    );
    if (!owned) return { kind: "bad_evidence" as const };
    this.transition(assignment.workOrderId, "awaiting_verification", "vendor", parsed.data.note);
    this.enqueueNotice(assignment.workOrderId, "manager_verify", sha256("manager"));
    return { kind: "ok" as const };
  }

  close(workOrderId: string, actor: "manager" | "vendor") {
    const wo = this.workOrders.find((w) => w.id === workOrderId);
    if (!wo) return { kind: "missing" as const };
    if (actor !== "manager") return { kind: "forbidden" as const };
    const after = this.photos.filter((p) => p.workOrderId === wo.id && p.kind === "after");
    if (after.length < wo.evidencePolicy.afterPhotos) return { kind: "evidence_required" as const };
    this.transition(wo.id, "closed", "manager", "Verified complete");
    this.enqueueNotice(wo.id, "tenant_complete", sha256(wo.tenantContact ?? "none"));
    return { kind: "ok" as const };
  }

  escalateOverdue(now = new Date()) {
    let fired = 0;
    for (const wo of this.workOrders) {
      if (wo.status === "closed") continue;
      if (new Date(wo.dueAt) > now) continue;
      const existed = this.notices.some((n) => n.workOrderId === wo.id && n.template === "overdue");
      if (existed) continue;
      this.enqueueNotice(wo.id, "overdue", sha256("manager"));
      fired += 1;
    }
    return fired;
  }

  transition(workOrderId: string, status: WorkOrder["status"], actor: string, note: string) {
    const wo = this.workOrders.find((w) => w.id === workOrderId);
    if (!wo) return;
    wo.status = status;
    this.updates.push({
      id: this.nextUpdate++,
      workOrderId,
      actor,
      status,
      note,
      createdAt: new Date().toISOString(),
    });
  }

  enqueueNotice(workOrderId: string, template: string, recipientHash: string) {
    if (this.notices.some((n) => n.workOrderId === workOrderId && n.template === template)) return;
    this.notices.push({ workOrderId, template, recipientHash, sentAt: new Date().toISOString() });
  }

  assignmentByToken(token: string) {
    const id = this.tokens.get(token);
    if (id) return this.assignments.find((a) => a.id === id) ?? null;
    const hash = sha256(token);
    return this.assignments.find((a) => a.tokenHash === hash) ?? null;
  }
}

export const fixProof = new FixProof();
fixProof.seedDemo();
