import { NextRequest } from "next/server";
import { removeOffersFromPipeline } from "@/lib/core/pipeline";
import { readJsonObject } from "@/lib/json-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let urls: string[] = [];
  const body = (await readJsonObject(req)) as { urls?: unknown; url?: unknown } | null;
  if (!body) {
    return Response.json({ removed: 0, error: "bad request" }, { status: 400 });
  }
  if (Array.isArray(body.urls)) {
    urls = body.urls.filter((u): u is string => typeof u === "string");
  } else if (typeof body.url === "string") {
    urls = [body.url];
  }

  if (urls.length === 0) return Response.json({ removed: 0 });

  const result = await removeOffersFromPipeline(urls);
  return Response.json(result);
}
