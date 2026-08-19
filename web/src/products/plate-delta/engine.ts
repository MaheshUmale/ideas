import { z } from "zod";
import { changeBps } from "@/lib/money";
import { randomToken, sha256 } from "@/lib/crypto";

export function normalizedUnitPriceMicros(
  lineTotalCents: number,
  quantity: string,
  unitsPerPack: string,
): number {
  const qty = Number(quantity);
  const pack = Number(unitsPerPack);
  if (!(qty > 0) || !(pack > 0)) throw new Error("quantity and pack units must be positive");
  const dollarsPerUnit = lineTotalCents / 100 / (qty * pack);
  return Math.round(dollarsPerUnit * 1_000_000);
}

export const VerifyLineSchema = z.object({
  id: z.string(),
  catalogItemId: z.string(),
  quantity: z.number().positive(),
  unitsPerPack: z.number().positive(),
  lineTotalCents: z.number().int().nonnegative(),
});

export type Vendor = { id: string; organizationId: string; name: string };
export type CatalogItem = {
  id: string;
  vendorId: string;
  vendorSku: string;
  canonicalName: string;
  baseUnit: string;
  unitsPerPack: number;
};
export type Invoice = {
  id: string;
  vendorId: string;
  invoiceNumber: string;
  invoiceDate: string;
  sha256: string;
  status: "queued" | "review" | "verified" | "duplicate";
};
export type InvoiceLine = {
  id: string;
  invoiceId: string;
  catalogItemId: string | null;
  rawDescription: string;
  quantity: number | null;
  packText: string | null;
  lineTotalCents: number | null;
  unitPriceMicros: number | null;
  confidence: number;
  verifiedAt: string | null;
};
export type PriceAlert = {
  id: string;
  invoiceLineId: string;
  catalogItemId: string;
  priorUnitPriceMicros: number;
  currentUnitPriceMicros: number;
  changeBps: number;
  status: "new" | "ack";
};

export class PlateDelta {
  vendors: Vendor[] = [];
  catalog: CatalogItem[] = [];
  invoices: Invoice[] = [];
  lines: InvoiceLine[] = [];
  alerts: PriceAlert[] = [];

  seedDemo() {
    this.vendors.push({ id: "v-sysco", organizationId: "org-rest", name: "Sysco" });
    this.catalog.push(
      {
        id: "ci-oil",
        vendorId: "v-sysco",
        vendorSku: "OIL-CAN-35",
        canonicalName: "Canola oil",
        baseUnit: "oz",
        unitsPerPack: 35,
      },
      {
        id: "ci-chick",
        vendorId: "v-sysco",
        vendorSku: "CHK-BRST-40",
        canonicalName: "Chicken breast",
        baseUnit: "lb",
        unitsPerPack: 40,
      },
    );
    this.ingest({
      vendorId: "v-sysco",
      invoiceNumber: "S-10441",
      invoiceDate: "2026-07-12",
      raw: "prior",
      lines: [
        { rawDescription: "CANOLA OIL 35#", quantity: 2, packText: "35 lb", lineTotalCents: 8400, catalogItemId: "ci-oil", confidence: 0.93 },
        { rawDescription: "CHICKEN BRST 40#", quantity: 1, packText: "40 lb", lineTotalCents: 7200, catalogItemId: "ci-chick", confidence: 0.91 },
      ],
    });
    this.verify(
      this.invoices[0].id,
      this.lines
        .filter((l) => l.invoiceId === this.invoices[0].id)
        .map((l) => ({
          id: l.id,
          catalogItemId: l.catalogItemId!,
          quantity: l.quantity!,
          unitsPerPack: this.catalog.find((c) => c.id === l.catalogItemId)!.unitsPerPack,
          lineTotalCents: l.lineTotalCents!,
        })),
      500,
      new Date("2026-07-12T12:00:00Z"),
    );
    this.ingest({
      vendorId: "v-sysco",
      invoiceNumber: "S-11002",
      invoiceDate: "2026-08-16",
      raw: "current",
      lines: [
        { rawDescription: "CANOLA OIL 35#", quantity: 2, packText: "35 lb", lineTotalCents: 9800, catalogItemId: "ci-oil", confidence: 0.94 },
        { rawDescription: "CHICKEN BRST 40#", quantity: 1, packText: "40 lb", lineTotalCents: 7340, catalogItemId: "ci-chick", confidence: 0.9 },
        { rawDescription: "FRT/TAX", quantity: 1, packText: "ea", lineTotalCents: 1250, catalogItemId: null, confidence: 0.41 },
      ],
    });
  }

