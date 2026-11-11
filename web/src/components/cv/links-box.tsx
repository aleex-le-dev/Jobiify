"use client";

import { useEffect, useMemo, useState } from "react";
import { Briefcase, Check, Globe, Link2, Loader2, Plus, Share2, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { detectKind, displayUrl, normalizeUrl } from "@/lib/cv-links.mjs";

type Link = { label: string; url: string };
type Extra = { id: number; label: string; url: string };

/** Réseaux affichés en permanence, avec leur libellé fixe dans le CV. */
const SOCIALS = [
  { key: "linkedin", label: "LinkedIn", placeholder: "https://www.linkedin.com/in/votre-profil", badge: { text: "in", bg: "#0a66c2" } },
  { key: "github", label: "GitHub", placeholder: "https://github.com/votre-identifiant", badge: { text: "GH", bg: "#24292f" } },
  { key: "portfolio", label: "Portfolio", placeholder: "https://votre-site.fr", badge: null },
] as const;
const SOCIAL_LABELS = new Set(SOCIALS.map((s) => s.label.toLowerCase()));

/** Petites marques reconnaissables, sans dépendance à une bibliothèque d'icônes. */
function Badge({ url, preset }: { url: string; preset?: { text: string; bg: string } | null }) {
  const map: Record<string, { text: string; bg: string }> = {
    linkedin: { text: "in", bg: "#0a66c2" },
    github: { text: "GH", bg: "#24292f" },
    gitlab: { text: "GL", bg: "#e24329" },
    malt: { text: "M", bg: "#fc5757" },
    behance: { text: "Bē", bg: "#1769ff" },
    dribbble: { text: "D", bg: "#ea4c89" },
    stackoverflow: { text: "SO", bg: "#f48024" },
    youtube: { text: "▶", bg: "#ff0000" },
    x: { text: "X", bg: "#000000" },
  };
  const m = preset ?? (url ? map[detectKind(url).kind] : undefined);
  if (!m) {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-muted">
        <Globe className="size-4" />
      </span>
    );
  }
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold text-white" style={{ background: m.bg }}>
      {m.text}
    </span>
  );
}

const inputCls =
  "min-w-0 rounded-lg border bg-background/60 px-3 py-2 text-[13px] text-foreground outline-none transition focus:border-brand/50";

let nextId = 1;

/**
 * « Mes liens » : réseaux sociaux (LinkedIn, GitHub, Portfolio) + autres liens
 * libres (nom + adresse). Tout est ajouté automatiquement dans l'en-tête de TOUS
 * les CV, y compris ceux importés plus tard.
 */
