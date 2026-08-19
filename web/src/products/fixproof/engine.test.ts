import { describe, expect, it } from "vitest";
import { FixProof } from "./engine";

describe("FixProof", () => {
  it("vendor token cannot see tenant contact or other properties", () => {
    const fp = new FixProof();
    const { token } = fp.seedDemo();
    const view = fp.vendorView(token);
    expect(view?.summary).toMatch(/leak/i);
    expect(view?.tenantContact).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain("tenant@example.com");
    expect(fp.vendorView("guess")).toBeNull();
  });

  it("rejects non-image uploads and vendor close", () => {
    const fp = new FixProof();
    const { token } = fp.seedDemo();
    expect(fp.addPhoto(token, "after", "payload.exe.jpg", "application/octet-stream").kind).toBe("rejected");
    const photo = fp.addPhoto(token, "after", "after.jpg", "image/jpeg");
    expect(photo.kind).toBe("ok");
    expect(fp.close("wo-100", "vendor").kind).toBe("forbidden");
  });

  it("blocks manager close until evidence exists, then notifies once", () => {
    const fp = new FixProof();
    const { token } = fp.seedDemo();
    expect(fp.close("wo-100", "manager").kind).toBe("evidence_required");
    const photo = fp.addPhoto(token, "after", "fixed.jpg", "image/jpeg");
    if (photo.kind !== "ok") throw new Error("photo");
    const done = fp.complete(token, { note: "Replaced trap", afterPhotoIds: [photo.photo.id] });
    expect(done.kind).toBe("ok");
    expect(fp.workOrders[0].status).toBe("awaiting_verification");
    expect(fp.close("wo-100", "manager").kind).toBe("ok");
    expect(fp.workOrders[0].status).toBe("closed");
    expect(fp.notices.filter((n) => n.template === "tenant_complete")).toHaveLength(1);
  });

  it("escalates overdue work once", () => {
    const fp = new FixProof();
    fp.seedDemo();
    fp.workOrders[0].dueAt = "2026-08-18T00:00:00.000Z";
    expect(fp.escalateOverdue(new Date("2026-08-19T12:00:00Z"))).toBe(1);
    expect(fp.escalateOverdue(new Date("2026-08-19T13:00:00Z"))).toBe(0);
  });
});
