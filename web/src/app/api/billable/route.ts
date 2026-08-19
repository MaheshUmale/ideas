import { billableRecall } from "@/products/billable-recall/engine";

export async function GET() {
  return Response.json({
    allowlist: billableRecall.allowlist,
    intervals: billableRecall.intervals,
    events: billableRecall.events,
    blocks: billableRecall.blocks,
    retainers: billableRecall.retainerStatus(),
    paused: billableRecall.paused,
    csv: billableRecall.exportApprovedCsv(),
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (body.action === "allowlist") billableRecall.setAllowlist(body.hosts);
  if (body.action === "pause") billableRecall.paused = Boolean(body.paused);
  if (body.action === "visit") {
    billableRecall.flush(body.at ?? Date.now());
    billableRecall.begin(body.url, body.at ?? Date.now());
    billableRecall.flush((body.at ?? Date.now()) + (body.ms ?? 60_000));
    billableRecall.rebuild();
  }
  if (body.action === "ics") billableRecall.importIcs(body.text);
  if (body.action === "approve") billableRecall.approve(body.id, body.description);
  if (body.action === "wipe") billableRecall.wipe();
  if (body.action === "seed") billableRecall.seedDemo();
  return GET();
}
