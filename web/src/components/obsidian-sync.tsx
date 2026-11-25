"use client";

import { useEffect, useState } from "react";
import { BookOpenText, Check, Loader2, RefreshCw } from "lucide-react";

type Status = { configured: boolean; dir: string; vaultFound: boolean };
type Result = { ok: boolean; error?: string; applications?: number; companies?: number; profiles?: number; pending?: number; files?: number };

/** Réglage Obsidian : dossier du coffre où Jobiify écrit ses notes, et bouton de synchronisation. */
export function ObsidianSync() {
  const [status, setStatus] = useState<Status | null>(null);
  const [dir, setDir] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);

  useEffect(() => {
    fetch("/api/obsidian")
      .then((r) => r.json() as Promise<Status>)
      .then((s) => {
        setStatus(s);
        setDir(s.dir);
      })
      .catch(() => setStatus(null));
  }, []);

  async function sync() {
    setBusy(true);
    setRes(null);
    try {
      const r = await fetch("/api/obsidian", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dir }) });
      const data = (await r.json()) as Result;
      setRes(data);
      if (data.ok) setStatus({ configured: true, dir, vaultFound: true });
    } catch {
      setRes({ ok: false, error: "Le serveur n'a pas répondu." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-border bg-surface/30 p-5" aria-labelledby="obsidian-title">
      <div className="flex items-center gap-2.5">
        <BookOpenText className="size-5 text-brand" />
        <h2 id="obsidian-title" className="text-lg font-semibold text-foreground">Obsidian</h2>
      </div>
      <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">
        Jobiify écrit une note par candidature, par entreprise et par profil dans un dossier de votre coffre, avec des propriétés (note, statut, lien) et des liens entre notes.
        Ce que vous écrivez sous « Mes notes » n&apos;est jamais écrasé.
      </p>
      <label className="mt-4 block text-[13px] font-medium text-foreground" htmlFor="obsidian-dir">
        Dossier dans le coffre
      </label>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <input
          id="obsidian-dir"
          value={dir}
          onChange={(e) => setDir(e.target.value)}
          placeholder="C:\Users\vous\Documents\MonCoffre\jobiify"
          spellCheck={false}
          className="min-w-0 flex-1 basis-72 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand/50"
        />
        <button
          type="button"
          onClick={sync}
          disabled={busy || !dir.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-sm transition hover:brightness-110 disabled:opacity-50 max-sm:min-h-11 max-sm:w-full max-sm:justify-center"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Synchroniser maintenant
        </button>
      </div>
      <div aria-live="polite" className="mt-3 text-[13px]">
        {res?.ok && (
          <p className="inline-flex items-start gap-1.5 text-emerald-700 dark:text-emerald-300">
            <Check className="mt-0.5 size-4 shrink-0" />
            <span>
              {res.applications} candidature{(res.applications ?? 0) > 1 ? "s" : ""}, {res.companies} entreprise{(res.companies ?? 0) > 1 ? "s" : ""}, {res.profiles} profil{(res.profiles ?? 0) > 1 ? "s" : ""} — {res.files} note{(res.files ?? 0) > 1 ? "s" : ""} écrite{(res.files ?? 0) > 1 ? "s" : ""} ou mise{(res.files ?? 0) > 1 ? "s" : ""} à jour. Ouvrez « Jobiify » dans Obsidian.
            </span>
          </p>
        )}
        {res && !res.ok && <p className="text-rose-700 dark:text-rose-300">{res.error}</p>}
        {!res && status && status.configured && !status.vaultFound && <p className="text-amber-700 dark:text-amber-300">Le dossier enregistré n&apos;est pas dans un coffre Obsidian.</p>}
      </div>
    </section>
  );
}
