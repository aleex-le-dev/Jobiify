import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { uiFont, displayFont, monoFont } from "@/lib/fonts";
import { AppShell } from "@/components/app-shell";
import { RouteProgressHost } from "@/components/route-progress-host";
import { ThemeProvider } from "@/components/theme-provider";
import { readFollowupsEnabled } from "@/lib/followups-server";
import { I18nProvider } from "@/components/i18n-provider";
import { detectClis } from "@/lib/clis";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jobiify — recherche d'emploi locale",
  description: "Jobiify : toutes les offres d'emploi autour de chez vous, triées par profil et par temps de trajet.",
  // Home-screen / standalone (iOS): let our theme-color flow up to the status bar
  // + Dynamic Island; safe-area insets handle the layout.
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Jobiify" },
};

export const viewport: Viewport = {
  // viewport-fit=cover → env(safe-area-inset-*) become non-zero so the header can
  // sit flush under the notch / Dynamic Island.
  viewportFit: "cover",
  // Default (corrected to the real theme before paint by THEME_SCRIPT, then kept
  // in sync by the theme toggle). Dark flows seamlessly into the black island.
  themeColor: "#0b1017",
};

// Before paint: set the theme class AND tint the browser chrome (theme-color) to
// match — so Safari's status bar / URL bar unify with the header instead of a
// jarring light seam. Matches --bg (light #f7f6f3 / dark #0a0a0a).
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('career-ops:theme');var s=t==='light'||t==='dark'?t:null;var d=s==='dark'||(!s&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement('meta');m.setAttribute('name','theme-color');document.head.appendChild(m);}m.setAttribute('content',d?'#0b1017':'#f3f5f8');}catch(e){document.documentElement.classList.add('dark');}})();`;

// Outil IA branché automatiquement : si aucun outil n'est choisi (ou si celui
// choisi n'est plus installé), on retient le premier détecté sur la machine,
// avant que la page ne lise le réglage. Détection mise en cache 5 minutes.
let cliCache: { at: number; installed: string[] } | null = null;
function installedClis(): string[] {
  if (!cliCache || Date.now() - cliCache.at > 5 * 60_000) {
    let installed: string[] = [];
    try {
      installed = detectClis().filter((c) => c.installed).map((c) => c.id);
    } catch {
      /* détection impossible : on ne touche à rien */
    }
    cliCache = { at: Date.now(), installed };
  }
  return cliCache.installed;
}
function autoCliScript(installed: string[]): string {
  return `(function(){try{var ok=${JSON.stringify(installed)};if(!ok.length)return;var k='career-ops:config';var c=JSON.parse(localStorage.getItem(k)||'{}')||{};if(c.cliId&&ok.indexOf(c.cliId)>=0)return;c.cliId=ok[0];localStorage.setItem(k,JSON.stringify(c));}catch(e){}})();`;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const followupsEnabled = readFollowupsEnabled();
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${uiFont.variable} ${displayFont.variable} ${monoFont.variable}`}
    >
      <body className="font-sans antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: autoCliScript(installedClis()) }} />
        <RouteProgressHost />
        <ThemeProvider>
          <I18nProvider>
            <AppShell followupsEnabled={followupsEnabled}>{children}</AppShell>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
