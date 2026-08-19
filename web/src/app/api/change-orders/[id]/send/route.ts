import { changeOrders } from "@/products/change-order-lite/engine";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = changeOrders.send(id);
  if (!result) return Response.json({ error: "not_sendable" }, { status: 409 });
  return Response.json(result);
}
