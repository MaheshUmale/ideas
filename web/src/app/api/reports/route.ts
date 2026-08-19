import { reportNarrator } from "@/products/report-narrator/engine";

export async function GET() {
  return Response.json({
    clients: reportNarrator.clients,
    sheet: reportNarrator.sheets.get("workbook") ?? {},
    reports: reportNarrator.reports,
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (body.action === "generate") return Response.json(reportNarrator.generate(body.clientId));
  if (body.action === "cell") {
    reportNarrator.setCell(body.range, body.value);
    return Response.json({ ok: true, reports: reportNarrator.reports });
  }
  if (body.action === "check") return Response.json(reportNarrator.toggleCheck(body.reportId, body.checkId));
  if (body.action === "export") return Response.json(reportNarrator.exportPdf(body.reportId));
  return Response.json({ error: "unknown_action" }, { status: 400 });
}
