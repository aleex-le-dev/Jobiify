import { NextRequest } from "next/server";
import { removeOffersFromPipeline } from "@/lib/core/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let urls: string[] = [];
  try {
    const body = (await req.json()) as { urls?: string[]; url?: string };
    if (Array.isArray(body.urls)) {
      urls = body.urls;
    } else if (typeof body.url === "string") {
      urls = [body.url];
    }
  } catch {
    return Response.json({ removed: 0, error: "bad request" }, { status: 400 });
  }

  if (urls.length === 0) return Response.json({ removed: 0 });

  const result = await removeOffersFromPipeline(urls);
  return Response.json(result);
}
