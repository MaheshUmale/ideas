"use client";

import { useEffect, useState } from "react";
import { ProductChrome } from "@/components/Chrome";

type Line = {
  id: string;
  invoiceId: string;
  rawDescription: string;
  catalogItemId: string | null;
  quantity: number | null;
  lineTotalCents: number | null;
  verifiedAt: string | null;
  confidence: number;
};

export default function PlateDeltaPage() {
  const [data, setData] = useState<{
    invoices: { id: string; invoiceNumber: string; status: string }[];
    lines: Line[];
    alerts: { catalogItemId: string; changeBps: number; priorUnitPriceMicros: number; currentUnitPriceMicros: number }[];
    catalog: { id: string; canonicalName: string }[];
  } | null>(null);

  async function load() {
    setData(await (await fetch("/api/plate-delta")).json());
  }
  useEffect(() => {
    void load();
  }, []);

  const review = data?.invoices.find((i) => i.status === "review");

  return (
    <ProductChrome slug="plate-delta">
      <div className="flex gap-3 mb-6">
        <button
          className="border border-stone-400 px-3 py-2 bg-white"
          disabled={!review}
          onClick={async () => {
            if (!review || !data) return;
            const rows = data.lines
              .filter((l) => l.invoiceId === review.id && l.catalogItemId)
              .map((l) => ({
                id: l.id,
                catalogItemId: l.catalogItemId,
                quantity: l.quantity,
                unitsPerPack: l.catalogItemId === "ci-oil" ? 35 : 40,
                lineTotalCents: l.lineTotalCents,
              }));
            await fetch(`/api/invoices/${review.id}/verify`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(rows),
            });
            await load();
          }}
        >
          Verify mapped lines
        </button>
        <a className="border border-stone-400 px-3 py-2 bg-white" href="/api/plate-delta/export">
          Verified CSV
        </a>
      </div>
      <h2 className="text-xl mb-2">Review queue</h2>
      <ul className="bg-white border border-stone-400 divide-y">
        {data?.lines
          .filter((l) => !l.verifiedAt)
          .map((l) => (
            <li key={l.id} className="p-3 flex justify-between text-sm">
              <span>{l.rawDescription}</span>
              <span className="mono">conf {(l.confidence * 100).toFixed(0)}%</span>
            </li>
          ))}
      </ul>
      <h2 className="text-xl mt-8 mb-2">Price alerts</h2>
      <ul className="space-y-2">
        {data?.alerts.map((a) => (
          <li key={a.catalogItemId + a.changeBps} className="border border-amber-700 bg-amber-50 p-3">
            {data.catalog.find((c) => c.id === a.catalogItemId)?.canonicalName} moved {a.changeBps / 100}% on a
            like-for-like unit.
          </li>
        ))}
      </ul>
    </ProductChrome>
  );
}