export function LinksBox({ onSaved }: { onSaved?: () => void }) {
  const [socials, setSocials] = useState<Record<string, string>>({ linkedin: "", github: "", portfolio: "" });
  const [extras, setExtras] = useState<Extra[]>([]);
  const [saved, setSaved] = useState("[]");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [fromCv, setFromCv] = useState(false);

  const load = (links: Link[]) => {
    const s: Record<string, string> = { linkedin: "", github: "", portfolio: "" };
    const others: Extra[] = [];
    for (const l of links) {
      const social = SOCIALS.find((x) => x.label.toLowerCase() === l.label.toLowerCase());
      if (social) s[social.key] = l.url;
      else others.push({ id: nextId++, label: l.label, url: l.url });
    }
    setSocials(s);
    setExtras(others);
  };

  useEffect(() => {
    fetch("/api/cv-links", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const savedLinks: Link[] = Array.isArray(d.links) ? d.links : [];
        const suggested: Link[] = Array.isArray(d.suggested) ? d.suggested : [];
        const links = savedLinks.length ? savedLinks : suggested;
        setFromCv(!savedLinks.length && suggested.length > 0);
        load(links);
        setSaved(JSON.stringify(savedLinks.map((l) => [l.label, l.url])));
      })
      .catch(() => setNote({ ok: false, text: "Impossible de charger vos liens." }))
      .finally(() => setLoading(false));
  }, []);

  const payload = useMemo<Link[]>(() => {
    const out: Link[] = [];
    for (const s of SOCIALS) if (socials[s.key].trim()) out.push({ label: s.label, url: socials[s.key].trim() });
    for (const e of extras) if (e.url.trim()) out.push({ label: e.label.trim() || detectKind(e.url).label, url: e.url.trim() });
    return out;
  }, [socials, extras]);

  const badUrl = (u: string) => Boolean(u.trim()) && !normalizeUrl(u);
  const invalid = SOCIALS.some((s) => badUrl(socials[s.key])) || extras.some((e) => badUrl(e.url));
  const missingName = extras.some((e) => e.url.trim() && !e.label.trim());
  const reservedName = extras.some((e) => SOCIAL_LABELS.has(e.label.trim().toLowerCase()));
  const dirty = fromCv || JSON.stringify(payload.map((p) => [p.label, normalizeUrl(p.url)?.href])) !== saved;

  const save = async () => {
    setSaving(true);
    setNote(null);
    try {
      const r = await fetch("/api/cv-links", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links: payload }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur");
      load(d.links);
      setSaved(JSON.stringify(d.links.map((l: Link) => [l.label, l.url])));
      setFromCv(false);
      setNote({ ok: true, text: d.updatedCvs ? `${d.updatedCvs} CV mis à jour automatiquement.` : "Liens enregistrés — vos CV étaient déjà à jour." });
      onSaved?.();
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setSaving(false);
    }
  };

  const preview = (u: string) => (u.trim() && !badUrl(u) ? `Dans le CV : ${displayUrl(u)}` : "");

  return (
    <section className="panel mb-6 p-4 md:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Link2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-foreground">Mes liens</h2>
          <p className="text-[12.5px] text-muted">
            Ajoutés automatiquement dans l&apos;en-tête de tous vos CV, y compris ceux importés plus tard.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-[13px] text-muted">
          <Loader2 className="size-4 animate-spin" /> Chargement…
        </p>
      ) : (
        <>
          {fromCv && (
            <p className="mt-3 rounded-md bg-brand-soft px-3 py-2 text-[12px] text-brand-text">
              Liens repris de votre CV actuel — vérifiez-les puis enregistrez pour les appliquer à tous vos CV.
            </p>
          )}

          {/* ── Réseaux sociaux ── */}
          <p className="eyebrow mt-5 mb-2 flex items-center gap-1.5">
            <Share2 className="size-3.5" /> Réseaux sociaux
          </p>
          <ul className="space-y-2">
            {SOCIALS.map((s) => {
              const v = socials[s.key];
              return (
                <li key={s.key} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  {s.badge ? <Badge url="" preset={s.badge} /> : (
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                      <Briefcase className="size-4" />
                    </span>
                  )}
                  <span className="w-24 shrink-0 text-[13px] font-medium text-foreground">{s.label}</span>
                  <input
                    value={v}
                    onChange={(e) => setSocials((x) => ({ ...x, [s.key]: e.target.value }))}
                    placeholder={s.placeholder}
                    aria-label={`Adresse ${s.label}`}
                    aria-invalid={badUrl(v)}
                    inputMode="url"
                    className={cn(inputCls, "flex-1 font-mono text-[12.5px]", badUrl(v) ? "border-red-400" : "border-border")}
                  />
                  <span className="hidden w-52 shrink-0 truncate text-[11.5px] text-faint lg:block">{preview(v)}</span>
                  <button
                    type="button"
                    onClick={() => setSocials((x) => ({ ...x, [s.key]: "" }))}
                    disabled={!v}
                    aria-label={`Effacer le lien ${s.label}`}
                    className="rounded-lg p-2 text-faint transition hover:bg-surface-hover hover:text-red-500 disabled:invisible"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>

          {/* ── Autres liens (nom + adresse libres) ── */}
          <p className="eyebrow mt-5 mb-2 flex items-center gap-1.5">
            <Globe className="size-3.5" /> Autres liens
          </p>
          {extras.length === 0 ? (
            <p className="text-[12.5px] text-faint">
              Malt, Behance, site personnel, article, certification en ligne… ajoutez tout ce que vous voulez montrer sur votre CV.
            </p>
          ) : (
            <ul className="space-y-2">
              {extras.map((e) => (
                <li key={e.id} className="animate-rise flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  <Badge url={e.url} />
                  <input
                    value={e.label}
                    onChange={(ev) => setExtras((xs) => xs.map((x) => (x.id === e.id ? { ...x, label: ev.target.value } : x)))}
                    placeholder="Nom (ex. Malt)"
                    aria-label="Nom du lien"
                    className={cn(inputCls, "w-24 shrink-0 sm:w-36", (e.url.trim() && !e.label.trim()) || SOCIAL_LABELS.has(e.label.trim().toLowerCase()) ? "border-red-400" : "border-border")}
                  />
                  <input
                    value={e.url}
                    onChange={(ev) =>
                      setExtras((xs) =>
                        xs.map((x) => {
                          if (x.id !== e.id) return x;
                          const url = ev.target.value;
                          // Nom proposé à partir de l'adresse tant qu'il est vide.
                          const label = x.label.trim() ? x.label : url.trim() && detectKind(url).kind !== "site" ? detectKind(url).label : x.label;
                          return { ...x, url, label };
                        }),
                      )
                    }
                    placeholder="https://…"
                    aria-label="Adresse du lien"
                    aria-invalid={badUrl(e.url)}
                    inputMode="url"
                    className={cn(inputCls, "flex-1 font-mono text-[12.5px]", badUrl(e.url) ? "border-red-400" : "border-border")}
                  />
                  <span className="hidden w-52 shrink-0 truncate text-[11.5px] text-faint lg:block">{preview(e.url)}</span>
                  <button
                    type="button"
                    onClick={() => setExtras((xs) => xs.filter((x) => x.id !== e.id))}
                    aria-label="Supprimer ce lien"
                    className="rounded-lg p-2 text-faint transition hover:bg-surface-hover hover:text-red-500"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setExtras((xs) => [...xs, { id: nextId++, label: "", url: "" }])}
              disabled={extras.length >= 9}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-[13px] font-medium text-muted transition hover:border-brand/50 hover:text-foreground disabled:opacity-50"
            >
              <Plus className="size-4" /> Ajouter un autre lien
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || invalid || missingName || reservedName || !dirty}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-brand-foreground shadow-sm transition hover:bg-brand-200 disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Enregistrer et mettre à jour mes CV
            </button>
            {invalid && <span className="text-[12px] text-red-500">Une adresse n&apos;est pas valide.</span>}
            {!invalid && missingName && <span className="text-[12px] text-red-500">Donnez un nom à chaque lien.</span>}
            {!invalid && !missingName && reservedName && (
              <span className="text-[12px] text-red-500">LinkedIn, GitHub et Portfolio se renseignent dans « Réseaux sociaux ».</span>
            )}
            {note && <span className={cn("text-[12px]", note.ok ? "text-brand-text" : "text-red-500")}>{note.text}</span>}
          </div>
        </>
      )}
    </section>
  );
}
