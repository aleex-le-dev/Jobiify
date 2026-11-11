# Vendored web fonts

The web app vendors only the latin files it uses so `next build` does not make
network requests to Google Fonts.

Jobiify identity ("Anthracite & Jade"):

- Bricolage Grotesque variable (display / headings): `@fontsource-variable/bricolage-grotesque@5.3.0`
- Hanken Grotesk variable (UI / body): `@fontsource-variable/hanken-grotesk@5.3.0`
- JetBrains Mono variable (figures, code): `@fontsource-variable/jetbrains-mono@5.3.0`

Kept from the upstream career-ops theme (still vendored, no longer loaded):

- Inter variable normal: `@fontsource-variable/inter@5.2.8`
- Instrument Serif 400 normal and italic: `@fontsource/instrument-serif@5.2.8`

All packages publish the Google Fonts binaries under the SIL Open Font
License 1.1. Each family directory includes the corresponding `OFL.txt` from
that package.
