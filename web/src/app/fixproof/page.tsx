"use client";

import { useEffect, useState } from "react";
import { ProductChrome } from "@/components/Chrome";

export default function FixProofPage() {
  const [data, setData] = useState<{ workOrders: { id: string; summary: string; status: string; propertyLabel: string }[] } | null>(null);
  const [token, setToken] = useState("fp_vendor_willow_leak");

  async function load() {
    setData(await (await fetch("/api/fixproof")).json());
  }
  useEffect(() => {
    void load();
  }, []);

  return (
    <ProductChrome slug="fixproof">
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          className="border border-stone-400 px-3 py-2 bg-white"
          onClick={async () => {
            const created = await (
              await fetch("/api/fixproof", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  propertyId: "prop-4a",
                  summary: "HVAC not cooling",
                  tenantContact: "hidden@tenant.test",
                  hours: 12,
                  vendorName: "Summit HVAC",
                  vendorContact: "summit@vendors.test",
                }),
              })
            ).json();
            setToken(created.token);
            await load();
          }}
        >
          Assign new work order
        </button>
        <a className="border border-stone-400 px-3 py-2 bg-white" href={`/vendor/${token}`}>
          Vendor no-login link
        </a>
        <button
          className="border border-stone-400 px-3 py-2 bg-white"
          onClick={async () => {
            if (data?.workOrders[0]) await fetch(`/api/fixproof/${data.workOrders[0].id}/close`, { method: "POST" });
            await load();
          }}
        >
          Manager verify / close
        </button>
      </div>
      <ul className="space-y-3">
        {data?.workOrders.map((wo) => (
          <li key={wo.id} className="border border-stone-400 bg-white p-4 flex justify-between">
            <div>
              <strong>{wo.propertyLabel}</strong>
              <p>{wo.summary}</p>
            </div>
            <span className="mono uppercase text-sm">{wo.status}</span>
          </li>
        ))}
      </ul>
    </ProductChrome>
  );
}
