// i18n.ts — Internationalization support for Jobiify web
export type Locale = "fr" | "en";

export const DEFAULT_LOCALE: Locale = "fr";
export const LOCALE_STORAGE_KEY = "career-ops:locale";

export const LOCALES: { code: Locale; label: string; flag: string; flagLabel: string }[] = [
  { code: "fr", label: "Français", flag: "🇫🇷", flagLabel: "Français" },
];

export const DICTIONARY: Record<Locale, Record<string, string>> = {
  fr: {
    // Navigation
    nav_today: "Aujourd'hui",
    nav_explore: "Explorer",
    nav_scheduled_scans: "Scans planifiés",
    nav_pipeline: "Candidatures",
    nav_followups: "Relances",
    nav_portals: "Portails",
    nav_analytics: "Statistiques",
    nav_cv: "Mon CV",
    nav_documents: "Documents",
    nav_config: "Configuration",
    chip_new: "Nouveau",

    // Barre latérale & Thème
    appearance: "Apparence",
    theme: "THÈME",
    language: "LANGUE",
    dark_mode: "Mode sombre",
    light_mode: "Mode clair",
    switch_to_dark: "Passer en mode sombre",
    switch_to_light: "Passer en mode clair",
    local_first: "local-first · v0",

    // Sélecteur de langue
    switch_language: "Changer de langue",
    french: "Français",
    english: "English",

    // Accueil / Today
    today_title: "Tableau de bord du jour",
    all_clear_title: "Tout est en ordre",
    all_clear_desc: "Aucune action urgente en attente aujourd'hui.",
    matches_this_week: "nouvelles offres cette semaine",
    followups_due: "relance(s) à faire",
    decisions_needed: "décision(s) en attente",
    awaiting_decision: "En attente de décision",
    ready_to_apply: "Prêt à postuler",
    fresh_matches: "Nouvelles opportunités",
    scheduled_scans_card: "Scans programmés",
    quick_eval_title: "Évaluation rapide",
    paste_job_placeholder: "Collez une URL d'offre ou le texte du poste...",
    evaluate_button: "Évaluer l'offre",
    view_report: "Voir le rapport",
    apply_button: "Postuler",
    skip_button: "Passer",
    archive_button: "Archiver",
    generating_pdf: "Génération du PDF...",
    cv_ready: "CV adapté disponible",

    // Pipeline
    pipeline_title: "Suivi des candidatures",
    pipeline_subtitle: "Visualisez et pilotez votre entonnoir de recherche",
    search_placeholder: "Rechercher par entreprise, poste, mot-clé...",
    filter_all: "Toutes les étapes",
    col_company: "Entreprise",
    col_role: "Poste",
    col_status: "Statut",
    col_score: "Score",
    col_date: "Date",
    col_actions: "Actions",

    // Statuts
    status_applied: "Candidaté",
    status_interview: "Entretien",
    status_offer: "Offre reçue",
    status_rejected: "Refusé",
    status_withdrawn: "Retiré",
    status_evaluating: "En évaluation",
    status_draft: "Brouillon",

    // Relances
    followups_title: "Relances",
    followups_subtitle: "Ne laissez aucune opportunité sans suite",
    overdue_followups: "Relances en retard",
    upcoming_followups: "Relances à venir",
    log_contact: "Enregistrer un échange",
    mark_done: "Marquer comme fait",

    // Explorer & Portails
    explore_title: "Explorer le marché",
    scan_now: "Lancer un scan",
    scanning: "Scan en cours...",
    portals_title: "Configuration des portails",
    add_company: "Ajouter une entreprise",
    tracked_companies: "Entreprises suivies",

    // CV
    cv_title: "Gestion du CV",
    cv_subtitle: "Votre CV de référence en Markdown (cv.md)",
    save_cv: "Enregistrer le CV",
    saving_cv: "Enregistrement...",
    generate_ats_pdf: "Générer un PDF ATS",
    preview: "Aperçu",

    // Actions communes
    save: "Enregistrer",
    cancel: "Annuler",
    confirm: "Confirmer",
    delete: "Supprimer",
    edit: "Modifier",
    close: "Fermer",
    loading: "Chargement...",
    error: "Une erreur est survenue",
    retry: "Réessayer",
    success: "Succès",
  },
  en: {
    // Navigation
    nav_today: "Today",
    nav_explore: "Explore",
    nav_scheduled_scans: "Scheduled scans",
    nav_pipeline: "Pipeline",
    nav_followups: "Follow-ups",
    nav_portals: "Portals",
    nav_analytics: "Analytics",
    nav_cv: "CV",
    nav_documents: "Documents",
    nav_config: "Config",
    chip_new: "New",

    // Sidebar & Theme
    appearance: "Appearance",
    theme: "THEME",
    language: "LANGUAGE",
    dark_mode: "Dark mode",
    light_mode: "Light mode",
    switch_to_dark: "Switch to dark mode",
    switch_to_light: "Switch to light mode",
    local_first: "local-first · v0",

    // Language switcher
    switch_language: "Switch language",
    french: "Français",
    english: "English",

    // Home / Today
    today_title: "Today's Dashboard",
    all_clear_title: "All clear",
    all_clear_desc: "No urgent actions due today.",
    matches_this_week: "new matches this week",
    followups_due: "follow-up(s) due",
    decisions_needed: "decision(s) needed",
    awaiting_decision: "Awaiting decision",
    ready_to_apply: "Ready to apply",
    fresh_matches: "Fresh matches",
    scheduled_scans_card: "Scheduled scans",
    quick_eval_title: "Quick Evaluate",
    paste_job_placeholder: "Paste a job URL or JD text...",
    evaluate_button: "Evaluate role",
    view_report: "View report",
    apply_button: "Apply",
    skip_button: "Skip",
    archive_button: "Archive",
    generating_pdf: "Generating PDF...",
    cv_ready: "Tailored CV ready",

    // Pipeline
    pipeline_title: "Application Pipeline",
    pipeline_subtitle: "Manage and track your job applications",
    search_placeholder: "Search company, role, keyword...",
    filter_all: "All stages",
    col_company: "Company",
    col_role: "Role",
    col_status: "Status",
    col_score: "Score",
    col_date: "Date",
    col_actions: "Actions",

    // Statuses
    status_applied: "Applied",
    status_interview: "Interview",
    status_offer: "Offer",
    status_rejected: "Rejected",
    status_withdrawn: "Withdrawn",
    status_evaluating: "Evaluating",
    status_draft: "Draft",

    // Follow-ups
    followups_title: "Follow-ups",
    followups_subtitle: "Keep your applications moving forward",
    overdue_followups: "Overdue follow-ups",
    upcoming_followups: "Upcoming follow-ups",
    log_contact: "Log contact",
    mark_done: "Mark done",

    // Explore & Portals
    explore_title: "Explore Jobs",
    scan_now: "Scan now",
    scanning: "Scanning...",
    portals_title: "Portals configuration",
    add_company: "Add company",
    tracked_companies: "Tracked companies",

    // CV
    cv_title: "CV Management",
    cv_subtitle: "Your ground-truth CV in Markdown (cv.md)",
    save_cv: "Save CV",
    saving_cv: "Saving...",
    generate_ats_pdf: "Generate ATS PDF",
    preview: "Preview",

    // Common Actions
    save: "Save",
    cancel: "Cancel",
    confirm: "Confirm",
    delete: "Delete",
    edit: "Edit",
    close: "Close",
    loading: "Loading...",
    error: "An error occurred",
    retry: "Retry",
    success: "Success",
  },
};

export function getTranslation(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const dict = DICTIONARY.fr;
  let text = dict[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
}
