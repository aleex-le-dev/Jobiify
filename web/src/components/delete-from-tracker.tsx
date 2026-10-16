"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

export function DeleteFromTracker({ n }: { n: string }) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [orphan, setOrphan] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function openConfirm() {
    setOpen(true);
    setErr("");
    setOrphan(null);
    try {
      const r = await fetch("/api/tracker/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n, dryRun: true }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error || (isFr ? "Cette ligne ne peut pas être supprimée." : "This row can’t be removed."));
        return;
      }
      setOrphan(d.orphanReport ?? null);
    } catch {
      setErr(isFr ? "Impossible de contacter le tracker." : "Couldn’t reach the tracker.");
    }
  }

  async function confirmDelete() {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/tracker/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error || (isFr ? "La suppression a échoué." : "Delete failed."));
        setBusy(false);
        return;
      }
      router.push("/pipeline");
      router.refresh();
    } catch {
      setErr(isFr ? "La suppression a échoué." : "Delete failed.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={openConfirm}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted max-sm:min-h-[44px] transition-colors hover:border-red-400/50 hover:text-red-500"
      >
        <Trash2 className="size-3.5" /> {isFr ? "Supprimer du tracker" : "Remove from tracker"}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-red-400/30 bg-red-500/[0.06] p-3 text-xs">
      <p className="font-medium text-foreground">
        {isFr ? `Supprimer définitivement la candidature #${n} du tracker ?` : `Permanently remove application #${n} from your tracker?`}
      </p>
      <p className="mt-1 text-muted">
        {isFr
          ? `Cette action est irréversible.${orphan ? ` Le fichier de rapport (${orphan}) reste sur le disque.` : ""}`
          : `This can’t be undone.${orphan ? ` Its report file (${orphan}) is left on disk.` : ""}`}
      </p>
      {err && <p className="mt-1.5 text-red-500">{err}</p>}
      <div className="mt-2.5 flex gap-2">
        <button
          disabled={busy}
          onClick={confirmDelete}
          className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1 font-medium max-sm:min-h-[44px] text-white transition-colors hover:bg-red-600 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} {isFr ? "Supprimer" : "Delete"}
        </button>
        <button
          disabled={busy}
          onClick={() => setOpen(false)}
          className="rounded-md border border-border px-2.5 py-1 text-muted max-sm:min-h-[44px] transition-colors hover:text-foreground disabled:opacity-50"
        >
          {isFr ? "Annuler" : "Cancel"}
        </button>
      </div>
    </div>
  );
}
