import { outcomeWatch } from "@/products/outcome-watch/engine";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const status = outcomeWatch.publicStatus(token);
  if (!status) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(status);
}
