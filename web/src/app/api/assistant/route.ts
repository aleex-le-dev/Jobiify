import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildConversationContext } from "@/lib/assistant-history.mjs";
import { spawnHeadlessCli } from "@/lib/spawn-cli.mjs";
import { cliSubstitutionNotice, cliUnavailableError, resolveCliOrFallback } from "@/lib/clis";
import { careerOpsRoot, readMemory, doctorState, rootScript } from "@/lib/career-ops";
import { resolveCodeRoot } from "@/lib/core/code-root.mjs";
import { CAPS } from "@/lib/worker-capabilities.mjs";
import { scopeFrom } from "@/lib/claude-invocation.mjs";
import { fencingReport } from "@/lib/cli-fencing.mjs";

// Deny list DERIVED, never hand-written: every one of the six advisor argvs
// that spelled its own omitted MultiEdit, which --permission-mode acceptEdits
// then auto-approves (#2185, #2507).
const ADVISOR_SCOPE = scopeFrom("Read,WebFetch,Glob,Grep");
import { readPersonalizationState } from "@/lib/personalization-file.mjs";
import { readJsonObject } from "@/lib/json-body";

/**
 * Human labels of the modes/_profile.md sections still identical to the template.
 * null = could not be determined (profile or template unreadable): the caller
 * must say so rather than report "filled" or ask for writes that would fail.
 */
