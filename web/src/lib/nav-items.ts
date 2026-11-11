import { LayoutDashboard, Compass, ListChecks, Send, Radar, FileText, Files, Settings, CalendarClock, HardHat } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

// Single source of truth for the app's primary destinations — shared by the
// desktop sidebar and the mobile nav so they can never drift.
export type NavItem = {
  href: string;
  label: string;
  key: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  chip?: string;
  /** Section de la barre latérale (regroupement visuel uniquement). */
  group?: NavGroup;
};

export type NavGroup = "search" | "applications" | "insights" | "dossier" | "system";

export const NAV_GROUP_LABELS: Record<NavGroup, { fr: string; en: string }> = {
  search: { fr: "Trouver un emploi", en: "Find a job" },
  applications: { fr: "Postuler & relancer", en: "Apply & follow up" },
  insights: { fr: "Sources", en: "Sources" },
  dossier: { fr: "Mon dossier candidat", en: "My candidate file" },
  system: { fr: "Réglages", en: "Settings" },
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Today", key: "nav_today", icon: LayoutDashboard, group: "search" },
  { href: "/explore", label: "Explore", key: "nav_explore", icon: Compass, group: "search" },
  { href: "/interim", label: "Temp work", key: "nav_interim", icon: HardHat, group: "search" },
  { href: "/scheduled-scans", label: "Scheduled scans", key: "nav_scheduled_scans", icon: CalendarClock, group: "search" },
  { href: "/pipeline", label: "Pipeline", key: "nav_pipeline", icon: ListChecks, group: "applications" },
  { href: "/followups", label: "Follow-ups", key: "nav_followups", icon: Send, group: "applications" },
  { href: "/portals", label: "Portals", key: "nav_portals", icon: Radar, group: "insights" },
  { href: "/cv", label: "CV", key: "nav_cv", icon: FileText, group: "dossier" },
  { href: "/documents", label: "Documents", key: "nav_documents", icon: Files, group: "dossier" },
  { href: "/config", label: "Config", key: "nav_config", icon: Settings, group: "system" },
];

export function visibleNavItems(followupsEnabled: boolean): NavItem[] {
  return followupsEnabled ? NAV_ITEMS : NAV_ITEMS.filter((item) => item.href !== "/followups");
}

export function isActivePath(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Regroupe les entrées par section, dans l'ordre d'origine (catégories inchangées). */
export function groupedNavItems(items: NavItem[]): Array<{ group: NavGroup; items: NavItem[] }> {
  const out: Array<{ group: NavGroup; items: NavItem[] }> = [];
  for (const item of items) {
    const group = item.group ?? "system";
    const last = out[out.length - 1];
    if (last && last.group === group) last.items.push(item);
    else out.push({ group, items: [item] });
  }
  return out;
}
