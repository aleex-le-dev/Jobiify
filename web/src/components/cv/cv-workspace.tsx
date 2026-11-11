"use client";

import { ProfilesPanel } from "./profiles-panel";

/**
 * Page CV : uniquement les profils, en cartes. Le CV (Markdown + aperçu) de
 * chaque profil s'ouvre DANS sa carte quand on clique sur « Modifier ».
 */
export function CvWorkspace() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <ProfilesPanel />
    </div>
  );
}
