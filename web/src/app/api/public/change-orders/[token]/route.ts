import { changeOrders } from "@/products/change-order-lite/engine";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = changeOrders.publicView(token);
  if (view.kind === "missing") return Response.json({ error: "invalid_or_expired" }, { status: 404 });
  return Response.json(view.order);
}
