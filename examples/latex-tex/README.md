# LaTeX-in examples (latex-tex mode)

Fictional `.tex` fixtures for `scripts/extract-latex-content.mjs` / `scripts/patch-latex-content.mjs` tests.
Do not use real names, emails, or employers from your own CV here.

| File | Family |
|------|--------|
| `resume-subheading.tex` | `resumeSubheading` — `\resumeItem` bullets + `\textbf{Category}{: items}` skills |
| `tabularx-itemize.tex` | `tabularx-itemize` — `tabularx` header rows + `itemize` bullets |

```bash
node scripts/extract-latex-content.mjs examples/latex-tex/resume-subheading.tex
```
