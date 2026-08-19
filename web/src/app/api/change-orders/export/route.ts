import { changeOrders } from "@/products/change-order-lite/engine";

export async function GET() {
  return new Response(changeOrders.csv(), {
    headers: { "content-type": "text/csv; charset=utf-8" },
  });
}
