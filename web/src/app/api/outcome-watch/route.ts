import { outcomeWatch } from "@/products/outcome-watch/engine";

export async function GET() {
  const workflows = [...outcomeWatch.workflows.values()].map((w) => outcomeWatch.health(w));
  return Response.json({
    workflows,
    incidents: outcomeWatch.incidents,
    emails: outcomeWatch.emails,
    events: outcomeWatch.events.slice(-20),
  });
}
