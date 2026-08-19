import { changeOrders } from "@/products/change-order-lite/engine";

export async function GET() {
  return Response.json({ projects: changeOrders.projects, orders: changeOrders.orders, decisions: changeOrders.decisions });
}

export async function POST(req: Request) {
  const body = await req.json();
  const order = changeOrders.create(body);
  return Response.json(order, { status: 201 });
}
