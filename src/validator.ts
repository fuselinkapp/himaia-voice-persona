import type {
  AgeGate,
  Scalar5,
  VoicePersona,
} from "./types.js";

// v0.2 validator. Enforces required fields, id pattern, scalar enum
// conformance, spec_version, and safety.age_gate.
//
// Deliberately not enforced (planned for v0.3 with the full operator
// algebra): overridable-field whitelist on scenes, wont_do ↔ safety
// category linking, merge-operator type checking ($append / $prepend /
// $replace / $remove / $unset). Fields we don't validate at parse time
// will surface at compile/runtime when the persona is actually used —
// acceptable for the v0.2 contract.

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
const ID_RE = /^[a-z0-9_-]+\/[a-z0-9_-]+$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(-[a-z0-9.-]+)?$/;
const LOCALE_RE = /^[a-z]{2,3}(-[A-Z]{2,4})?$/; // BCP-47 shape, not a full grammar

// Per-key enum table. Keys that name a scalar slot anywhere in the tree are
// validated by walkEnums, regardless of their depth. Narrower than a full
// field-path check but catches typos like "natrual" or "warmly" that would
// otherwise silently load.
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
// a valid value. Full field-path validation is deferred to v0.3; this
// catches typos ("natrual", "mild", "higher") that would otherwise load silently.
function walkEnums(v: unknown, path: string): void {
  if (v === null || typeof v !== "object") return;
  if (Array.isArray(v)) {
    v.forEach((item, i) => walkEnums(item, `${path}[${i}]`));
    return;
  }
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const child = `${path}.${k}`;
    const allowed = ENUM_BY_KEY[k];
    if (allowed) {
      if (typeof val !== "string") {
        // A numeric or object value at a scalar slot is a spec violation; v0.2
        // dropped numeric scalars specifically to prevent silent diffs.
        if (val !== undefined && (typeof val === "number" || typeof val === "boolean")) {
          throw new PersonaValidationError(
            `expected string (one of ${allowed.join(" | ")})`,
            child,
          );
        }
        // object case: scene overrides can nest further; recurse.
        walkEnums(val, child);
      } else {
        enumField(val, allowed, child);
      }
    } else {
      walkEnums(val, child);
    }
  }
}

export function validateVoicePersona(raw: unknown): VoicePersona {
  const obj = requireObject(raw, "$");

  if (obj.spec_version !== "0.2") {
    throw new PersonaValidationError(`expected spec_version "0.2"`, "$.spec_version");
  }

  const id = requireString(obj.id, "$.id");
  if (!ID_RE.test(id)) {
    throw new PersonaValidationError(
      `id must match ^[a-z0-9_-]+/[a-z0-9_-]+$`,
      "$.id",
    );
  }

  const version = requireString(obj.version, "$.version");
  if (!SEMVER_RE.test(version)) {
    throw new PersonaValidationError(`version must be semver`, "$.version");
  }

  requireString(obj.name, "$.name");
  const locale = requireString(obj.locale, "$.locale");
  if (!LOCALE_RE.test(locale)) {
    throw new PersonaValidationError(`locale must be BCP-47 shape`, "$.locale");
  }

  const identity = requireObject(obj.identity, "$.identity");
  requireString(identity.tagline, "$.identity.tagline");

  const safety = requireObject(obj.safety, "$.safety");
  enumField(safety.age_gate, AGE_GATES, "$.safety.age_gate");

  const author = requireObject(obj.author, "$.author");
  requireString(author.handle, "$.author.handle");

  requireString(obj.license, "$.license");

  // Enum sweep across the parsed tree.
  walkEnums(obj, "$");

  // We have validated enough to safely cast; the types module documents the
  // shape of everything we did not check at runtime.
  return obj as unknown as VoicePersona;
}
