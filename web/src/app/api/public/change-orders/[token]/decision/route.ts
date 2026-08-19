import { changeOrders } from "@/products/change-order-lite/engine";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json();
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const result = changeOrders.decide(token, body, ip);
  if (result.kind === "missing") return Response.json({ error: "invalid_or_expired" }, { status: 404 });
  if (result.kind === "decided") return Response.json({ error: "already_decided" }, { status: 409 });
  if (result.kind === "invalid") return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ ok: true, pdfSha256: result.pdfSha256 });
}
