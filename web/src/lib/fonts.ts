import localFont from "next/font/local";

// Identité Jobiify « Anthracite & Jade ». Toutes les polices sont embarquées en
// local (voir src/assets/fonts/README.md) : aucun appel réseau au build ni à l'usage.

// Interface / texte courant — Hanken Grotesk : une grotesque nette et dense,
// très lisible en petite taille (tableaux, formulaires, listes d'offres).
export const uiFont = localFont({
  src: [{
    path: "../assets/fonts/hanken-grotesk/hanken-grotesk-latin-wght-normal.woff2",
    weight: "100 900",
    style: "normal",
  }],
  variable: "--font-ui",
  display: "swap",
});

// Titres — Bricolage Grotesque : du caractère pour les titres de pages et de
// cartes, sans perdre l'aspect logiciel professionnel.
export const displayFont = localFont({
  src: [{
    path: "../assets/fonts/bricolage-grotesque/bricolage-grotesque-latin-wght-normal.woff2",
    weight: "200 800",
    style: "normal",
  }],
  variable: "--font-display-face",
  display: "swap",
});

// Chiffres, compteurs, code — JetBrains Mono.
export const monoFont = localFont({
  src: [{
    path: "../assets/fonts/jetbrains-mono/jetbrains-mono-latin-wght-normal.woff2",
    weight: "100 800",
    style: "normal",
  }],
  variable: "--font-mono-face",
  display: "swap",
});
