"use client";

import { useEffect, useState } from "react";
import { ProductChrome } from "@/components/Chrome";
import { formatUsd } from "@/lib/money";

type Order = {
  id: string;
  number: number;
  revision: number;
  title: string;
  status: string;
  totalCents: number;
  pdfSha256: string | null;
};

export default function ChangeOrderPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [token, setToken] = useState("co_demo_token_oak_002");

  async function load() {
    const data = await (await fetch("/api/change-orders")).json();
    setOrders(data.orders);
  }
  useEffect(() => {
    void load();
  }, []);

  return (
    <ProductChrome slug="change-order-lite">
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          className="border border-stone-400 px-3 py-2 bg-white"
          onClick={async () => {
            const created = await (
              await fetch("/api/change-orders", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  projectId: "proj-oak",
                  title: "Extra blocking",
                  scope: "Owner-requested blocking at island.",
                  markupBps: 1500,
                  taxBps: 825,
                  lines: [{ description: "Blocking labor", quantity: 4, unit: "hr", unitPriceCents: 8500 }],
                  photos: ["blocking.jpg"],
                }),
              })
            ).json();
            const sent = await (await fetch(`/api/change-orders/${created.id}/send`, { method: "POST" })).json();
            setToken(sent.token);
            await load();
          }}
        >
          Draft + send COR
        </button>
        <a className="border border-stone-400 px-3 py-2 bg-white" href={`/approve/${token}`}>
          Open approval link
        </a>
        <a className="border border-stone-400 px-3 py-2 bg-white" href="/api/change-orders/export">
          Project CSV
        </a>
      </div>
      <table className="w-full text-sm bg-white border border-stone-400">
        <thead className="bg-orange-50">
          <tr>
            <th className="text-left p-3">COR</th>
            <th className="text-left p-3">Title</th>
            <th className="text-left p-3">Status</th>
            <th className="text-right p-3">Total</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-t border-stone-200">
              <td className="p-3">
                {o.number}r{o.revision}
              </td>
              <td className="p-3">{o.title}</td>
              <td className="p-3 uppercase">{o.status}</td>
              <td className="p-3 text-right">{formatUsd(o.totalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-sm text-stone-600">Documented approval — not a jurisdiction-specific e-signature.</p>
    </ProductChrome>
  );
}
