import type {
  AgeGate,
  Scalar5,
  VoicePersona,
  WontDoCategory,
} from "./types.js";

// v0.2.1 validator — enforces required fields, id/semver/locale patterns,
// scalar enum conformance, spec_version, safety.age_gate, and ALL of:
//   • scene overridable-field whitelist (P1-2a)
//   • wont_do <-> safety category cross-check (P1-2b)
//   • full merge-operator algebra: $append/$prepend/$replace/$remove/$unset (P1-2c)
//   • delivery_cues bounds (P1-1)
//   • per-scene direction bounds (P1-1)
//   • extends field shape (P2-4)

export class PersonaValidationError extends Error {
  constructor(message: string, public path: string) {
    super(`${path}: ${message}`);
    this.name = "PersonaValidationError";
  }
}

const SCALAR_5: readonly Scalar5[] = ["none", "low", "mid", "high", "max"];
const AGE_GATES: readonly AgeGate[] = ["none", "13+", "18+"];
const ROMANTIC_LEVELS = ["none", "warm_not_sexual", "romantic", "explicit"] as const;
const DISFLUENCY_VALUES = ["none", "sparing", "natural"] as const;
const SENTENCE_LENGTH_VALUES = ["short", "medium", "long", "varied"] as const;
const WONT_DO_CATEGORIES: readonly WontDoCategory[] = [
  "tone", "romantic", "violence", "politics", "self_harm", "medical", "other",
];
const ID_RE = /^[a-z0-9_-]+\/[a-z0-9_-]+$/;
const EXTENDS_RE = /^[a-z0-9_-]+\/[a-z0-9_-]+(@\d+\.\d+\.\d+(-[a-z0-9.-]+)?)?$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(-[a-z0-9.-]+)?$/;
const LOCALE_RE = /^[a-z]{2,3}(-[A-Z]{2,4})?$/; // BCP-47 shape, not a full grammar

// Per-key enum table. Keys that name a scalar slot anywhere in the tree are
// validated by walkEnums, regardless of their depth.
const ENUM_BY_KEY: Record<string, readonly string[]> = {
  warmth: SCALAR_5,
  formality: SCALAR_5,
  humor: SCALAR_5,
  directness: SCALAR_5,
  vulgarity: SCALAR_5,
  floor: SCALAR_5,
  ceiling: SCALAR_5,
  disfluency: DISFLUENCY_VALUES,
  sentence_length: SENTENCE_LENGTH_VALUES,
  romantic: ROMANTIC_LEVELS,
};

// ---- Overridable-field whitelist (P1-2a) ------------------------------------
// Fields allowed inside scenes.format.<x> and scenes.dialogue_act.<y>.
// identity.*, pov.*, safety.*, locale, voice.timbre.*, voice.preferred_id,
// pronunciation_overrides, extensions are NOT overridable.
const FORMAT_WHITELIST = new Set([
  "prosody", "idiolect", "dialogue_act_default", "greetings",
  "fidelity_default", "direction", // direction added in v0.2.1
]);
const DIALOGUE_ACT_WHITELIST = new Set([
  "prosody", "idiolect", "fidelity_default", "direction", // direction added in v0.2.1
]);

// Known merge operators. Unknown operators MUST error (spec §Merge operator algebra).
const MERGE_OPERATORS = new Set(["$append", "$prepend", "$replace", "$remove", "$unset"]);

// ---- wont_do <-> safety category cross-check (P1-2b) -----------------------
// Maps wont_do.category values to the safety field that enforces the floor.
// "Persona tightens, safety floors." — if wont_do declares a category that has
// a matching safety field, the safety field must be set (not absent).
const WONT_DO_SAFETY_MAP: Partial<Record<WontDoCategory, string>> = {
  romantic: "romantic",
  self_harm: "self_harm_policy",
  politics: "political_stance",
};

// ---- helpers ----------------------------------------------------------------

function requireObject(v: unknown, path: string): Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    throw new PersonaValidationError("expected object", path);
  }
  return v as Record<string, unknown>;
}

function requireString(v: unknown, path: string): string {
  if (typeof v !== "string" || v.length === 0) {
    throw new PersonaValidationError("expected non-empty string", path);
  }
  return v;
}

function enumField<T extends string>(
  v: unknown,
  allowed: readonly T[],
  path: string,
): T {
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) {
    throw new PersonaValidationError(
      `expected one of ${allowed.join(" | ")}`,
      path,
    );
  }
  return v as T;
}

