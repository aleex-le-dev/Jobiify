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
import { instrumentSerif } from "@/lib/fonts";
import { visibleNavItems, isActivePath } from "@/lib/nav-items";
import { useI18n } from "@/components/i18n-provider";

function AppShellContent({ children, followupsEnabled }: { children: React.ReactNode; followupsEnabled: boolean }) {
  const pathname = usePathname();
  const { t, locale } = useI18n();
  const { dueCount } = useFollowupsCount();

  return (
    <>
      <MobileNav followupsEnabled={followupsEnabled} />
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface/30 p-4 md:flex">
          <Link href="/" className="mb-8 flex items-center gap-2.5 px-1">
            <CoMark size={32} />
            <span className={`${instrumentSerif.className} relative -top-px text-2xl font-normal tracking-tight text-landing`}>
              Jobiify
            </span>
          </Link>
          <nav className="flex flex-col gap-1">
            {visibleNavItems(followupsEnabled).map(({ href, key, label, icon: Icon, chip }) => {
              const active = isActivePath(href, pathname);
              const translatedLabel = t(key) || label;
              const translatedChip = chip === "New" ? t("chip_new") : chip;
              const isFollowups = href === "/followups";
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-brand-soft text-brand-text font-medium"
                      : "text-muted hover:bg-surface-hover hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="truncate">{translatedLabel}</span>
                    {isFollowups && (
                      <span
                        className={cn(
                          "inline-flex items-center justify-center rounded-full px-1.5 py-0.2 text-[10px] font-bold tabular-nums leading-normal",
                          dueCount > 0
                            ? "bg-brand/20 text-brand-text border border-brand/30"
                            : "bg-surface-hover text-faint border border-border/50",
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
                  </span>
                  {translatedChip && (
                    <span className="ml-auto rounded-full border border-brand/30 bg-brand-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-text">
                      {translatedChip}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <WorkerPills />

          <div className="mt-auto space-y-3 pb-16 pt-4">
            <UsageMeter />

            {/* Appearance / Theme */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">{t("appearance")}</span>
                <span className="font-mono text-[10px] text-faint">{t("theme")}</span>
              </div>
              <ThemeToggle showLabel />
              <div className="px-1">
                <span className={`${instrumentSerif.className} text-sm text-faint`}>{t("local_first")}</span>
              </div>
            </div>
          </div>
        </aside>
        <main className="flex-1 overflow-x-hidden">{children}</main>
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
