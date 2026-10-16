"use client";

import { useEffect, useState } from "react";
import {
  X,
  Key,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Eye,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { ApiInfo } from "./portals-view";

interface ApiConfigModalProps {
  api: ApiInfo;
  onClose: () => void;
  onSuccess: (apis: ApiInfo[]) => void;
}

interface FieldConfig {
  key: string;
  label: string;
  placeholder: string;
  help?: string;
}

const API_FIELDS: Record<
  string,
  {
    targetId: string;
    title: string;
    description: string;
    docUrl: string;
    docLabel: string;
    fields: FieldConfig[];
    extraNote?: string;
  }
> = {
  "france-travail": {
    targetId: "france-travail",
    title: "Configuration France Travail (Offres d'emploi v2)",
    description:
      "Accédez à toutes les offres directes des employeurs de la région et des partenaires (Apec, Meteojob, HelloWork).",
    docUrl: "https://francetravail.io/",
    docLabel: "Espace Développeurs France Travail (gratuit)",
    fields: [
      {
        key: "FRANCETRAVAIL_CLIENT_ID",
        label: "Client ID",
        placeholder: "ex: PAR_jobsearch_a1b2c3d4...",
        help: "Disponible dans votre application sur francetravail.io",
      },
      {
        key: "FRANCETRAVAIL_CLIENT_SECRET",
        label: "Client Secret",
        placeholder: "ex: 9876543210abcdef...",
        help: "Clé secrète associée à votre application",
      },
    ],
    extraNote:
      "💡 Cette clé activera également l'algorithme prédictif de « La Bonne Boîte » pour cibler les PME qui recrutent sans publier d'offres.",
  },
  "la-bonne-boite": {
    targetId: "france-travail",
    title: "Configuration La Bonne Boîte (France Travail)",
    description:
      "Détecte automatiquement les entreprises et PME du Pas-de-Calais ayant une forte probabilité d'embaucher.",
    docUrl: "https://francetravail.io/",
    docLabel: "Créer un accès gratuit sur francetravail.io",
    fields: [
      {
        key: "FRANCETRAVAIL_CLIENT_ID",
        label: "Client ID France Travail",
        placeholder: "ex: PAR_jobsearch_a1b2c3d4...",
      },
      {
        key: "FRANCETRAVAIL_CLIENT_SECRET",
        label: "Client Secret France Travail",
        placeholder: "ex: 9876543210abcdef...",
      },
    ],
    extraNote:
      "💡 La Bonne Boîte partage les mêmes identifiants officiels que l'API France Travail.",
  },
  jooble: {
    targetId: "jooble",
    title: "Configuration Jooble API",
    description:
      "Moteur d'indexation spécialisé dans le scraping des petits sites carrières de PME et TPE.",
    docUrl: "https://jooble.org/api/about",
    docLabel: "Obtenir une clé gratuite sur jooble.org",
    fields: [
      {
        key: "JOOBLE_API_KEY",
        label: "Clé API Jooble",
        placeholder: "ex: 00000000-0000-0000-0000-000000000000",
        help: "Clé envoyée immédiatement par email sur demande",
      },
    ],
    extraNote:
      "💡 Idéal pour dénicher les offres de cabinets locaux et PME régionales.",
  },
};

export function ApiConfigModal({ api, onClose, onSuccess }: ApiConfigModalProps) {
  const config = API_FIELDS[api.id] || {
    targetId: api.id,
    title: `Configuration ${api.name}`,
    description: api.description,
    docUrl: api.docUrl || "",
    docLabel: "Documentation officielle",
    fields: (api.envKeys || []).map((k) => ({
      key: k,
      label: k,
      placeholder: `Entrez votre ${k}`,
    })),
  };

  const [values, setValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/portals/configure-api", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.keys) {
          const init: Record<string, string> = {};
          for (const f of config.fields) {
            if (data.keys[f.key]) {
              init[f.key] = data.keys[f.key];
            }
          }
          setValues(init);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingInitial(false));
  }, [config.fields]);

  function handleChange(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
    setStatusMessage(null);
  }

  function toggleSecret(key: string) {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/portals/configure-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiId: config.targetId,
          keys: values,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setStatusMessage({
          type: "error",
          text: data.error || "Une erreur est survenue lors de l'enregistrement",
        });
        return;
      }

      if (data.verification) {
        if (data.verification.ok) {
          setStatusMessage({
            type: "success",
            text: data.verification.message || "Clés enregistrées et vérifiées avec succès !",
          });
          if (data.apis) onSuccess(data.apis);
          setTimeout(() => {
            onClose();
          }, 1400);
        } else {
          setStatusMessage({
            type: "error",
            text: `Enregistré dans .env mais avertissement : ${data.verification.message}`,
          });
          if (data.apis) onSuccess(data.apis);
        }
      } else {
        setStatusMessage({
          type: "success",
          text: "Configuration enregistrée avec succès !",
        });
        if (data.apis) onSuccess(data.apis);
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: err?.message || "Erreur de communication réseau",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl">
        {/* Bouton fermer */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-faint hover:bg-surface-hover hover:text-foreground transition-colors"
          aria-label="Fermer"
        >
          <X className="size-5" />
        </button>

        {/* En-tête */}
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
            <Key className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">{config.title}</h2>
            <p className="text-xs text-muted mt-0.5">{config.description}</p>
          </div>
        </div>

        {/* Notice d'obtention de la clé */}
        <div className="mt-4 rounded-xl border border-border bg-surface/50 p-3.5 text-xs text-muted">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-foreground">Obtention gratuite de vos identifiants :</span>
            {config.docUrl && (
              <a
                href={config.docUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-brand hover:underline font-medium"
              >
                <span>{config.docLabel}</span>
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>
          {config.extraNote && (
            <p className="mt-2 text-[11px] text-faint leading-relaxed border-t border-border/50 pt-2">
              {config.extraNote}
            </p>
          )}
        </div>

        {/* Message d'état */}
        {statusMessage && (
          <div
            className={cn(
              "mt-4 flex items-center gap-2 rounded-xl p-3 text-xs font-medium",
              statusMessage.type === "success" && "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
              statusMessage.type === "error" && "border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
              statusMessage.type === "info" && "border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400"
            )}
          >
            {statusMessage.type === "success" ? (
              <CheckCircle2 className="size-4 shrink-0" />
            ) : (
              <AlertCircle className="size-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          {loadingInitial ? (
            <div className="flex items-center justify-center py-8 text-xs text-faint gap-2">
              <Loader2 className="size-4 animate-spin" />
              <span>Chargement de la configuration…</span>
            </div>
          ) : (
            config.fields.map((field) => {
              const isSecret = field.key.includes("SECRET") || field.key.includes("KEY");
              const isVisible = showSecrets[field.key] || false;
              const val = values[field.key] || "";

              return (
                <div key={field.key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label htmlFor={field.key} className="text-xs font-medium text-foreground">
                      {field.label}
                    </label>
                    <code className="text-[10px] text-faint font-mono">{field.key}</code>
                  </div>

                  <div className="relative">
                    <input
                      id={field.key}
                      type={isSecret && !isVisible ? "password" : "text"}
                      value={val}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs font-mono text-foreground placeholder:text-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
                    />

                    {isSecret && (
                      <button
                        type="button"
                        onClick={() => toggleSecret(field.key)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint hover:text-foreground"
                      >
                        {isVisible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </button>
                    )}
                  </div>

                  {field.help && <p className="text-[11px] text-faint">{field.help}</p>}
                </div>
              );
            })
          )}

          <div className="mt-5 flex items-center justify-end gap-2.5 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-full px-4 py-2 text-xs font-medium text-muted hover:text-foreground transition-colors"
            >
              Annuler
            </button>

            <button
              type="submit"
              disabled={loading || loadingInitial}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-xs font-medium text-brand-foreground shadow-sm hover:bg-brand-200 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Enregistrement & vérification…</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="size-3.5" />
                  <span>Enregistrer & Activer</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