// Walk the subtree and confirm every leaf that names an enumerated slot uses
// a valid value. Also checks that any $-prefixed key is a known merge operator
// (P1-2c).
function walkEnums(v: unknown, path: string): void {
  if (v === null || typeof v !== "object") return;
  if (Array.isArray(v)) {
    v.forEach((item, i) => walkEnums(item, `${path}[${i}]`));
    return;
  }
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const child = `${path}.${k}`;

    // P1-2c: unknown $operator keys MUST error
    if (k.startsWith("$") && !MERGE_OPERATORS.has(k)) {
      throw new PersonaValidationError(
        `unknown merge operator "${k}" — allowed: ${[...MERGE_OPERATORS].join(", ")}`,
        child,
      );
    }

    const allowed = ENUM_BY_KEY[k];
    if (allowed) {
      if (typeof val !== "string") {
        if (val !== undefined && (typeof val === "number" || typeof val === "boolean")) {
          throw new PersonaValidationError(
            `expected string (one of ${allowed.join(" | ")})`,
            child,
          );
        }
        walkEnums(val, child);
      } else {
        enumField(val, allowed, child);
      }
    } else {
      walkEnums(val, child);
    }
  }
}

// Validate that a merge-operator object's operator values are arrays (for array
// operators) or `true` (for $unset). Called when a field value is an object
// that contains $-keys.
function validateMergeOpObject(
  obj: Record<string, unknown>,
  path: string,
  expectedArrayItems: "string" | "any" = "string",
): void {
  const keys = Object.keys(obj);
  const opKeys = keys.filter((k) => k.startsWith("$"));
  const plainKeys = keys.filter((k) => !k.startsWith("$"));

  // A merge-op object may not mix operator keys with plain field keys
  if (opKeys.length > 0 && plainKeys.length > 0) {
    throw new PersonaValidationError(
      `merge-operator object must not mix $operators with plain keys (found: ${plainKeys.join(", ")})`,
      path,
    );
  }

  for (const op of opKeys) {
    if (!MERGE_OPERATORS.has(op)) {
      throw new PersonaValidationError(
        `unknown merge operator "${op}" — allowed: ${[...MERGE_OPERATORS].join(", ")}`,
        `${path}.${op}`,
      );
    }
    const opVal = obj[op];
    if (op === "$unset") {
      if (opVal !== true) {
        throw new PersonaValidationError(`$unset value must be literal true`, `${path}.${op}`);
      }
    } else {
      // $append, $prepend, $replace, $remove — value must be an array
      if (!Array.isArray(opVal)) {
        throw new PersonaValidationError(
          `${op} value must be an array`,
          `${path}.${op}`,
        );
      }
      if (expectedArrayItems === "string") {
        (opVal as unknown[]).forEach((item, i) => {
          if (typeof item !== "string") {
            throw new PersonaValidationError(
              `${op} array items must be strings`,
              `${path}.${op}[${i}]`,
            );
          }
        });
      }
    }
  }
}

// Validate delivery_cues: max 12 entries, each <= 24 chars (P1-1)
function validateDeliveryCues(raw: unknown, path: string): void {
  if (raw === undefined) return;
  if (!Array.isArray(raw)) {
    throw new PersonaValidationError("delivery_cues must be an array", path);
  }
  if (raw.length > 12) {
    throw new PersonaValidationError(
      `delivery_cues may have at most 12 entries (found ${raw.length})`,
      path,
    );
  }
  raw.forEach((entry, i) => {
    if (typeof entry !== "string") {
      throw new PersonaValidationError("delivery_cues entries must be strings", `${path}[${i}]`);
    }
    if (entry.length > 24) {
      throw new PersonaValidationError(
        `delivery_cues entry must be <= 24 chars (found ${entry.length})`,
        `${path}[${i}]`,
      );
    }
  });
}

// Validate a scene direction field (P1-1): optional string <= 200 chars.
function validateDirection(raw: unknown, path: string): void {
  if (raw === undefined) return;
  if (typeof raw !== "string") {
    throw new PersonaValidationError("direction must be a string", path);
  }
  if (raw.length > 200) {
    throw new PersonaValidationError(
      `direction must be <= 200 chars (found ${raw.length})`,
      path,
    );
  }
}

