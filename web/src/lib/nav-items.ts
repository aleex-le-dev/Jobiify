import { LayoutDashboard, Compass, ListChecks, Send, Radar, BarChart3, FileText, Files, Settings, CalendarClock } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

// Single source of truth for the app's primary destinations — shared by the
// desktop sidebar and the mobile nav so they can never drift.
export type NavItem = {
  href: string;
  label: string;
  key: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  chip?: string;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Today", key: "nav_today", icon: LayoutDashboard },
  { href: "/explore", label: "Explore", key: "nav_explore", icon: Compass, chip: "New" },
  { href: "/scheduled-scans", label: "Scheduled scans", key: "nav_scheduled_scans", icon: CalendarClock },
  { href: "/pipeline", label: "Pipeline", key: "nav_pipeline", icon: ListChecks },
  { href: "/followups", label: "Follow-ups", key: "nav_followups", icon: Send },
  { href: "/portals", label: "Portals", key: "nav_portals", icon: Radar },
  { href: "/analytics", label: "Analytics", key: "nav_analytics", icon: BarChart3 },
  { href: "/cv", label: "CV", key: "nav_cv", icon: FileText },
  { href: "/documents", label: "Documents", key: "nav_documents", icon: Files },
  { href: "/config", label: "Config", key: "nav_config", icon: Settings },
];

export function visibleNavItems(followupsEnabled: boolean): NavItem[] {
  return followupsEnabled ? NAV_ITEMS : NAV_ITEMS.filter((item) => item.href !== "/followups");
}

export function isActivePath(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
