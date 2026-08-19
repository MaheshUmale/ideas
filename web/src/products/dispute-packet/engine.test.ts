import { describe, expect, it } from "vitest";
import { hmacSha256Base64 } from "@/lib/crypto";
import { DisputePacket } from "./engine";

describe("DisputePacket", () => {
  it("rejects altered HMAC and ignores duplicate webhook ids", () => {
    const app = new DisputePacket();
    app.seedDemo();
    const raw = Buffer.from('{"id":1}');
    const good = hmacSha256Base64(app.secret, raw);
    expect(app.verifyWebhook(raw, "aaaa", "wh-1").status).toBe(401);
    expect(app.verifyWebhook(raw, good, "wh-1")).toEqual({ status: 200, duplicate: false });
    expect(app.verifyWebhook(raw, good, "wh-1")).toEqual({ status: 200, duplicate: true });
  });

  it("uninstall removes token and PII-bearing disputes", () => {
    const app = new DisputePacket();
    app.seedDemo();
    expect(app.usableToken("shop-1")).toBe(true);
    app.uninstall("shop-1");
    expect(app.usableToken("shop-1")).toBe(false);
    expect(app.disputes).toHaveLength(0);
  });

  it("builds a reason-code checklist without inventing contact claims", () => {
    const app = new DisputePacket();
    app.seedDemo();
    const dispute = app.disputes[0];
    const list = app.checklist(dispute);
    expect(list.find((i) => i.label === "order")?.state).toBe("present");
    expect(list.find((i) => i.label === "delivery")?.state).toBe("missing");
    expect(() => app.generatePacket(dispute.id, ["customer never contacted us"])).toThrow(/unsupported_claim/);
    const packet = app.generatePacket(dispute.id);
    expect(packet.body).toContain("Do not refund while this dispute is open");
    expect(app.flagRefund(dispute.id)?.warning).toMatch(/double loss/);
  });
});