// Validate a scenes.format entry (P1-2a whitelist).
function validateFormatOverride(raw: unknown, path: string): void {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return;
  const obj = raw as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    if (!FORMAT_WHITELIST.has(k)) {
      throw new PersonaValidationError(
        `"${k}" is not overridable per scene — non-overridable fields include identity, pov, safety, locale, voice.timbre, voice.preferred_id`,
        `${path}.${k}`,
      );
    }
  }
  // direction bounds
  validateDirection(obj["direction"], `${path}.direction`);
  // idiolect merge ops
  if (obj["idiolect"] !== undefined) {
    validateIdiolectMergeOps(obj["idiolect"], `${path}.idiolect`);
  }
  // greetings merge ops (append-only)
  if (obj["greetings"] !== undefined) {
    validateGreetingsMerge(obj["greetings"], `${path}.greetings`);
  }
}

// Validate a scenes.dialogue_act entry (P1-2a whitelist).
function validateDialogueActOverride(raw: unknown, path: string): void {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return;
  const obj = raw as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    if (!DIALOGUE_ACT_WHITELIST.has(k)) {
      throw new PersonaValidationError(
        `"${k}" is not overridable per dialogue_act — non-overridable fields include identity, pov, safety, locale, voice.timbre, voice.preferred_id`,
        `${path}.${k}`,
      );
    }
  }
  // direction bounds
  validateDirection(obj["direction"], `${path}.direction`);
  // idiolect merge ops
  if (obj["idiolect"] !== undefined) {
    validateIdiolectMergeOps(obj["idiolect"], `${path}.idiolect`);
  }
}

// Validate merge operators on idiolect overrides.
function validateIdiolectMergeOps(raw: unknown, path: string): void {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return;
  const obj = raw as Record<string, unknown>;
  for (const [k, val] of Object.entries(obj)) {
    if (k === "signatures" || k === "banned_phrases") {
      if (val !== undefined && !Array.isArray(val) && typeof val === "object" && val !== null) {
        validateMergeOpObject(val as Record<string, unknown>, `${path}.${k}`);
      }
      // plain array is also fine
    }
    // Other idiolect fields are plain scalars — enum sweep handles them
  }
}

// Greetings in format overrides may use append-only merge.
function validateGreetingsMerge(raw: unknown, path: string): void {
  if (Array.isArray(raw)) return; // plain array replacement — ok
  if (raw !== null && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const ops = Object.keys(obj).filter((k) => k.startsWith("$"));
    const nonOps = Object.keys(obj).filter((k) => !k.startsWith("$"));
    if (nonOps.length > 0) {
      throw new PersonaValidationError(
        `greetings override must be a plain array or a merge-operator object`,
        path,
      );
    }
    for (const op of ops) {
      if (op !== "$append") {
        throw new PersonaValidationError(
          `greetings only supports $append in scene overrides (found "${op}")`,
          `${path}.${op}`,
        );
      }
      if (!Array.isArray(obj[op])) {
        throw new PersonaValidationError(`$append value must be an array`, `${path}.${op}`);
      }
    }
    return;
  }
  throw new PersonaValidationError(
    "greetings must be an array or merge-operator object",
    path,
  );
}

// wont_do <-> safety category cross-check (P1-2b).
// For each wont_do entry whose category maps to a safety field, that safety
// field must be present (non-absent). We do NOT enforce direction of tightening
// here (too semantic for a structural validator) — the publish-time linter owns
// that. But we DO surface missing fields that would mean a declared wont_do has
// no matching safety floor at all.
function validateWontDoSafetyAlignment(
  wontDo: unknown[],
  safety: Record<string, unknown>,
  path: string,
): void {
  for (let i = 0; i < wontDo.length; i++) {
    const entry = wontDo[i];
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const category = e["category"] as WontDoCategory | undefined;
    if (!category) continue;
    const safetyField = WONT_DO_SAFETY_MAP[category];
    if (safetyField && safety[safetyField] === undefined) {
      throw new PersonaValidationError(
        `wont_do[${i}].category "${category}" requires safety.${safetyField} to be set — persona tightens, safety floors`,
        `${path}[${i}]`,
      );
    }
  }
}

// ---- main validator ---------------------------------------------------------

