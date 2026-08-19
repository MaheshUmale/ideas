import { describe, expect, it } from "vitest";
import { changeOrderTotal } from "@/lib/money";
import { ChangeOrderLite } from "./engine";

describe("ChangeOrder Lite money", () => {
  it("uses integer cents and basis points", () => {
    expect(changeOrderTotal(10_000, 1500, 825)).toBe(12_449);
    expect(changeOrderTotal(0, 1500, 825)).toBe(0);
  });
});

describe("ChangeOrder Lite workflow", () => {
  it("rejects non-positive quantities", () => {
    const app = new ChangeOrderLite();
    app.seedDemo();
    expect(() =>
      app.create({
        projectId: "proj-oak",
        title: "Bad",
        scope: "x",
        markupBps: 0,
        taxBps: 0,
        lines: [{ description: "x", quantity: 0, unit: "ea", unitPriceCents: 1 }],
        photos: [],
      }),
    ).toThrow();
  });

  it("records only one decision and freezes the packet", () => {
    const app = new ChangeOrderLite();
    const { token } = app.seedDemo();
    const first = app.decide(token, { decision: "approved", signerName: "Alex GC" }, "1.1.1.1");
    const second = app.decide(token, { decision: "rejected", signerName: "Alex GC" }, "1.1.1.1");
    expect(first.kind).toBe("ok");
    expect(second.kind).toBe("decided");
    expect(app.updateDraft("co-2", { title: "hack" }).kind).toBe("frozen");
    const revision = app.revise("co-2");
    expect(revision?.revision).toBe(1);
    expect(revision?.status).toBe("draft");
    expect(app.orders.find((o) => o.id === "co-2")?.pdfSha256).toBeTruthy();
  });

  it("hides metadata for guessed or expired tokens", () => {
    const app = new ChangeOrderLite();
    app.seedDemo();
    expect(app.publicView("nope").kind).toBe("missing");
    const created = app.create({
      projectId: "proj-oak",
      title: "Fence",
      scope: "extra linear feet",
      markupBps: 1000,
      taxBps: 0,
      lines: [{ description: "fence", quantity: 10, unit: "lf", unitPriceCents: 2200 }],
      photos: ["post.jpg"],
    });
    const sent = app.send(created.id)!;
    const expired = app.publicView(sent.token, new Date(Date.now() + 30 * 864e5));
    expect(expired.kind).toBe("missing");
  });

  it("CSV matches the register totals", () => {
    const app = new ChangeOrderLite();
    app.seedDemo();
    const csv = app.csv();
    expect(csv).toContain("Oak Street Kitchen,2,0,Electrical extras — island,sent");
    expect(csv).toContain(String(app.orders[0].totalCents));
  });
});
