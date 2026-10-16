"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { SkillGaps } from "@/components/skill-gaps";
import remarkGfm from "remark-gfm";
import { Check, Loader2, Sparkles, Plus, Briefcase, GraduationCap, FileText, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/components/i18n-provider";

const CV_TEMPLATE_FR = `# CV -- [Prénom Nom]

**Lieu :** [Ville (Code Postal)], France  
**Permis :** Permis B  
**Email :** [votre.email@example.com]  
**Téléphone :** [06 00 00 00 00]  
**LinkedIn :** [linkedin.com/in/votre-profil]  

## ACCROCHE

[Professionnel(le) dans [votre domaine] fort(e) de [X années] d'expérience. Spécialisé(e) en [compétence clé 1] et [compétence clé 2], rigoureux(se) et autonome, je recherche un poste de [Intitulé de poste ciblé] en CDI.]

## EXPÉRIENCE

### [Nom de l'Entreprise 1] -- [Ville (Département)]
**[Intitulé du Poste le Plus Récent]**
[Mois Année] -- Présent

- [Réalisation majeure ou projet avec impact concret ou chiffré]
- [Responsabilité opérationnelle quotidienne et gestion de tâches clés]
- [Technologies, outils ou méthodes appliqués dans ce cadre]

### [Nom de l'Entreprise 2] -- [Ville (Département)]
**[Intitulé du Poste Précédent]**
[Année Début] -- [Année Fin]

- [Principales missions confiées et objectifs atteints]
- [Collaboration, travail en équipe ou relation avec les clients/utilisateurs]

## PROJETS

- **[Nom du Projet 1]** : [Courte description du projet, technologies ou outils utilisés et résultats obtenus].
- **[Nom du Projet 2]** : [Courte description du projet, contexte et impact opérationnel].

## FORMATION

- **[Intitulé du Diplôme ou Titre] (Niveau Bac+X)**, [Nom de l'Établissement, Ville] ([Année])
- **[Autre Diplôme ou Certification]**, [Établissement] ([Année])

## COMPÉTENCES

- **Compétences Métier :** [Compétence 1], [Compétence 2], [Compétence 3], [Compétence 4]
- **Outils & Technologies :** [Outil 1], [Outil 2], [Logiciel 3], [Technologie 4]
- **Savoir-être :** Rigueur, Autonomie, Esprit d'équipe, Pédagogie, Sens du service
`;

const CV_TEMPLATE_EN = `# CV -- [First Name Last Name]

**Location:** [City, Country]
**Email:** [your.email@example.com]
**Phone:** [+1 234 567 8900]
**LinkedIn:** [linkedin.com/in/your-profile]

## Professional Summary

[Experienced professional in [your field] with [X years] of expertise. Specialized in [core skill 1] and [core skill 2]. Seeking a [Target Role] position.]

## Work Experience

### [Company 1] -- [City, State/Country]
**[Most Recent Job Title]**
[Month Year] -- Present

- [Key accomplishment or project with measurable impact]
- [Core operational responsibilities and daily ownership]
- [Tools, technologies, and methodologies used]

### [Company 2] -- [City, State/Country]
**[Previous Job Title]**
[Start Year] -- [End Year]

- [Key responsibilities and achievements]
- [Cross-functional collaboration and stakeholder engagement]

## Projects

- **[Project Name 1]** : [Brief description, technologies used, and outcomes achieved].

## Education

- **[Degree / Diploma]**, [University / School, City] ([Year])

## Skills

- **Core Skills:** [Skill 1], [Skill 2], [Skill 3]
- **Tools & Tech:** [Tool 1], [Tool 2], [Tool 3]
`;

const SNIPPET_EXPERIENCE = `### [Entreprise] -- [Ville (Département)]
**[Intitulé du Poste]**
[Mois Année] -- [Mois Année]

- [Mission ou réalisation concrète]
- [Outils ou technologies utilisés]`;

const SNIPPET_EDUCATION = `- **[Diplôme ou Formation] (Niveau Bac+X)**, [Établissement, Ville] ([Année])`;

const SNIPPET_PROJECT = `- **[Nom du Projet]** : [Courte description, technologies utilisées et résultats].`;

function formatCvPreview(markdown: string): string {
  if (!markdown) return "";

  // Assurer que les coordonnées sous le titre (Lieu, Permis, Email, Téléphone, etc.)
  // s'affichent strictement ligne par ligne même si l'utilisateur n'a pas mis 2 espaces à la fin
  let processed = markdown;
  const parts = processed.split(/(^##\s+.*$)/m);
  if (parts.length > 0) {
    parts[0] = parts[0].replace(/([^\r\n]+)\r?\n(?!\r?\n|$)/g, (_, line) => {
      if (line.startsWith("#")) return `${line}\n\n`;
      return `${line.trimEnd()}  \n`;
    });
    processed = parts.join("");
  }

  // Dans les entrées d'expérience : reformater pour afficher le titre de l'emploi en grand (H3)
  // et l'entreprise, le lieu et les dates en sous-titre secondaire discret.
  const re = /^###\s+([^\n\r#]+?)(?:\s+[-–—]{1,2}\s+([^\n\r#]+))?\r?\n+(\*\*[^\*\n\r]+\*\*)\r?\n+([^\r\n]+)/gm;
  return processed.replace(re, (_, company, location, roleBold, dates) => {
    const roleText = roleBold.replace(/^\*\*|\*\*$/g, "").trim();
    const loc = location ? ` · ${location.trim()}` : "";
    const dt = dates.trim() ? ` · ${dates.trim().replace(/--/g, "–")}` : "";
    return `### ${roleText}\n\n**${company.trim()}**${loc}${dt}\n\n`;
  });
}

const PREVIEW_STYLE = `
.cv-preview h3 {
  font-size: 1.15rem !important;
  font-weight: 700 !important;
  color: var(--fg) !important;
  margin-top: 1.6rem !important;
  margin-bottom: 0.2rem !important;
  letter-spacing: -0.01em;
}
.cv-preview h3 + p {
  font-size: 0.88rem !important;
  color: var(--muted) !important;
  margin-top: 0 !important;
  margin-bottom: 0.65rem !important;
}
.cv-preview h3 + p strong {
  color: var(--color-brand, #ea580c) !important;
  font-weight: 600 !important;
}
`;

export function CvEditor() {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [exists, setExists] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/cv")
      .then((r) => r.json())
      .then((d) => {
        setContent(d.content ?? "");
        setExists(d.exists ?? false);
      })
      .finally(() => setLoaded(true));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        setDirty(false);
        setExists(true);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        window.dispatchEvent(new CustomEvent("co-cv-saved"));
      }
    } finally {
      setSaving(false);
    }
  }

  function loadTemplate() {
    if (
      content.trim() &&
      !window.confirm(
        isFr
          ? "Remplacer le contenu actuel par le modèle type prêt à remplir ?"
          : "Replace current content with the ready-to-fill template?"
      )
    ) {
      return;
    }
    setContent(isFr ? CV_TEMPLATE_FR : CV_TEMPLATE_EN);
    setDirty(true);
  }

  function insertSnippet(snippet: string) {
    setContent((prev) => (prev ? `${prev.trimEnd()}\n\n${snippet}\n` : snippet));
    setDirty(true);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-landing">
            {isFr ? "Éditeur de CV" : "CV editor"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {isFr ? "Éditez " : "Edit "}
            <code className="text-foreground">cv.md</code>
            {isFr ? " avec aperçu en direct et formatage conforme ATS." : " with live preview and ATS-compliant formatting."}
            {!exists && loaded && (
              <span className="ml-1 text-faint">
                {isFr ? "Pas encore de cv.md — utilisez le modèle ci-dessous pour démarrer." : "No cv.md yet — use the template below to start."}
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors max-sm:min-h-11",
            dirty
              ? "bg-brand text-brand-foreground hover:bg-brand-200"
              : "border border-border bg-surface text-muted",
          )}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : saved ? <Check className="size-4" /> : null}
          {saved ? (isFr ? "Enregistré" : "Saved") : (isFr ? "Enregistrer" : "Save")}
        </button>
      </div>

      {/* Barre d'outils d'insertion de modèles et sections */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface/40 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wider mr-1">
            {isFr ? "Modèles & Blocs :" : "Templates & Blocks:"}
          </span>
          <button
            type="button"
            onClick={loadTemplate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand/20 max-sm:min-h-11"
            title={isFr ? "Charger un modèle de CV complet prêt à remplir" : "Load full ready-to-fill CV template"}
          >
            <Sparkles className="size-3.5" />
            {isFr ? "Modèle complet prêt à remplir" : "Full ready-to-fill template"}
          </button>
          <button
            type="button"
            onClick={() => insertSnippet(SNIPPET_EXPERIENCE)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:border-brand/40 hover:text-brand max-sm:min-h-11"
            title={isFr ? "Ajouter un bloc d'expérience professionnelle" : "Add an experience block"}
          >
            <Briefcase className="size-3.5" />
            {isFr ? "+ Expérience" : "+ Experience"}
          </button>
          <button
            type="button"
            onClick={() => insertSnippet(SNIPPET_EDUCATION)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:border-brand/40 hover:text-brand max-sm:min-h-11"
            title={isFr ? "Ajouter une ligne de formation / diplôme" : "Add an education line"}
          >
            <GraduationCap className="size-3.5" />
            {isFr ? "+ Formation" : "+ Education"}
          </button>
          <button
            type="button"
            onClick={() => insertSnippet(SNIPPET_PROJECT)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:border-brand/40 hover:text-brand max-sm:min-h-11"
            title={isFr ? "Ajouter une ligne de projet" : "Add a project line"}
          >
            <Plus className="size-3.5" />
            {isFr ? "+ Projet" : "+ Project"}
          </button>
        </div>
        {dirty && (
          <span className="text-[12px] text-amber-600 dark:text-amber-400 font-medium">
            {isFr ? "● Modifications non enregistrées" : "● Unsaved changes"}
          </span>
        )}
      </div>

      {!loaded ? (
        <div className="mt-6 text-sm text-muted">{isFr ? "Chargement…" : "Loading…"}</div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <style>{PREVIEW_STYLE}</style>
          <div className="flex flex-col">
            <div className="mb-2 flex items-center justify-between text-xs text-muted font-medium">
              <span>{isFr ? "Markdown source (cv.md)" : "Markdown source (cv.md)"}</span>
              <span className="text-faint">{content.length} {isFr ? "caractères" : "characters"}</span>
            </div>
            <textarea
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setDirty(true);
              }}
              spellCheck={false}
              placeholder={isFr ? "# Votre Nom\n\n## Résumé\n..." : "# Your Name\n\n## Summary\n..."}
              className="min-h-[60vh] w-full resize-none rounded-2xl border border-border bg-surface/50 p-4 font-mono text-sm leading-relaxed outline-none transition-colors placeholder:text-faint focus:border-brand/40"
            />
          </div>
          <div className="flex flex-col">
            <div className="mb-2 flex items-center justify-between text-xs text-muted font-medium">
              <span>{isFr ? "Aperçu en direct (Titre en avant)" : "Live preview (Title prioritized)"}</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">{isFr ? "Mise en forme dynamique" : "Dynamic formatting"}</span>
            </div>
            <article className="report-prose cv-preview min-h-[60vh] overflow-auto rounded-2xl border border-border bg-surface/30 p-5">
              {!content.trim() ? (
                <div className="flex h-full min-h-[50vh] flex-col items-center justify-center rounded-xl border border-dashed border-border/80 p-8 text-center">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                    <Sparkles className="size-6" />
                  </div>
                  <h3 className="mt-4 text-base font-bold text-foreground">
                    {isFr ? "Votre CV est vide" : "Your CV is empty"}
                  </h3>
                  <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted">
                    {isFr
                      ? "Pour garantir une mise en page parfaite et une lecture optimale par les recruteurs et les ATS, démarrez avec notre modèle type à remplir."
                      : "Start with our ready-to-fill CV template to ensure proper formatting and ATS compliance."}
                  </p>
                  <button
                    type="button"
                    onClick={loadTemplate}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-brand-foreground shadow-sm transition hover:brightness-110"
                  >
                    <Sparkles className="size-3.5" />
                    {isFr ? "Insérer le modèle type prêt à remplir" : "Insert ready-to-fill template"}
                  </button>
                </div>
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{formatCvPreview(content)}</ReactMarkdown>
              )}
            </article>
          </div>
        </div>
      )}

      {/* Below the editor: the gaps are context for what to write next, and they
          belong after the document rather than competing with it. */}
      <SkillGaps />
    </div>
  );
}