export function validateVoicePersona(raw: unknown): VoicePersona {
  const obj = requireObject(raw, "$");

  if (obj["spec_version"] !== "0.2") {
    throw new PersonaValidationError(`expected spec_version "0.2"`, "$.spec_version");
  }

  const id = requireString(obj["id"], "$.id");
  if (!ID_RE.test(id)) {
    throw new PersonaValidationError(
      `id must match ^[a-z0-9_-]+/[a-z0-9_-]+$`,
      "$.id",
    );
  }

  const version = requireString(obj["version"], "$.version");
  if (!SEMVER_RE.test(version)) {
    throw new PersonaValidationError(`version must be semver`, "$.version");
  }

  requireString(obj["name"], "$.name");
  const locale = requireString(obj["locale"], "$.locale");
  if (!LOCALE_RE.test(locale)) {
    throw new PersonaValidationError(`locale must be BCP-47 shape`, "$.locale");
  }

  // P2-4: extends field shape validation
  if (obj["extends"] !== undefined) {
    const ext = obj["extends"];
    if (typeof ext !== "string" || !EXTENDS_RE.test(ext)) {
      throw new PersonaValidationError(
        `extends must be a string matching "<author>/<slug>" or "<author>/<slug>@<semver>"`,
        "$.extends",
      );
    }
    // Guard against trivial self-reference (same base id)
    const extBase = ext.includes("@") ? ext.slice(0, ext.indexOf("@")) : ext;
    if (extBase === id) {
      throw new PersonaValidationError(
        `extends must not reference the persona's own id (cycle)`,
        "$.extends",
      );
    }
  }

  const identity = requireObject(obj["identity"], "$.identity");
  requireString(identity["tagline"], "$.identity.tagline");

  const safety = requireObject(obj["safety"], "$.safety");
  enumField(safety["age_gate"], AGE_GATES, "$.safety.age_gate");

  // P1-2b: wont_do <-> safety cross-check
  const pov = obj["pov"];
  if (pov !== undefined && pov !== null && typeof pov === "object" && !Array.isArray(pov)) {
    const povObj = pov as Record<string, unknown>;
    const wontDo = povObj["wont_do"];
    if (Array.isArray(wontDo)) {
      // Validate each wont_do entry has a valid category
      for (let i = 0; i < wontDo.length; i++) {
        const entry = wontDo[i];
        if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
        const e = entry as Record<string, unknown>;
        if (e["category"] !== undefined) {
          enumField(e["category"], WONT_DO_CATEGORIES, `$.pov.wont_do[${i}].category`);
        }
      }
      validateWontDoSafetyAlignment(wontDo, safety, "$.pov.wont_do");
    }
  }

  // P1-1: voice.delivery_cues bounds
  const voice = obj["voice"];
  if (voice !== undefined && voice !== null && typeof voice === "object" && !Array.isArray(voice)) {
    const voiceObj = voice as Record<string, unknown>;
    validateDeliveryCues(voiceObj["delivery_cues"], "$.voice.delivery_cues");
  }

  // P1-2a: scene overridable-field whitelist
  const scenes = obj["scenes"];
  if (scenes !== undefined && scenes !== null && typeof scenes === "object" && !Array.isArray(scenes)) {
    const scenesObj = scenes as Record<string, unknown>;

    const formatMap = scenesObj["format"];
    if (formatMap !== undefined && formatMap !== null && typeof formatMap === "object" && !Array.isArray(formatMap)) {
      for (const [fmtKey, fmtVal] of Object.entries(formatMap as Record<string, unknown>)) {
        validateFormatOverride(fmtVal, `$.scenes.format.${fmtKey}`);
      }
    }

    const dialogueActMap = scenesObj["dialogue_act"];
    if (dialogueActMap !== undefined && dialogueActMap !== null && typeof dialogueActMap === "object" && !Array.isArray(dialogueActMap)) {
      for (const [daKey, daVal] of Object.entries(dialogueActMap as Record<string, unknown>)) {
        validateDialogueActOverride(daVal, `$.scenes.dialogue_act.${daKey}`);
      }
    }
  }

  const author = requireObject(obj["author"], "$.author");
  requireString(author["handle"], "$.author.handle");

  requireString(obj["license"], "$.license");

  // Enum sweep across the parsed tree — catches any remaining typos.
  walkEnums(obj, "$");

  // We have validated enough to safely cast; the types module documents the
  // shape of everything we did not check at runtime.
  return obj as unknown as VoicePersona;
}
