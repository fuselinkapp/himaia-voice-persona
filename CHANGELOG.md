# Changelog

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

### Known gaps (planned for v0.3)

- Full operator algebra on scenes (`$prepend`, `$replace`, `$remove`,
  `$unset`) — currently only `$append` is recognized at parse time.
- Overridable-field whitelist enforcement.
- `wont_do` ↔ `safety` category cross-check.
- Inheritance (`extends`).
- Lorebook (`context_hooks`).
- A CCv2 → voice.persona importer (in active development).

### Versioning policy

`0.x` versions may break between minors. Pin in production. From `1.0`
onward: additive-only minors, unknown fields preserved on round-trip,
unknown `$operator` keys must error at parse time.
