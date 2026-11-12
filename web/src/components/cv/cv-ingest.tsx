"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Upload, FileText, Loader2, Check, AlertTriangle, Lock, ArrowRight, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { CvPreview } from "@/components/cv/cv-preview";
import { displayFont } from "@/lib/fonts";
import { cvReadiness, parseCvStream, type CvSeed } from "@/lib/cv/quality";
import { expandTitles } from "@/lib/job-synonyms.mjs";
import type { SearchProfile } from "@/lib/search-profile-types";

type Phase = "input" | "parsing" | "review" | "saving" | "error";

function cliId(): string | null {
  try {
    return JSON.parse(localStorage.getItem("career-ops:config") || "{}").cliId || null;
  } catch {
    return null;
  }
}

const STYLE = `
.co-cvdrop{position:relative;border:1.5px dashed color-mix(in srgb, var(--fg) 22%, transparent);border-radius:1rem;transition:border-color .2s,background .2s}
.co-cvdrop[data-over="true"]{border-color:var(--brand);background:color-mix(in srgb, var(--brand) 5%, transparent)}
.co-cvtrace{animation:co-rise .4s ease both}
`;

export function CvIngest({ onSaved }: { onSaved?: (profile?: SearchProfile) => void }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("input");
  const [paste, setPaste] = useState("");
  const [over, setOver] = useState(false);
  const [trace, setTrace] = useState("");
  const [md, setMd] = useState("");
  const [seed, setSeed] = useState<CvSeed | null>(null);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const readiness = md ? cvReadiness(md) : null;

  // ── Profil de recherche créé à partir de ce CV ──
  const [profileName, setProfileName] = useState("");
  const [titlesText, setTitlesText] = useState("");
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!seed) return;
    const roles = seed.roles?.length ? seed.roles : seed.title ? [seed.title] : [];
    setTitlesText((t) => t || roles.join(", "));
    setProfileName((n) => n || seed.title || roles[0] || "");
  }, [seed]);
  const titles = useMemo(() => titlesText.split(/[,;\n]/).map((t) => t.trim()).filter(Boolean), [titlesText]);
  const synonyms = useMemo(() => (expandTitles(titles) as string[]).filter((s) => !removed.has(s)), [titles, removed]);

  // Stream the ingest, parsing markers live.
  const runStream = useCallback(async (init: RequestInit, fallbackText?: string) => {
    setPhase("parsing");
    setTrace("Lecture de votre CV…");
    setErr("");
    try {
      const r = await fetch("/api/cv/ingest", init);
      if (r.status === 404) {
        // Aucun outil IA installé : un texte collé reste utilisable tel quel.
        if (fallbackText) {
          setSeed(null);
          setMd(fallbackText);
          setPhase("review");
          return;
        }
        setErr("needs-cli");
        setPhase("error");
        return;
      }
      if (!r.body) {
        setErr("Aucune réponse du serveur.");
        setPhase("error");
        return;
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parsed = parseCvStream(buf);
        if (parsed.error) {
          setErr(
            parsed.error === "unreadable"
              ? "Impossible de lire le texte de ce fichier (il s'agit peut-être d'une image numérisée). Collez le texte directement."
              : parsed.error === "doc-legacy"
                ? "Ancien format Word (.doc) non pris en charge : enregistrez-le en .docx ou en PDF depuis Word, puis réimportez-le."
                : parsed.error === "no-output"
                  ? "L'outil IA n'a renvoyé aucun résultat (délai dépassé ou session expirée). Réessayez, ou collez le texte du CV."
                  : "Impossible d'analyser le CV — collez le texte directement.",
          );
          setPhase("error");
          return;
        }
        if (parsed.trace) setTrace(parsed.trace.split("\n").filter(Boolean).slice(-1)[0] || "Lecture de votre CV…");
        if (parsed.markdown) setMd(parsed.markdown);
        if (parsed.seed) setSeed(parsed.seed);
      }
      const final = parseCvStream(buf);
      if (!final.markdown.trim()) {
        setErr("Aucun CV détecté — collez le texte directement.");
        setPhase("error");
        return;
      }
      setMd(final.markdown);
      setSeed(final.seed);
      setPhase("review");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur de flux");
      setPhase("error");
    }
  }, []);

  const ingestText = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setErr("Le texte semble vide — collez votre CV.");
      setPhase("error");
      return;
    }
    // Pasted text is already readable. Same path as a .md/.txt drop — no CLI.
    // (PDF/DOCX still need a CLI below.)
    // L'outil IA est détecté automatiquement côté serveur (Claude Code en priorité).
    void runStream(
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: trimmed, cliId: cliId() || "" }) },
      trimmed,
    );
  };

  const ingestFile = (file: File) => {
    // .md/.txt/.markdown : lu localement puis analysé par l'outil IA détecté (postes extraits).
    if (/\.(md|markdown|txt)$/i.test(file.name)) {
      file
        .text()
        .then((t) => {
          if (!t.trim()) {
            setErr("Ce fichier semble vide — collez votre CV.");
            setPhase("error");
            return;
          }
          ingestText(t);
        })
        .catch(() => {
          setErr("Impossible de lire ce fichier — collez votre CV.");
          setPhase("error");
        });
      return;
    }
    // PDF/other → the user's CLI parses it. Needs a configured CLI.
    const form = new FormData();
    form.append("file", file);
    form.append("cliId", cliId() || "");
    void runStream({ method: "POST", body: form });
  };

  const [saveErr, setSaveErr] = useState("");
  const save = async () => {
    if (!md.trim()) {
      setSaveErr("Votre CV semble vide — collez-le à nouveau.");
      return;
    }
    setSaveErr("");
    setPhase("saving");
    try {
      const r = await fetch("/api/search-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profileName.trim() || titles[0] || undefined,
          // Vides → le serveur crée les postes et synonymes depuis le CV.
          ...(titles.length ? { titles, synonyms } : {}),
          cvMarkdown: md,
          originCity: (seed?.location || "").split(",")[0].trim() || undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setSaveErr(d.error || "Impossible d'enregistrer votre CV — réessayez.");
        setPhase("review"); // keep the parsed CV so they don't lose it
        return;
      }
      if (onSaved) {
        onSaved(d.profile as SearchProfile);
        return;
      }
    } catch {
      setSaveErr("Impossible d'enregistrer votre CV — vérifiez votre connexion et réessayez.");
      setPhase("review");
      return;
    }
    // L'Explorer démarre sur le profil tout juste créé (actif) et lance la recherche.
    router.push("/explore?run=1");
  };

  // ── INPUT ──
  if (phase === "input" || phase === "error") {
    return (
      <div className="space-y-3">
        <style>{STYLE}</style>
        <div
          className="co-cvdrop p-6"
          data-over={over}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) ingestFile(f);
          }}
        >
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && paste.trim()) ingestText(paste.trim());
            }}
            placeholder="Collez votre CV ici — ou déposez un fichier PDF, Word (.docx), OpenDocument, RTF ou texte. Même un texte brut fonctionne : il est structuré automatiquement."
            className="h-32 w-full resize-none bg-transparent text-[14px] leading-relaxed outline-none placeholder:text-faint"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/50 px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-brand/40 hover:text-brand max-sm:min-h-11 max-sm:px-4"
            >
              <Upload className="size-3.5" /> Importer un PDF ou un Word
            </button>
            <input ref={fileRef} type="file" accept=".pdf,.docx,.odt,.rtf,.doc,.md,.markdown,.txt" hidden onChange={(e) => e.target.files?.[0] && ingestFile(e.target.files[0])} />
            <span className="inline-flex items-center gap-1 text-[11px] text-faint">
              <Lock className="size-3" /> Reste sur votre machine. Analysé par votre propre IA.
            </span>
            <button
              type="button"
              disabled={!paste.trim()}
              onClick={() => ingestText(paste.trim())}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-sm transition hover:brightness-110 disabled:opacity-50 max-sm:min-h-11"
            >
              Analyser mon CV <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
        {phase === "error" &&
          (err === "needs-cli" ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[13px] text-amber-700 dark:text-amber-300">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span>Aucun outil IA n'a été trouvé sur cet ordinateur pour lire le PDF / Word. Installez Claude Code (extension VS Code ou CLI) : il sera détecté automatiquement. En attendant, collez le texte du CV.</span>
              <Link href="/config" className="ml-auto inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2.5 py-1 font-medium text-amber-700 transition hover:bg-amber-500/30 dark:text-amber-200">
                Voir les outils détectés <ArrowRight className="size-3.5" />
              </Link>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-[13px] text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-3.5 shrink-0" /> {err}
            </p>
          ))}
      </div>
    );
  }

  // ── PARSING (the 10s bridge) ──
  if (phase === "parsing") {
    return (
      <div className="rounded-2xl border border-border bg-surface/60 p-6 backdrop-blur-sm">
        <style>{STYLE}</style>
        <div className="flex items-center gap-2.5">
          <Loader2 className="size-4 animate-spin text-brand" />
          <span className={`${displayFont.className} text-lg text-foreground`}>{trace || "Lecture de votre CV…"}</span>
        </div>
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
          <span className="size-1.5 rounded-full bg-emerald-500" /> 0 jeton · 0,00 € · local
        </div>
        {md && <div className="co-cvtrace mt-4 max-h-40 overflow-hidden rounded-lg border border-border bg-surface/40 p-3 text-[11px] text-faint">{md.slice(0, 400)}…</div>}
      </div>
    );
  }

  // ── REVIEW (propose → confirm) ──
  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-4 backdrop-blur-sm md:p-5">
      <style>{STYLE}</style>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FileText className="size-4 text-brand" />
        <h3 className={`${displayFont.className} text-lg text-foreground`}>Voici votre CV — vérifiez et enregistrez</h3>
        {readiness && (
          <span
            className={cn(
              "ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
              readiness.scoreable ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
            )}
          >
            {readiness.scoreable ? <Check className="size-3" /> : <AlertTriangle className="size-3" />}
            {readiness.scoreable ? "Prêt pour le matching" : "Un peu succinct"}
          </span>
        )}
      </div>
      {readiness?.hint && <p className="mb-2 text-[12px] text-amber-600 dark:text-amber-400">{readiness.hint}</p>}
      {saveErr && (
        <p className="mb-2 flex items-center gap-1.5 text-[12px] text-red-500">
          <AlertTriangle className="size-3.5 shrink-0" /> {saveErr}
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col">
          <span className="mb-1.5 text-[11px] font-medium text-faint">Texte du CV (modifiable)</span>
          <textarea
            value={md}
            onChange={(e) => setMd(e.target.value)}
            spellCheck={false}
            className="h-[30rem] w-full resize-none rounded-lg border border-border bg-surface/40 p-3 font-mono text-[12px] leading-relaxed outline-none focus:border-brand/40"
          />
        </div>
        <div className="flex flex-col">
          <span className="mb-1.5 text-[11px] font-medium text-faint">Aperçu</span>
          <CvPreview markdown={md} className="h-[30rem] overflow-y-auto rounded-lg border border-border bg-surface/40 p-5" />
        </div>
      </div>
      <div className="mt-4 space-y-3 rounded-xl border border-border bg-surface/40 p-4">
        <p className="text-sm font-semibold text-foreground">Profil de recherche lié à ce CV</p>
        <p className="-mt-2 text-[12px] text-muted">Postes et synonymes créés automatiquement depuis le CV — ajustez-les si besoin.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-[12px] text-muted">
            Nom du profil
            <input
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="ex. Technicien informatique"
              className="mt-1 w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-[13px] text-foreground outline-none focus:border-brand/40"
            />
          </label>
          <label className="block text-[12px] text-muted">
            Postes recherchés (séparés par des virgules)
            <input
              value={titlesText}
              onChange={(e) => setTitlesText(e.target.value)}
              placeholder="Laisser vide : déduits automatiquement du CV"
              className="mt-1 w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-[13px] text-foreground outline-none focus:border-brand/40"
            />
          </label>
        </div>
        <div>
          <p className="mb-1.5 text-[12px] text-muted">
            {synonyms.length} synonymes ajoutés automatiquement pour ne rater aucune offre (cliquez pour en retirer un) :
          </p>
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {synonyms.map((syn) => (
              <button
                key={syn}
                type="button"
                onClick={() => setRemoved((r) => new Set(r).add(syn))}
                className="rounded-full border border-border bg-background/60 px-2 py-0.5 text-[11px] text-muted transition hover:border-red-400 hover:text-red-500"
              >
                {syn} ×
              </button>
            ))}
            {synonyms.length === 0 && <span className="text-[11px] text-faint">Aucun synonyme connu pour ces postes — vous pourrez en ajouter dans le profil.</span>}
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={phase === "saving"}
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60"
        >
          {phase === "saving" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Créer le profil et chercher les offres
        </button>
        <button
          type="button"
          onClick={() => {
            setMd("");
            setSeed(null);
            setPhase("input");
          }}
          className="inline-flex items-center gap-1.5 text-[13px] text-muted transition hover:text-foreground"
        >
          <RotateCcw className="size-3.5" /> Recommencer
        </button>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-faint">
          <Lock className="size-3" /> Enregistré localement (data/profiles + cv.md)
        </span>
      </div>
    </div>
  );
}
