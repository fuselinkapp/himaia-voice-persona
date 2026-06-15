import type {
  AgeGate,
  Author,
  SceneExample,
  VoicePersona,
} from "../types.js";

// Tavern Card v2 (CCv2) → voice.persona importer.
//
// CCv2 carries a character as free-form prose (description, personality,
// scenario) plus a few structured fields (name, greetings, mes_example).
// v0.2 voice.persona expects a structured shape (identity / pov / idiolect /
// voice / scenes / safety). The mapping is unavoidably lossy; this importer
// performs the pieces a deterministic structural mapping CAN do and surfaces
// what it dropped or defaulted via a `warnings` array. No LLM, no
// prose-to-prosody inference — those would require ground truth and are out of
// scope.
//
// Structural mappings (v0.2.1 additions marked *):
//   data.name          → name, id slug
//   data.personality   → identity.tagline (first sentence) + identity.description (remainder)
//   data.description   → identity.description (fallback if no personality)
//   data.creator       → author.handle
//   data.character_version → version *
//   data.tags          → extensions["chub.ai/tags"] + identity.archetype heuristic *
//   data.first_mes + data.alternate_greetings → greetings
//   data.mes_example   → examples (first user/char pair per <START> block)
//   data.creator_notes → extensions["chub.ai/creator_notes"]
//   data.extensions    → extensions["chub.ai/<key>"]
//
// What still lands in warnings[] (cannot be mapped without inference):
//   idiolect, voice, scenes (no structured source in CCv2 prose)
//   data.scenario (per-chat state, not per-character)
//   data.system_prompt, post_history_instructions (runtime concerns)
//   data.character_book (lorebook — preserved as extension in v0.3)
//
// CCv3 importer: TODO stub below.
//
// **Warning text is human-readable, not a public contract.** Tests should
// match on field names (substrings) rather than exact strings.
//
// Spec ref: https://github.com/malfoyslastname/character-card-spec-v2

export class ImporterError extends Error {}

export type ImportResult = {
  persona: VoicePersona;
  warnings: string[];
};

type CCv2Data = {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  creator_notes?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  alternate_greetings?: string[];
  tags?: string[];
  creator?: string;
  character_version?: string;
  extensions?: Record<string, unknown>;
  character_book?: unknown;
};

type CCv2Wrapper = {
  spec?: string;
  spec_version?: string;
  data?: CCv2Data;
};

const TAGLINE_FALLBACK = "Imported character — needs a tagline.";
const MAX_TAGLINE_CHARS = 100;

// Tags that map structurally to an identity.archetype value.
// Only unambiguous one-word functional roles are mapped; everything else stays
// in extensions so no information is silently dropped.
const TAG_TO_ARCHETYPE: Record<string, string> = {
  assistant: "assistant",
  companion: "companion",
  confidant: "confidant",
  guide: "guide",
  mentor: "mentor",
  narrator: "narrator",
  oracle: "oracle",
  teacher: "teacher",
  trickster: "trickster",
  villain: "villain",
};

// Tags that map to safety.age_gate values.
const TAG_TO_AGE_GATE: Record<string, AgeGate> = {
  nsfw: "18+",
  adult: "18+",
  "18+": "18+",
  sfw: "13+",
  "13+": "13+",
};

