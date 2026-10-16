import { Radar } from "lucide-react";
import path from "node:path";
import { PortalsView } from "@/components/portals-view";
import { careerOpsRoot } from "@/lib/career-ops";
import { loadPortalsDocument, watchedCompanies, type WatchedCompany } from "@/lib/portals-config.mjs";

export const dynamic = "force-dynamic";

function readWatched(): { watched: WatchedCompany[]; error: string | null } {
  const root = careerOpsRoot();
  try {
    const { doc, seeded } = loadPortalsDocument(path.join(root, "portals.yml"), path.join(root, "templates", "portals.example.yml"));
    return { watched: seeded ? [] : watchedCompanies(doc), error: null };
  } catch (e) {
    return { watched: [], error: e instanceof Error ? e.message : String(e) };
  }
}

import { getApisStatus } from "@/lib/core/api-status";

export default function PortalsPage() {
  const { watched, error } = readWatched();
  const apis = getApisStatus();
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <PortalsView watched={watched} initialApis={apis} initialError={error} />
    </div>
  );
}
