"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { CoMark } from "@/components/co-mark";
import { AssistantConsole } from "@/components/assistant-console";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { BackToTop } from "@/components/back-to-top";
import { JobsProvider } from "@/components/jobs/job-store";
import { PipelineProvider } from "@/components/pipeline/pipeline-provider";
import { ApplyProvider } from "@/components/apply/apply-provider";
import { ExploreProvider } from "@/components/explore/explore-provider";
import { FollowupsCountProvider, useFollowupsCount } from "@/components/followups/followups-count-provider";
import { FirstScoreView } from "@/components/explore/first-score-view";
import { BetaBanner } from "@/components/beta/beta-banner";
import { WorkerPills } from "@/components/jobs/worker-pills";
import { UsageMeter } from "@/components/usage-meter";
import { displayFont } from "@/lib/fonts";
import { visibleNavItems, isActivePath, groupedNavItems, NAV_GROUP_LABELS } from "@/lib/nav-items";
import { useI18n } from "@/components/i18n-provider";

function AppShellContent({ children, followupsEnabled }: { children: React.ReactNode; followupsEnabled: boolean }) {
  const pathname = usePathname();
  const { t, locale } = useI18n();
  const { dueCount } = useFollowupsCount();

  return (
    <>
      <MobileNav followupsEnabled={followupsEnabled} />
      <div className="flex min-h-screen">
        {/* Barre latérale : claire en mode clair, anthracite en mode sombre (classe .rail). */}
        <aside className="rail sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-border px-3 py-4 text-foreground md:flex">
          <Link href="/" className="mb-6 flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-hover">
            <CoMark size={34} animated />
            <span className="flex flex-col leading-none">
              <span className={`${displayFont.className} text-[19px] font-semibold tracking-tight text-foreground`}>Jobiify</span>
              <span className="mt-1 text-[11px] font-medium text-faint">{locale === "fr" ? "Emploi local · Artois" : "Local jobs · Artois"}</span>
            </span>
          </Link>
          <nav className="flex flex-col gap-4" aria-label={locale === "fr" ? "Navigation principale" : "Main navigation"}>
            {groupedNavItems(visibleNavItems(followupsEnabled)).map(({ group, items }) => (
              <div key={group} className="flex flex-col gap-0.5">
                <span className="eyebrow mb-1 px-3">{NAV_GROUP_LABELS[group][locale === "fr" ? "fr" : "en"]}</span>
                {items.map(({ href, key, label, icon: Icon, chip }) => {
                  const active = isActivePath(href, pathname);
                  const translatedLabel = t(key) || label;
                  const translatedChip = chip === "New" ? t("chip_new") : chip;
                  const isFollowups = href === "/followups";
                  return (
                    <Link
                      key={href}
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition-colors",
                        active
                          ? "bg-surface-hover font-semibold text-foreground"
                          : "text-muted hover:bg-surface/80 hover:text-foreground",
                      )}
                    >
                      {/* Indicateur jade de la page active. */}
                      <span
                        aria-hidden
                        className={cn(
                          "nav-indicator absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-brand",
                          active ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0",
                        )}
                      />
                      <Icon className={cn("size-[17px] shrink-0 transition-transform duration-200 group-hover:scale-110", active ? "text-brand" : "text-faint group-hover:text-muted")} />
                      <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span className="truncate">{translatedLabel}</span>
                      </span>
                      {isFollowups && (
                        <span
                          className={cn(
                            "inline-flex min-w-5 items-center justify-center rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-semibold leading-none",
                            dueCount > 0 ? "bg-brand text-brand-foreground" : "bg-surface text-faint",
                          )}
                          title={
                            dueCount > 0
                              ? `${dueCount} ${locale === "fr" ? "relance(s) en attente" : "follow-up(s) due"}`
                              : (locale === "fr" ? "Aucune relance en attente" : "No follow-ups due")
                          }
                        >
                          {dueCount}
                        </span>
                      )}
                      {translatedChip && (
                        <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-brand-text">
                          {translatedChip}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <WorkerPills />

          <div className="mt-auto space-y-3 border-t border-border pb-16 pt-4">
            <UsageMeter />

            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <span className="eyebrow">{t("appearance")}</span>
                <span className="font-mono text-[10px] text-faint">{t("theme")}</span>
              </div>
              <ThemeToggle showLabel />
              <p className="flex items-center gap-1.5 px-1 text-[11px] text-faint">
                <span className="size-1.5 rounded-full bg-brand" aria-hidden />
                {t("local_first")}
              </p>
            </div>
          </div>
        </aside>
        {/* key = chemin : chaque navigation rejoue l'entrée de page. */}
        <main key={pathname} className="page-enter min-w-0 flex-1 overflow-x-hidden">{children}</main>
        <AssistantConsole />
        <BackToTop />
        <FirstScoreView />
        <BetaBanner />
      </div>
    </>
  );
}

export function AppShell({ children, followupsEnabled }: { children: React.ReactNode; followupsEnabled: boolean }) {
  return (
    <JobsProvider>
      <PipelineProvider>
      <ApplyProvider>
      <ExploreProvider>
      <FollowupsCountProvider>
        <AppShellContent followupsEnabled={followupsEnabled}>
          {children}
        </AppShellContent>
      </FollowupsCountProvider>
      </ExploreProvider>
      </ApplyProvider>
      </PipelineProvider>
    </JobsProvider>
  );
}