export function importTavernCard(input: object | string): ImportResult {
  const wrapper = parseInput(input);
  if (wrapper.spec !== "chara_card_v2") {
    throw new ImporterError(
      `unsupported spec: ${wrapper.spec ?? "(missing)"} — this importer accepts chara_card_v2`,
    );
  }
  if (wrapper.spec_version !== "2.0") {
    throw new ImporterError(
      `unsupported spec_version: ${wrapper.spec_version ?? "(missing)"} — expected 2.0`,
    );
  }
  if (!wrapper.data || typeof wrapper.data !== "object") {
    throw new ImporterError("CCv2 wrapper missing data block");
  }
  const data = wrapper.data;
  const warnings: string[] = [];

  if (!data.name || typeof data.name !== "string" || data.name.trim().length === 0) {
    throw new ImporterError("data.name is required");
  }
  const name = data.name.trim();
  const slug = slugify(name);
  if (!slug) {
    throw new ImporterError(`data.name "${name}" did not produce a usable slug`);
  }

  const description = strOrUndef(data.description);
  const personality = strOrUndef(data.personality);
  const { tagline, consumedLength } = deriveTagline(personality, description, warnings);
  const finalDescription = description ?? leftoverDescription(personality, consumedLength);

  const greetings = collectGreetings(data, warnings);
  const examples = parseMesExamples(data.mes_example, warnings);

  const author: Author = {
    handle: strOrUndef(data.creator) || "imported",
  };

  // --- Tag → structural field heuristics (deterministic; no LLM) ---
  // We scan tags for unambiguous archetype / age-gate signals. Everything else
  // stays in extensions so no information is silently dropped.
  let archetypeFromTag: string | undefined;
  let ageGateFromTag: AgeGate | undefined;
  const unmappedTags: string[] = [];

  if (Array.isArray(data.tags)) {
    for (const tag of data.tags) {
      if (typeof tag !== "string") continue;
      const normalised = tag.trim().toLowerCase();
      const archetype = TAG_TO_ARCHETYPE[normalised];
      const ageGate = TAG_TO_AGE_GATE[normalised];
      if (archetype && !archetypeFromTag) {
        archetypeFromTag = archetype;
      } else if (ageGate && !ageGateFromTag) {
        ageGateFromTag = ageGate;
      } else {
        unmappedTags.push(tag);
      }
    }
  }

  const extensions: Record<string, unknown> = {};
  if (data.creator_notes) extensions["chub.ai/creator_notes"] = data.creator_notes;
  // Only store unmapped tags; the mapped ones are structurally placed above.
  if (unmappedTags.length > 0) {
    extensions["chub.ai/tags"] = unmappedTags;
  }
  if (data.extensions && typeof data.extensions === "object") {
    for (const [k, v] of Object.entries(data.extensions)) {
      extensions[`chub.ai/${k}`] = v;
    }
    // depth_prompt is a SillyTavern runtime instruction that mutates the model
    // prompt at depth N. We preserve it for round-trip per the spec, but the
    // v0.2 runtime won't honor it — surface that loudly so an operator who
    // imports a card whose entire character lives in depth_prompt notices.
    const dp = (data.extensions as Record<string, unknown>)["depth_prompt"];
    if (dp && typeof dp === "object" && (dp as Record<string, unknown>)["prompt"]) {
      warnings.push(
        "review needed: extensions.depth_prompt was preserved as chub.ai/depth_prompt but is not honored by the v0.2 runtime — fold its content into identity.description",
      );
    }
  }

  // Surfaces dropped fields so the operator knows what won't survive.
  if (data.scenario) warnings.push("dropped: data.scenario (per-chat, not per-character in v0.2)");
  if (data.system_prompt) warnings.push("dropped: data.system_prompt (runtime concern, not part of persona spec)");
  if (data.post_history_instructions) {
    warnings.push("dropped: data.post_history_instructions (runtime concern)");
  }
  if (data.character_book) {
    warnings.push("dropped: data.character_book (lorebook — preserved as extension when v0.3 adds context_hooks)");
  }

  warnings.push(
    "review needed: idiolect, voice, scenes are empty — fill them in or this persona will sound generic",
  );

  const resolvedAgeGate: AgeGate = ageGateFromTag ?? "13+";

  const persona: VoicePersona = {
    spec_version: "0.2",
    id: `imported/${slug}`,
    version: strOrUndef(data.character_version) || "1.0.0",
    name,
    locale: "en-US",
    identity: {
      tagline,
      ...(finalDescription ? { description: finalDescription } : {}),
      ...(archetypeFromTag ? { archetype: archetypeFromTag } : {}),
    },
    safety: { age_gate: resolvedAgeGate },
    author,
    // SPDX "NOASSERTION" — the standard way to say "we don't know" rather
    // than coining a custom string that future SPDX-aware tooling will choke on.
    license: "NOASSERTION",
  };
  if (greetings.length > 0) persona.greetings = greetings;
  if (examples.length > 0) persona.examples = examples;
  if (Object.keys(extensions).length > 0) persona.extensions = extensions;

  return { persona, warnings };
}

