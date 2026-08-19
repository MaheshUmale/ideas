import { outcomeWatch } from "@/products/outcome-watch/engine";

export async function POST(req: Request) {
  const key = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
  const raw = Buffer.from(await req.arrayBuffer());
  let body: unknown = {};
  try {
    body = JSON.parse(raw.toString("utf8") || "{}");
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const result = outcomeWatch.ingest(key, body, raw.byteLength);
  if ("error" in result) {
    return Response.json(
      { error: result.error, fields: "fields" in result ? result.fields : undefined },
      { status: result.status },
    );
  }
  return Response.json({ accepted: true }, { status: 202 });
}
