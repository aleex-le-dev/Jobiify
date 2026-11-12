"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";
import { formatCvPreview } from "@/lib/cv/cv-preview-format.mjs";

/** Aperçu mis en page d'un cv.md (nom, coordonnées, sections, postes). */
export function CvPreview({ markdown, className }: { markdown: string; className?: string }) {
  return (
    <div className={cn("report-prose cv-preview", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{formatCvPreview(markdown)}</ReactMarkdown>
    </div>
  );
}