// ---------- helpers ----------

function parseInput(input: object | string): CCv2Wrapper {
  if (typeof input === "string") {
    try {
      return JSON.parse(input) as CCv2Wrapper;
    } catch (err) {
      throw new ImporterError(`JSON parse failed: ${(err as Error).message}`);
    }
  }
  if (input == null || typeof input !== "object") {
    throw new ImporterError("expected an object or JSON string");
  }
  return input as CCv2Wrapper;
}

function strOrUndef(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Common abbreviations whose terminating period must NOT be treated as a
// sentence boundary. Conservative list — adding more rarely helps the
// common case ("Dr. Smith said hello.") and risks holding onto sentences
// past their actual end.
const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "st", "sr", "jr",
  "etc", "vs", "ie", "eg", "no",
]);

const MIN_SENTENCE_CHARS = 12;

// Returns the first sentence and the offset just past its terminator (or the
// whole string if no terminator). Skips abbreviation periods so "Dr. Smith
// said hello. He was tired." stops at "Dr. Smith said hello." not at "Dr."
function firstSentenceAt(s: string): { text: string; end: number } {
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    // Reject if too short — abbreviation-y heads like "Dr." (3 chars) hit here.
    const head = s.slice(0, i + 1);
    if (head.trim().length < MIN_SENTENCE_CHARS) continue;
    // Reject `.` immediately following a known abbreviation (case-insensitive).
    if (ch === ".") {
      const wordMatch = /([A-Za-z]+)$/.exec(s.slice(0, i));
      const word = wordMatch?.[1]?.toLowerCase();
      if (word && ABBREVIATIONS.has(word)) continue;
    }
    // Require a whitespace or end-of-string after the terminator.
    const next = s[i + 1];
    if (next !== undefined && !/\s/.test(next)) continue;
    return { text: head.trim(), end: i + 1 };
  }
  // No terminator: fall back to first line, then whole string.
  const firstLineEnd = s.indexOf("\n");
  if (firstLineEnd > 0) {
    return { text: s.slice(0, firstLineEnd).trim(), end: firstLineEnd + 1 };
  }
  return { text: s.trim(), end: s.length };
}

function deriveTagline(
  personality: string | undefined,
  description: string | undefined,
  warnings: string[],
): { tagline: string; consumedLength: number } {
  const source = personality ?? description;
  if (!source) {
    warnings.push("tagline: no personality or description; using fallback. Add one before publishing.");
    return { tagline: TAGLINE_FALLBACK, consumedLength: 0 };
  }
  const { text, end } = firstSentenceAt(source);
  if (text.length > MAX_TAGLINE_CHARS) {
    const truncated = text.slice(0, MAX_TAGLINE_CHARS - 1).trimEnd() + "…";
    warnings.push(`tagline: truncated to ${MAX_TAGLINE_CHARS} chars — review for awkward cuts`);
    return { tagline: truncated, consumedLength: end };
  }
  return { tagline: text, consumedLength: end };
}

// Returns whatever's left of `personality` after the consumed sentence —
// using slice(consumedLength) (NOT string-replace, which fails when the
// tagline was truncated and no longer appears verbatim in the source).
function leftoverDescription(
  personality: string | undefined,
  consumedLength: number,
): string | undefined {
  if (!personality) return undefined;
  const remainder = personality.slice(consumedLength).trim();
  return remainder.length > 0 ? remainder : undefined;
}

