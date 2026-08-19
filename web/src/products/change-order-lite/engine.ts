import { z } from "zod";
import { randomToken, sha256 } from "@/lib/crypto";
import { changeOrderTotal } from "@/lib/money";

export const LineSchema = z.object({
  description: z.string().min(1).max(240),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(24),
  unitPriceCents: z.number().int().nonnegative().max(1_000_000_000),
});

export const DecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  signerName: z.string().min(2).max(120),
  note: z.string().max(1000).optional(),
});

export type LineItem = z.infer<typeof LineSchema> & { id: string };
export type ChangeOrder = {
  id: string;
  projectId: string;
  number: number;
  revision: number;
  title: string;
  scope: string;
  subtotalCents: number;
  markupBps: number;
  taxBps: number;
  totalCents: number;
  status: "draft" | "sent" | "approved" | "rejected";
  tokenHash: string | null;
  tokenExpiresAt: string | null;
  frozenAt: string | null;
  pdfSha256: string | null;
  evidence: { id: string; name: string; sha256: string }[];
  lines: LineItem[];
};

export type Decision = {
  changeOrderId: string;
  decision: "approved" | "rejected";
  signerName: string;
  note?: string;
  decidedAt: string;
  ipHash: string;
};

export class ChangeOrderLite {
  projects = [
    { id: "proj-oak", name: "Oak Street Kitchen", nextCoNumber: 3, organizationId: "org-1" },
  ];
  orders: ChangeOrder[] = [];
  decisions: Decision[] = [];
  tokens = new Map<string, string>();

  seedDemo() {
    const lines: LineItem[] = [
      { id: "li-1", description: "Additional 20A circuit", quantity: 1, unit: "ea", unitPriceCents: 48000 },
      { id: "li-2", description: "Wall repair after chase", quantity: 12, unit: "sf", unitPriceCents: 1850 },
    ];
    const subtotal = lines.reduce((s, l) => s + Math.round(l.quantity * l.unitPriceCents), 0);
    const token = "co_demo_token_oak_002";
    this.orders.push({
      id: "co-2",
      projectId: "proj-oak",
      number: 2,
      revision: 0,
      title: "Electrical extras — island",
      scope: "Owner requested island outlets after rough-in.",
      subtotalCents: subtotal,
      markupBps: 1500,
      taxBps: 825,
      totalCents: changeOrderTotal(subtotal, 1500, 825),
      status: "sent",
      tokenHash: sha256(token),
      tokenExpiresAt: new Date(Date.now() + 7 * 864e5).toISOString(),
      frozenAt: null,
      pdfSha256: null,
      evidence: [{ id: "ev-1", name: "island-roughin.jpg", sha256: sha256("island-roughin.jpg") }],
      lines,
    });
    this.tokens.set(token, "co-2");
    return { token };
  }

  create(input: {
    projectId: string;
    title: string;
    scope: string;
    markupBps: number;
    taxBps: number;
    lines: z.infer<typeof LineSchema>[];
    photos: string[];
  }) {
    const parsed = z.array(LineSchema).min(1).parse(input.lines);
    const project = this.projects.find((p) => p.id === input.projectId);
    if (!project) throw new Error("unknown_project");
    const subtotal = parsed.reduce((s, l) => s + Math.round(l.quantity * l.unitPriceCents), 0);
    const number = project.nextCoNumber++;
    const order: ChangeOrder = {
      id: randomToken(8),
      projectId: project.id,
      number,
      revision: 0,
      title: input.title,
      scope: input.scope,
      subtotalCents: subtotal,
      markupBps: input.markupBps,
      taxBps: input.taxBps,
      totalCents: changeOrderTotal(subtotal, input.markupBps, input.taxBps),
      status: "draft",
      tokenHash: null,
      tokenExpiresAt: null,
      frozenAt: null,
      pdfSha256: null,
      evidence: input.photos.map((name) => ({ id: randomToken(4), name, sha256: sha256(name) })),
      lines: parsed.map((l) => ({ ...l, id: randomToken(4) })),
    };
    this.orders.push(order);
    return order;
  }