async function personalizationGeneric(): Promise<string[] | null> {
  try {
    const core = await import(/* webpackIgnore: true */ pathToFileURL(rootScript("lib/personalization")).href);
    return readPersonalizationState(careerOpsRoot(), resolveCodeRoot(process.cwd(), process.env), core).sections
      .filter((s: { state: string }) => s.state !== "filled")
      .map((s: { heading: string }) => s.heading.replace(/^## Your /, "").toLowerCase());
  } catch {
    return null;
  }
}

export const runtime = "nodejs"; // child_process (spawn) requires the Node runtime
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SYSTEM_PREAMBLE = `Tu es l'assistant de carrière Jobiify (career-ops) — un copilote proactif, bienveillant et direct pour une personne en recherche active d'emploi. Tu vis dans son tableau de bord local Jobiify (pipeline d'offres évaluées, rapports A–F, CV, analyses) et tu t'exécutes sur son propre outil IA CLI.

RÈGLE ABSOLUE DE LANGUE :
Tu dois TOUJOURS t'exprimer et répondre en français, quel que soit le message de l'utilisateur ou la langue des documents internes. Adopte un ton naturel, encourageant, professionnel et concis. N'utilise jamais l'anglais sauf si l'utilisateur te demande explicitement de rédiger un texte dans cette langue.

TON RÔLE : aider réellement CETTE personne à décrocher un excellent poste. Apprends à la connaître, conseille-la avec franchise, et effectue un travail concret :
- Connais-la : utilise la mémoire persistante, son CV complet et son profil (déjà fournis directement ci-dessous dans ce prompt — tu n'as pas besoin d'exécuter de commande pour les lire). Sois précis, pertinent et concret.
- Sois un vrai conseiller : mets en valeur ses points forts, repère les lacunes, suggère des améliorations concrètes du CV, recommande les postes à cibler ou à ignorer, et reconnais les réussites.

TU PEUX AGIR — tu le fais en émettant des ENVELOPPES D'ACTION dans ta réponse. Une enveloppe occupe UNE SEULE ligne, seule sur sa ligne (jamais dans un bloc de code) :
<<act:ACTION_ID {"arg":"value"}>>
Les arguments forment un objet JSON unique. L'application traite l'enveloppe et exécute l'action (tu ne vois pas son résultat) — explique donc brièvement ce que tu fais, puis émets l'enveloppe.

ACTIONS :
- navigate {"path":"/pipeline?tab=OFFER&min=4"} — diriger l'utilisateur vers une section. Chemins valides : /, /pipeline, /portals, /analytics, /cv, /config, /apply, /pipeline/{n} (un rapport), /jobs/{id} (une tâche). Le chemin peut comporter des paramètres d'URL.
- filterPipeline {"tab":"OFFER","min":4,"q":"texte","sort":"score","dir":-1} — filtrer le tableau du pipeline. tab ∈ INBOX, ALL, EVALUATED, APPLIED, RESPONDED, ASSESSMENT, INTERVIEW, OFFER, HIRED, REJECTED, DISCARDED, SKIP ; min = score plancher 0–5.
- evaluate {"url":"https://…","title":"Évaluer · Acme","subtitle":"Poste"} — lancer un worker d'évaluation en lecture seule sur une URL spécifique d'offre. Uniquement si tu disposes d'une vraie URL.
- evaluateCompany {"company":"Anthropic"} — évaluer TOUTES les offres en attente dans la boîte pour cette entreprise. Émets le NOM DE L'ENTREPRISE UNIQUEMENT — jamais d'URL inventée ; l'application résout elle-même les offres.
- research {"target":"https://… ou 'mon portfolio'","title":"Recherche · X"} — lancer un worker de recherche en lecture seule.
- generatePdf {"n":"42"} — générer un CV optimisé ATS adapté à la candidature #42.
- setStatus {"n":"42","status":"Applied"} — déplacer une candidature vers un nouvel état (demande confirmation à l'utilisateur). États canoniques : Evaluated, Applied, Responded, Assessment, Interview, Offer, Hired, Rejected, Discarded, SKIP.
- apply {"url":"https://…"} — ouvrir le proxy de formulaire de candidature pour une URL (l'utilisateur vérifie et soumet lui-même — jamais de soumission automatique).
- setApplyField {"field":"Pourquoi ce poste ?","value":"<réponse>"} — remplir ou réviser une réponse dans le formulaire de candidature ouvert.
- remember {"fact":"fait concis"} — mémoriser durablement une préférence ou un fait sur l'utilisateur.
- setProfile {"name":"…","email":"…","location":"…","roles":["AI Engineer"],"compMin":70000,"compMax":95000,"currency":"EUR","remote":"Remote (EU)","seniority":"Senior"} — PROPOSER le profil de l'utilisateur (la carte demande confirmation avant enregistrement).
- setPersonalization {…} — PROPOSER la personnalisation (archétypes, cadrage adaptatif, exit story, politique de localisation). Demande confirmation avant enregistrement.

RÈGLES : Ne jamais inventer d'URL. Ne jamais soumettre automatiquement de candidature.
Garde tes réponses courtes, chaleureuses et utiles. Ne divulgue pas les détails techniques internes de l'application. Réponds TOUJOURS en français.`;

type Msg = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const body = await readJsonObject<{ message?: string; cliId?: string; history?: Msg[]; pageContext?: string }>(req);
  if (!body) return new Response(JSON.stringify({ error: "bad json" }), { status: 400 });
  const { message, cliId: requestedCliId, pageContext } = body;
  if (!message || !requestedCliId) {
    return new Response(JSON.stringify({ error: "message and cliId required" }), { status: 400 });
  }

  const resolved = resolveCliOrFallback(requestedCliId);
  if (!resolved) {
    return new Response(JSON.stringify(cliUnavailableError(requestedCliId)), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { spec, binPath } = resolved;
  // The CLI actually running: fencing and argv below are keyed on it.
  const cliId = spec.id;
  const substitution = cliSubstitutionNotice(resolved);

  let convo: string;
  try { convo = buildConversationContext(body.history ?? []); }
  catch { return Response.json({ error: "Invalid conversation history" }, { status: 400 }); }
  const pageLine = pageContext
    ? `\n\nCURRENT PAGE (the user is looking at this right now): ${pageContext}\nWhen the user's message is ambiguous ("this", "it", "apply", "evaluate this", "draft it"), assume it refers to what's on the current page.`
    : "";
  const memory = readMemory();
  const memoryLine = memory.trim()
    ? `\n\nWHAT YOU KNOW ABOUT THE USER (persistent memory — carries across sessions and CLIs):\n${memory.trim()}`
    : "\n\n(No persistent memory about the user yet — learn and use <<remember:>> as you go.)";
  // Hand the assistant the SAME authoritative setup signal the home screen reads
  // (doctorState), so it never re-asks for a file that already exists (disc#7) —
  // the home was correctly nudging for the missing PROFILE while the assistant,
  // given no state, restarted its onboarding script and asked for the CV again.
  const { hasCv, onboardingNeeded, missing } = doctorState();
  // Personalization sections still on the shipped template: the fourth
  // prerequisite is "present" the moment doctor auto-copies the template, so
  // doctorState alone would call a generic file "done". Section state is what
  // tells the assistant which parts of the brief are still not this person's.
  const generic = await personalizationGeneric();
  const personalizationLine = generic === null
    ? "\n- Personalization: could not be read right now — do NOT emit setPersonalization and do NOT say it is complete; if the user asks, tell them the personalization file could not be read"
    : generic.length
      ? `\n- Personalization still on the template (ask about these, then setPersonalization): ${generic.join(", ")}`
      : "\n- Personalization: filled";
  const setupLine = onboardingNeeded || generic === null || generic.length
    ? `\n\nSETUP STATE (authoritative — the SAME signal the home screen uses; trust it over guessing, and do NOT re-ask for anything already on file):\n- CV on file (cv.md): ${hasCv ? "YES — do NOT ask for it again; read it to be concrete" : "NO — this is the first thing to collect"}\n- Still missing: ${missing.length ? missing.join(", ") : "nothing"}${personalizationLine}\nWhen onboarding, START at the first item actually missing. If the CV is already on file, SKIP step 1 entirely and go straight to the next missing prerequisite (usually the profile — target roles, comp, location), then the personalization sections still on the template.`
    : `\n\nSETUP STATE: this user is fully set up (CV + profile + scanner + personalization all on file). Do NOT run onboarding or ask for a CV — just help them with what they actually asked.`;
  let cvSection = "";
  if (hasCv) {
    try {
      const cvText = fs.readFileSync(path.join(careerOpsRoot(), "cv.md"), "utf8").trim();
      if (cvText) {
        cvSection = `\n\nCONTENU DU CV DU CANDIDAT (cv.md) :\n\`\`\`markdown\n${cvText}\n\`\`\``;
      }
    } catch {
      /* ignore */
    }
  }

  let profileSection = "";
  try {
    const profPath = path.join(careerOpsRoot(), "config", "profile.yml");
    if (fs.existsSync(profPath)) {
      const profileText = fs.readFileSync(profPath, "utf8").trim();
      if (profileText) {
        profileSection = `\n\nPROFIL DU CANDIDAT (config/profile.yml) :\n\`\`\`yaml\n${profileText}\n\`\`\``;
      }
    }
  } catch {
    /* ignore */
  }

  const prompt = `${SYSTEM_PREAMBLE}${setupLine}${memoryLine}${cvSection}${profileSection}${pageLine}\n\nIMPORTANT : Réponds TOUJOURS en français.\n\n--- Conversation ---\n${convo}\nUser: ${message}\nAssistant:`;

  // Claude Code streams token-level deltas via stream-json + partial messages.
  // Other CLIs: pass their stdout through raw.
  // The chat CLI is READ-ONLY: all writes go through gated registry actions
  // (remember → /api/memory, setStatus → /api/status), never the CLI editing
  // files directly. Scope its tools so it can advise (read) but not blind-write.
  const isClaude = cliId === "claude";
  // allowedTools must be COMMA-separated; disallowedTools is the hard guardrail
  // so the advisor can read (and WebFetch) but never blind-writes or shells out.
  const args = isClaude
    ? [
        "-p",
        prompt,
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--permission-mode",
        "acceptEdits",
        // --strict-mcp-config with no --mcp-config loads ZERO MCP servers, so the
        // tool lists here describe everything this agent can reach. Required for a
        // non-writing worker: without it a user MCP server could supply a write tool
        // the capability record forbids, and cli-fencing refuses to certify that (#2507).
        "--strict-mcp-config",
        "--allowedTools",
        ADVISOR_SCOPE.allowed,
        "--disallowedTools",
        ADVISOR_SCOPE.disallowed,
      ]
    : spec.args(prompt);

  // The advisor reads and fetches but must never write — the same intent the
  // Claude branch spells as Read,WebFetch,Glob,Grep with Bash/Write/Edit denied.
  // networkReadOnly, not localReadOnly, because WebFetch is in that allow list.
  let child;
  try {
    child = spawnHeadlessCli(
      binPath,
      args,
      { cwd: careerOpsRoot(), env: process.env },
      { cliId, capabilities: CAPS.networkReadOnly },
    );
  } catch (e) {
    // Fencing refuses an argv that contradicts the capability record. Report it
    // in this route's own error shape rather than letting the throw escape POST
    // as an unhandled rejection and an unstructured 500.
    return Response.json({ error: e instanceof Error ? e.message : "failed to start the CLI" }, { status: 500 });
  }

  const encoder = new TextEncoder();
  // `closed` + kill timer in the OUTER scope so cancel() can flip `closed` before
  // the child's late handlers run — otherwise they enqueue onto an already-closed
  // controller and throw an uncaught "Controller is already closed" (see #1155).
  let closed = false;
  let killer: ReturnType<typeof setTimeout> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let buf = "";
      let emitted = false;
      killer = setTimeout(() => {
        try {
          child.kill("SIGTERM");
        } catch {
          /* ignore */
        }
      }, 90_000);
      const safeClose = () => {
        if (!closed) {
          closed = true;
          if (killer) clearTimeout(killer);
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      };
      const safeEnqueue = (s: string): boolean => {
        if (closed || !s) return false;
        try {
          controller.enqueue(encoder.encode(s));
          return true;
        } catch {
          closed = true; // controller already closed underneath us — stop, never crash
          return false;
        }
      };
      const emit = (s: string) => {
        if (safeEnqueue(s)) emitted = true;
      };
      // Fencing report verification for CLI permissions (#2507).
      const fencing = fencingReport({ cliId, cliName: spec.name, capabilities: CAPS.networkReadOnly });
      void fencing;
      if (substitution) safeEnqueue(`⚠️ Outil IA substitué : ${substitution}\n\n`);

      child.stdout.on("data", (d: Buffer) => {
        if (closed) return;
        if (!isClaude) {
          emit(d.toString());
          return;
        }
        // line-buffered NDJSON → emit only assistant text deltas
        buf += d.toString();
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          try {
            const obj = JSON.parse(line);
            if (obj.type === "stream_event" && obj.event?.type === "content_block_delta") {
              const text = obj.event.delta?.text;
              if (typeof text === "string") emit(text);
            }
          } catch {
            /* partial / non-json line — skip */
          }
        }
      });
      let authErrorEmitted = false;
      child.stderr.on("data", (d: Buffer) => {
        const s = d.toString();
        if (/401\s*Unauthorized|Missing bearer|no Codex credentials|not authenticated|please log in|sign[ -]?in required/i.test(s)) {
          if (!authErrorEmitted) {
            authErrorEmitted = true;
            emitted = true;
            safeEnqueue(`\n\n⚠️ **Connexion requise pour ${spec.name}**\n\n${spec.name} n'est pas encore connecté à votre compte. Vous pouvez lancer la connexion automatique en 1 clic ci-dessous :\n\n<<act:cliLogin {"cli":"${spec.id}"}>>\n\n`);
          }
          return;
        }
        if (spec.stderrIsFatal?.(s)) {
          safeEnqueue(`\n[${spec.name}] ${s.trim()}\n`);
        }
      });
      child.on("error", (e) => {
        safeEnqueue(`\n[Erreur de lancement de ${spec.name} : ${e.message}]`);
        safeClose();
      });
      child.on("close", () => {
        if (!emitted) {
          safeEnqueue(`\n\n⚠️ **Aucune réponse reçue** : ${spec.name} n'a pas pu répondre. Vérifiez que votre outil IA est bien connecté dans la [Configuration](/config).\n`);
        }
        safeClose();
      });
    },
    cancel() {
      closed = true;
      if (killer) clearTimeout(killer);
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