function collectGreetings(data: CCv2Data, warnings: string[]): string[] {
  const out: string[] = [];
  if (data.first_mes && typeof data.first_mes === "string" && data.first_mes.trim()) {
    out.push(data.first_mes.trim());
  }
  if (Array.isArray(data.alternate_greetings)) {
    for (const g of data.alternate_greetings) {
      if (typeof g === "string" && g.trim()) out.push(g.trim());
    }
  }
  if (out.length === 0) {
    warnings.push("greetings: none found — first_mes and alternate_greetings were empty");
  }
  return out;
}

// CCv2 mes_example format:
//   <START>
//   {{user}}: hello
//   {{char}}: *waves* hi
//   {{user}}: how are you
//   {{char}}: peachy
//   <START>
//   ...
// Each <START> block represents a separate example dialogue. We take the FIRST
// user→assistant turn pair from each block; multi-turn dialogue beyond that
// would need scenes/dialogue_act mapping a structural importer can't infer.
function parseMesExamples(raw: string | undefined, warnings: string[]): SceneExample[] {
  if (!raw || typeof raw !== "string") return [];
  // Split on <START> as a line (case-insensitive, trim surrounding whitespace).
  const blocks = raw
    .split(/^\s*<\s*START\s*>\s*$/im)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
  const out: SceneExample[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] ?? "";
    const userMatch = block.match(/\{\{user\}\}:\s*([\s\S]*?)(?=\n\s*\{\{char\}\}:|\n\s*\{\{user\}\}:|$)/i);
    const charMatch = block.match(/\{\{char\}\}:\s*([\s\S]*?)(?=\n\s*\{\{user\}\}:|\n\s*\{\{char\}\}:|$)/i);
    const userText = userMatch?.[1]?.trim();
    const charText = charMatch?.[1]?.trim();
    if (!userText || !charText) {
      warnings.push("examples: skipped a malformed <START> block (missing user or char turn)");
      continue;
    }
    out.push({
      scene: {},
      user: userText,
      assistant: charText,
    });
    // Surface multi-turn loss so an operator who painstakingly authored a
    // five-turn example dialogue sees that we kept only the first pair.
    const userTurns = (block.match(/\{\{user\}\}:/gi) ?? []).length;
    const charTurns = (block.match(/\{\{char\}\}:/gi) ?? []).length;
    if (userTurns > 1 || charTurns > 1) {
      warnings.push(
        `examples: <START> block ${i + 1} had ${userTurns} user / ${charTurns} char turns; only the first pair was kept`,
      );
    }
  }
  return out;
}

// ---------- CCv3 importer stub ----------
//
// TODO(v2): implement importTavernCardV3(input: object | string): ImportResult
//
// CCv3 (chara_card_v3) extends CCv2 with:
//   • data.assets[] — character image/icon/sound array
//   • data.group_only_greetings — group-chat-specific greetings
//   • data.nickname — display name separate from character name
//   • data.creation_date, data.modification_date — ISO timestamps
//   • data.source[] — provenance URIs
//   • data.character_book — embedded lorebook (same shape as CCv2)
//   • data.tags, data.creator, etc. — same as CCv2
//
// Structural mapping plan (deterministic, no LLM):
//   data.nickname          → identity.tagline prefix hint (or just identity.archetype)
//   data.assets[type=icon] → extensions["chara_card_v3/icon_url"]
//   data.source[]          → extensions["chara_card_v3/source"] (provenance array)
//   data.creation_date     → changelog[0].date (if no character_version)
//   group_only_greetings   → dropped (warn: "dropped: group_only_greetings — no group-chat concept in v0.2")
//   everything else        → same as CCv2 path above
//
// Blocker: no public CCv3 test fixtures in the repo yet — add fixtures to
// test/fixtures/ccv3/ before implementing so the test gate can cover it.