  send(id: string, now = new Date()) {
    const order = this.orders.find((o) => o.id === id);
    if (!order || order.status !== "draft") return null;
    const token = randomToken(32);
    order.tokenHash = sha256(token);
    order.tokenExpiresAt = new Date(now.getTime() + 14 * 864e5).toISOString();
    order.status = "sent";
    this.tokens.set(token, order.id);
    return { order, token };
  }

  publicView(token: string, now = new Date()) {
    const order = this.byToken(token);
    if (!order) return { kind: "missing" as const };
    if (order.tokenExpiresAt && new Date(order.tokenExpiresAt) < now) return { kind: "missing" as const };
    return {
      kind: "ok" as const,
      order: {
        title: order.title,
        number: order.number,
        revision: order.revision,
        scope: order.scope,
        totalCents: order.totalCents,
        status: order.status,
        lines: order.lines,
      },
    };
  }

  decide(token: string, body: unknown, ip: string, now = new Date()) {
    const parsed = DecisionSchema.safeParse(body);
    if (!parsed.success) return { kind: "invalid" as const, error: parsed.error.flatten() };
    const order = this.byToken(token);
    if (!order || (order.tokenExpiresAt && new Date(order.tokenExpiresAt) < now)) {
      return { kind: "missing" as const };
    }
    if (this.decisions.some((d) => d.changeOrderId === order.id) || order.status === "approved" || order.status === "rejected") {
      return { kind: "decided" as const };
    }
    order.status = parsed.data.decision;
    order.frozenAt = now.toISOString();
    order.pdfSha256 = sha256(this.renderPacket(order, parsed.data.signerName, now));
    this.decisions.push({
      changeOrderId: order.id,
      decision: parsed.data.decision,
      signerName: parsed.data.signerName,
      note: parsed.data.note,
      decidedAt: now.toISOString(),
      ipHash: sha256(`salt:${ip}`),
    });
    return { kind: "ok" as const, changeOrderId: order.id, pdfSha256: order.pdfSha256 };
  }

  revise(id: string) {
    const order = this.orders.find((o) => o.id === id);
    if (!order || (order.status !== "rejected" && order.status !== "approved" && order.status !== "sent")) return null;
    if (order.status !== "rejected" && order.status !== "approved" && order.frozenAt) return null;
    if (order.status === "approved" || order.frozenAt) {
      /* approved packets cannot be edited — clone a revision */
    }
    const clone: ChangeOrder = {
      ...order,
      id: randomToken(8),
      revision: order.revision + 1,
      status: "draft",
      tokenHash: null,
      tokenExpiresAt: null,
      frozenAt: null,
      pdfSha256: null,
      lines: order.lines.map((l) => ({ ...l, id: randomToken(4) })),
      evidence: order.evidence.map((e) => ({ ...e })),
    };
    this.orders.push(clone);
    return clone;
  }

  updateDraft(id: string, patch: Partial<Pick<ChangeOrder, "title" | "scope">>) {
    const order = this.orders.find((o) => o.id === id);
    if (!order || order.frozenAt || order.status === "approved") return { kind: "frozen" as const };
    if (patch.title) order.title = patch.title;
    if (patch.scope) order.scope = patch.scope;
    return { kind: "ok" as const, order };
  }

  csv() {
    const header = "project,number,revision,title,status,total_cents,frozen_at,pdf_sha256";
    const rows = this.orders.map((o) => {
      const project = this.projects.find((p) => p.id === o.projectId)?.name ?? "";
      return [project, o.number, o.revision, o.title, o.status, o.totalCents, o.frozenAt ?? "", o.pdfSha256 ?? ""].join(",");
    });
    return [header, ...rows].join("\n");
  }

  renderPacket(order: ChangeOrder, signer: string, now: Date) {
    return [
      `COR-${order.number}r${order.revision}`,
      order.title,
      `TOTAL_CENTS=${order.totalCents}`,
      `SIGNER=${signer}`,
      `DECIDED=${now.toISOString()}`,
      ...order.evidence.map((e) => `EVIDENCE ${e.sha256}`),
    ].join("\n");
  }

  byToken(token: string) {
    const id = this.tokens.get(token);
    if (!id) {
      const hash = sha256(token);
      return this.orders.find((o) => o.tokenHash === hash) ?? null;
    }
    return this.orders.find((o) => o.id === id) ?? null;
  }
}

export const changeOrders = new ChangeOrderLite();
changeOrders.seedDemo();
