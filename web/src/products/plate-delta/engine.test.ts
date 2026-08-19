import { describe, expect, it } from "vitest";
import { changeBps } from "@/lib/money";
import { PlateDelta, normalizedUnitPriceMicros } from "./engine";

describe("PlateDelta normalization", () => {
  it("normalizes pack size to micros per base unit", () => {
    expect(normalizedUnitPriceMicros(8400, "2", "35")).toBe(1_200_000);
    expect(changeBps(120000, 140000)).toBe(1667);
  });

  it("refuses unlike or unverified comparisons", () => {
    const pd = new PlateDelta();
    pd.seedDemo();
    const review = pd.invoices.find((i) => i.status === "review")!;
    const freight = pd.lines.find((l) => l.invoiceId === review.id && !l.catalogItemId);
    expect(freight?.verifiedAt).toBeNull();
    expect(() =>
      pd.verify(review.id, [
        {
          id: freight!.id,
          catalogItemId: "missing",
          quantity: 1,
          unitsPerPack: 1,
          lineTotalCents: 1250,
        },
      ]),
    ).toThrow();
  });

  it("alerts on like-for-like increase and exports only verified lines", () => {
    const pd = new PlateDelta();
    pd.seedDemo();
    const review = pd.invoices.find((i) => i.status === "review")!;
    const oil = pd.lines.find((l) => l.invoiceId === review.id && l.catalogItemId === "ci-oil")!;
    const chick = pd.lines.find((l) => l.invoiceId === review.id && l.catalogItemId === "ci-chick")!;
    const result = pd.verify(review.id, [
      { id: oil.id, catalogItemId: "ci-oil", quantity: 2, unitsPerPack: 35, lineTotalCents: 9800 },
      { id: chick.id, catalogItemId: "ci-chick", quantity: 1, unitsPerPack: 40, lineTotalCents: 7340 },
    ]);
    expect(result.alerts.some((a) => a.catalogItemId === "ci-oil" && a.changeBps > 500)).toBe(true);
    expect(pd.verifiedCsv()).not.toContain("FRT/TAX");
    expect(pd.verifiedCsv()).toContain("Canola oil");
  });

  it("flags duplicate vendor/invoice numbers", () => {
    const pd = new PlateDelta();
    pd.seedDemo();
    const dup = pd.ingest({
      vendorId: "v-sysco",
      invoiceNumber: "S-11002",
      invoiceDate: "2026-08-16",
      raw: "copy",
      lines: [],
    });
    expect(dup.warning).toBe("duplicate_invoice");
    expect(dup.invoice.status).toBe("duplicate");
  });
});
