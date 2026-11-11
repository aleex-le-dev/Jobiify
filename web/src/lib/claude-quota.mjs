/**
 * Quota réel du compte Claude (fenêtres 5 h et 7 jours), tel que le serveur
 * d'Anthropic le renvoie à chaque appel. `claude -p --output-format stream-json`
 * émet une ligne `{"type":"rate_limit_event","rate_limit_info":{...}}` dont
 * `unifiedWindows.<fenêtre>.utilization` (0–1) est le pourcentage consommé — le
 * même chiffre que la commande /usage de Claude Code.
 */

/**
 * @typedef {{ percent: number, resetsAt: number | null, status: string | null }} QuotaWindow
 * @typedef {{ fiveHour: QuotaWindow | null, sevenDay: QuotaWindow | null, status: string | null }} ClaudeQuota
 */

/** @returns {QuotaWindow | null} */
function readWindow(w) {
  if (!w || typeof w !== "object") return null;
  const u = Number(w.utilization);
  if (!Number.isFinite(u) || u < 0) return null;
  const reset = Number(w.resetsAt);
  return {
    percent: Math.round(u * 1000) / 10,
    resetsAt: Number.isFinite(reset) && reset > 0 ? reset * 1000 : null,
    status: typeof w.status === "string" ? w.status : null,
  };
}

/**
 * Extrait le quota d'une ligne stream-json. Renvoie null si la ligne n'en est
 * pas une ou ne contient aucune fenêtre exploitable.
 * @param {string} line
 * @returns {ClaudeQuota | null}
 */
export function parseRateLimitLine(line) {
  if (typeof line !== "string" || !line.includes('"rate_limit_event"')) return null;
  let d;
  try {
    d = JSON.parse(line);
  } catch {
    return null;
  }
  if (d?.type !== "rate_limit_event") return null;
  const info = d.rate_limit_info;
  if (!info || typeof info !== "object") return null;
  const wins = info.unifiedWindows && typeof info.unifiedWindows === "object" ? info.unifiedWindows : {};
  let fiveHour = readWindow(wins.five_hour);
  let sevenDay = readWindow(wins.seven_day);
  // Ancien format : une seule fenêtre, sans `unifiedWindows`.
  if (!fiveHour && !sevenDay && info.utilization !== undefined) {
    const w = readWindow(info);
    if (info.rateLimitType === "seven_day") sevenDay = w;
    else fiveHour = w;
  }
  if (!fiveHour && !sevenDay) return null;
  return { fiveHour, sevenDay, status: typeof info.status === "string" ? info.status : null };
}

/**
 * Parcourt une sortie stream-json complète et garde le dernier quota vu.
 * @param {string} text
 * @returns {ClaudeQuota | null}
 */
export function quotaFromStream(text) {
  let last = null;
  for (const line of String(text ?? "").split("\n")) {
    const q = parseRateLimitLine(line.trim());
    if (q) last = q;
  }
  return last;
}
