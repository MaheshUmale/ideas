import { outcomeWatch } from "@/products/outcome-watch/engine";

export async function POST() {
  outcomeWatch.evaluate(new Date());
  return Response.json({ ok: true, incidents: outcomeWatch.incidents.length });
}
