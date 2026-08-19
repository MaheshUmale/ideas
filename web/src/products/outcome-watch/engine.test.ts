import { describe, expect, it } from "vitest";
import { OutcomeWatch } from "./engine";

const validEvent = {
  correlationId: "lead-1",
  stage: "source" as const,
  occurredAt: "2026-08-19T10:00:00.000Z",
  fields: { email: "a@b.co" },
};

describe("OutcomeWatch", () => {
  it("rejects an invalid key without writing", () => {
    const ow = new OutcomeWatch();
    ow.seedDemo();
    const r = ow.ingest("bad-key", validEvent, 100);
    expect(r.status).toBe(401);
    expect(ow.events).toHaveLength(0);
  });

  it("accepts a valid key and is idempotent", () => {
    const ow = new OutcomeWatch();
    const { demoKey } = ow.seedDemo();
    expect(ow.ingest(demoKey, validEvent, 120).status).toBe(202);
    expect(ow.ingest(demoKey, validEvent, 120).status).toBe(202);
    expect(ow.events).toHaveLength(1);
  });

  it("rejects unknown fields and oversized payloads", () => {
    const ow = new OutcomeWatch();
    const { demoKey } = ow.seedDemo();
    const bad = ow.ingest(demoKey, { ...validEvent, fields: { ssn: "1" } }, 80);
    expect(bad.status).toBe(400);
    expect(ow.ingest(demoKey, validEvent, 9000).status).toBe(413);
  });

  it("opens one incident and one email for an unmatched source", () => {
    const ow = new OutcomeWatch();
    const { demoKey } = ow.seedDemo();
    const occurredAt = "2026-08-19T10:00:00.000Z";
    ow.ingest(demoKey, { ...validEvent, occurredAt }, 100, new Date(occurredAt));
    const later = new Date("2026-08-19T10:31:00.000Z");
    ow.evaluate(later);
    ow.evaluate(later);
    expect(ow.incidents.filter((i) => i.status === "open")).toHaveLength(1);
    expect(ow.emails).toHaveLength(1);
  });

  it("resolves when the destination arrives", () => {
    const ow = new OutcomeWatch();
    const { demoKey } = ow.seedDemo();
    ow.ingest(demoKey, validEvent, 80);
    ow.evaluate(new Date("2026-08-19T10:31:00.000Z"));
    ow.ingest(
      demoKey,
      { ...validEvent, stage: "destination", occurredAt: "2026-08-19T10:20:00.000Z" },
      80,
    );
    ow.evaluate(new Date("2026-08-19T10:32:00.000Z"));
    expect(ow.incidents[0].status).toBe("resolved");
  });

  it("marks cadence misses as degraded and hides details on public status", () => {
    const ow = new OutcomeWatch();
    const { publicToken } = ow.seedDemo();
    ow.evaluate(new Date("2026-08-19T12:00:00.000Z"));
    const card = ow.health(ow.workflows.get("wf-leads")!);
    expect(card.status).toBe("degraded");
    const pub = ow.publicStatus(publicToken);
    expect(pub).toEqual({
      name: "Lead → HubSpot",
      status: "degraded",
      lastSource: undefined,
      lastDestination: undefined,
    });
    expect(ow.publicStatus("guess")).toBeNull();
  });
});
