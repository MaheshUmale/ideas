import { describe, expect, it } from "vitest";
import { BillableRecall } from "./engine";

describe("BillableRecall", () => {
  it("never persists a non-allow-listed host", () => {
    const br = new BillableRecall();
    br.setAllowlist(["github.com"]);
    br.begin("https://mail.example.com/secret/inbox?q=1", 1_000);
    br.flush(120_000);
    expect(br.persistedHosts()).toEqual([]);
    expect(JSON.stringify(br.intervals)).not.toContain("mail.example.com");
    expect(JSON.stringify(br.intervals)).not.toContain("/secret");
  });

  it("excludes idle time and does not invent overnight blocks after a crash", () => {
    const br = new BillableRecall();
    br.setAllowlist(["github.com"]);
    br.begin("https://github.com/acme", 0);
    br.setIdle(true, 20_000);
    br.setIdle(false, 3_600_000);
    br.begin("https://github.com/acme", 3_600_000);
    br.recoverFromCrash();
    br.flush(86_400_000);
    expect(br.intervals).toHaveLength(1);
    expect(br.intervals[0].endedAt - br.intervals[0].startedAt).toBe(20_000);
  });

  it("exports only approved rows and escapes formula prefixes", () => {
    const br = new BillableRecall();
    br.seedDemo();
    br.blocks[0].description = "=cmd|'/c calc'!A0";
    br.approve(br.blocks[0].id);
    const csv = br.exportApprovedCsv();
    expect(csv).toContain("Northwind");
    expect(csv).toContain("'=cmd|'/c calc'!A0");
    expect(csv.split("\n").length).toBe(2);
  });

  it("shows approved and draft retainer totals separately", () => {
    const br = new BillableRecall();
    br.seedDemo();
    br.approve(br.blocks.find((b) => b.client === "Northwind")!.id);
    const north = br.retainerStatus().find((r) => r.client === "Northwind")!;
    expect(north.approved).toBeGreaterThan(0);
    expect(north.draft).toBe(0);
    const harbor = br.retainerStatus().find((r) => r.client === "Harbor")!;
    expect(harbor.approved).toBe(0);
    expect(harbor.draft).toBeGreaterThan(0);
  });

  it("wipe deletes local data", () => {
    const br = new BillableRecall();
    br.seedDemo();
    br.wipe();
    expect(br.intervals).toHaveLength(0);
    expect(br.blocks).toHaveLength(0);
  });
});
