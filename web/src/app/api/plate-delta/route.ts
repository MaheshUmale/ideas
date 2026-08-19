import { plateDelta } from "@/products/plate-delta/engine";

export async function GET() {
  return Response.json({
    vendors: plateDelta.vendors,
    catalog: plateDelta.catalog,
    invoices: plateDelta.invoices,
    lines: plateDelta.lines,
    alerts: plateDelta.alerts,
  });
}