  ingest(input: {
    vendorId: string;
    invoiceNumber: string;
    invoiceDate: string;
    raw: string;
    lines: Omit<InvoiceLine, "id" | "invoiceId" | "unitPriceMicros" | "verifiedAt">[];
  }) {
    const digest = sha256(`${input.vendorId}:${input.invoiceNumber}:${input.raw}`);
    const dupHash = this.invoices.find((i) => i.sha256 === digest);
    const dupNumber = this.invoices.find(
      (i) => i.vendorId === input.vendorId && i.invoiceNumber === input.invoiceNumber,
    );
    if (dupHash || dupNumber) {
      const invoice: Invoice = {
        id: randomToken(8),
        vendorId: input.vendorId,
        invoiceNumber: input.invoiceNumber,
        invoiceDate: input.invoiceDate,
        sha256: digest,
        status: "duplicate",
      };
      this.invoices.push(invoice);
      return { invoice, warning: "duplicate_invoice" as const };
    }
    const invoice: Invoice = {
      id: randomToken(8),
      vendorId: input.vendorId,
      invoiceNumber: input.invoiceNumber,
      invoiceDate: input.invoiceDate,
      sha256: digest,
      status: "review",
    };
    this.invoices.push(invoice);
    for (const line of input.lines) {
      this.lines.push({
        ...line,
        id: randomToken(8),
        invoiceId: invoice.id,
        unitPriceMicros: null,
        verifiedAt: null,
      });
    }
    return { invoice, warning: null };
  }

  verify(invoiceId: string, rows: unknown, alertThresholdBps = 500, now = new Date()) {
    const parsed = z.array(VerifyLineSchema).parse(rows);
    const invoice = this.invoices.find((i) => i.id === invoiceId);
    if (!invoice) throw new Error("missing_invoice");
    if (invoice.status === "duplicate") throw new Error("duplicate_not_verifiable");
    for (const row of parsed) {
      const line = this.lines.find((l) => l.id === row.id && l.invoiceId === invoiceId);
      const item = this.catalog.find((c) => c.id === row.catalogItemId);
      if (!line || !item) throw new Error("invalid_line");
      if (item.vendorId !== invoice.vendorId) throw new Error("cross_vendor_map");
      const micros = normalizedUnitPriceMicros(
        row.lineTotalCents,
        String(row.quantity),
        String(row.unitsPerPack),
      );
      line.catalogItemId = item.id;
      line.quantity = row.quantity;
      line.lineTotalCents = row.lineTotalCents;
      line.unitPriceMicros = micros;
      line.verifiedAt = now.toISOString();

      const prior = this.lines
        .filter(
          (l) =>
            l.catalogItemId === item.id &&
            l.verifiedAt &&
            l.id !== line.id &&
            l.unitPriceMicros &&
            l.unitPriceMicros > 0,
        )
        .sort((a, b) => +new Date(b.verifiedAt!) - +new Date(a.verifiedAt!))[0];
      if (prior?.unitPriceMicros) {
        const bps = changeBps(prior.unitPriceMicros, micros);
        if (Math.abs(bps) >= alertThresholdBps) {
          this.alerts.push({
            id: randomToken(8),
            invoiceLineId: line.id,
            catalogItemId: item.id,
            priorUnitPriceMicros: prior.unitPriceMicros,
            currentUnitPriceMicros: micros,
            changeBps: bps,
            status: "new",
          });
        }
      }
    }
    invoice.status = "verified";
    return { verified: true, alerts: this.alerts.filter((a) => parsed.some((p) => p.id === a.invoiceLineId)) };
  }

  verifiedCsv() {
    const header = "vendor,invoice,date,item,qty,base_unit,unit_price_micros";
    const rows = this.lines
      .filter((l) => l.verifiedAt && l.catalogItemId && l.unitPriceMicros != null)
      .map((l) => {
        const invoice = this.invoices.find((i) => i.id === l.invoiceId)!;
        const vendor = this.vendors.find((v) => v.id === invoice.vendorId)!;
        const item = this.catalog.find((c) => c.id === l.catalogItemId)!;
        return [vendor.name, invoice.invoiceNumber, invoice.invoiceDate, item.canonicalName, l.quantity, item.baseUnit, l.unitPriceMicros].join(",");
      });
    return [header, ...rows].join("\n");
  }
}

export const plateDelta = new PlateDelta();
plateDelta.seedDemo();
