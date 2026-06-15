# Changelog

## 0.2.1 — expressive direction + validator hardening (additive; backward-compatible)

### Spec (v0.2.1)

- **`voice.delivery_cues`** (optional) — persona-level array of short paralinguistic
  cues (max 12, each <= 24 chars). Compiler renders as:
  `"Delivery cues you may use in [brackets]: <comma list>"`.
- **`direction`** (optional, per-scene) — free-text delivery note (<=200 chars)
  added to both `scenes.format.<x>` and `scenes.dialogue_act.<y>`.
  Added to the overridable-field whitelist. Compiler renders as:
  `"Delivery for this scene: <direction>"`.
- **`extends`** (optional, top-level) — declares inheritance from a named base
  persona (`"<author/slug>"` or `"<author/slug>@<semver>"`). Shape validated by
  the spec package; cross-file resolution is the API loader's concern.

### Reference implementation

- **Validator now enforces (P1-2):**
  - Scene overridable-field whitelist — rejects `identity`, `pov`, `safety`,
    `locale`, `voice.timbre`, `voice.preferred_id`, `pronunciation_overrides`,
    `extensions` inside scene entries.
  - `wont_do` ↔ `safety` category cross-check — if a `wont_do` entry carries
    a category that maps to a `safety.*` field, that safety field must be set.
  - Full merge-operator algebra — `$append`, `$prepend`, `$replace`, `$remove`,
    `$unset` all accepted and validated; unknown `$operator` keys error at
    parse time.
- **Validator bounds-checks** `delivery_cues` (max 12 / <=24 chars each) and
  `direction` (<=200 chars).
- **`extends` field shape** validated (`^[a-z0-9_-]+/[a-z0-9_-]+(@semver)?$`).
- **Linter CLI** — new `voice-persona lint <file>` command (bin: `voice-persona`).
  Parses + validates .persona.yaml / .persona.json, prints path-tagged errors,
  exits 1 on failure.

### Importers

- **CCv2 importer** — two new structural mappings (no LLM, deterministic):
  - `data.tags` containing known archetype strings (`companion`, `narrator`,
    `oracle`, etc.) → `identity.archetype`.
  - `data.tags` containing `nsfw` / `adult` / `18+` / `sfw` → `safety.age_gate`.
  - Unmapped tags still land in `extensions["chub.ai/tags"]`.
- **CCv3 importer** — documented TODO stub in `src/importers/tavern.ts`.

### Starters

- `examples/starters/warm_confidant.persona.yaml` updated with `voice.delivery_cues`
  and per-scene `direction` as a tasteful authoring reference.

---

## 0.2.0 — initial public release

First public release of the spec and the reference parser.

### Spec
- `voice.persona` v0.2 (see `SPEC.md`).
- `pov.wont_do` entries carry a `category` for safety-floor cross-checks.
- 5-point scalar enums (`none / low / mid / high / max`) — numeric values
  rejected, no silent diffs.
- `dialogue_act` field replaces v0.1's `move`. Vocabulary aligned with
  ISO 24617-2.
- `extensions` reverse-DNS-namespaced escape hatch; unknown namespaces are
  preserved on round-trip.

### Reference implementation
- `parseVoicePersona(text, opts?)` — pure function, no file I/O, accepts
  YAML or JSON, auto-detects format.
- `validateVoicePersona(raw)` — pure validator. Catches: missing required
  fields, malformed `id` pattern, invalid `spec_version`, unknown scalar
  enum values (including the spec's narrower ones — `disfluency`,
  `sentence_length`, `safety.romantic`).
- `PersonaValidationError` — thrown with path-prefixed messages.

### Examples
- 8 starter personas under `examples/starters/`: warm_confidant,
  skeptical_buyer, sarcastic_narrator, anxious_npc, measured_diplomat,
  tender_parent, dry_butler, manic_sports_caster.

### Importers
- `importTavernCard(input)` — Tavern Card v2 (CCv2) → voice.persona,
  structural mapping only (no LLM). Returns `{ persona, warnings }` so
  the lossy fields (idiolect, voice, scenes) are visible to the operator.
  See README "Importing from Tavern Card v2" for the mapping table.

### Known gaps (planned for v0.3)

- Full operator algebra on scenes (`$prepend`, `$replace`, `$remove`,
  `$unset`) — currently only `$append` is recognized at parse time.
- Overridable-field whitelist enforcement.
- `wont_do` ↔ `safety` category cross-check.
- Inheritance (`extends`).
- Lorebook (`context_hooks`) — and CCv2 importer round-trip preservation
  of `character_book`.
- CCv3 importer.

### Versioning policy

`0.x` versions may break between minors. Pin in production. From `1.0`
onward: additive-only minors, unknown fields preserved on round-trip,
unknown `$operator` keys must error at parse time.
