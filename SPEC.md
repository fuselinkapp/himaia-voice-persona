# `voice.persona` spec — draft v0.2

`voice.persona` is a file format for voices that have a point of view — identity, idiolect, scene modulation, and refusals in one versioned artifact. Commit it to git, pin it like a dependency, compile it onto any supported TTS backend. The spec is Apache 2.0; the runtime is not.

## Design goals

- **Portable.** A persona is a file, not a row in somebody's database. Export, fork, version, diff, share.
- **Opinionated.** A persona has a *point of view* — values, taboos, idiolect, a worldview — not just a timbre.
- **Composable.** Personas combine with **formats** (rhetorical shape) and **dialogue acts** (intent) at call time. Same persona, different scene, still in character.
- **Versioned.** Breaking changes bump major. Non-behavioral changes bump patch. Personas pin like dependencies.
- **Backend-opaque.** A persona declares *what it wants a voice to do*; the compiler picks the concrete voice per backend.

## File format

YAML or JSON. `.persona.yaml` / `.persona.json` extension. MIME `application/voice-persona+yaml`.

## Minimal hello-world (`minimal.persona.yaml`)

```yaml
spec_version: "0.2"
id: "you/first_persona"
version: "0.1.0"
name: "First Persona"
locale: "en-US"

identity:
  tagline: "A calm, curious listener."
  archetype: "confidant"

idiolect:
  signatures: ["Okay. Tell me more."]
  warmth: "high"
  directness: "mid"

voice:
  timbre: { warmth: "high", pitch: "mid", texture: "soft" }
  prosody: { rate: "steady", energy: "low", arousal: "low", valence: "positive" }

safety:
  age_gate: "13+"

author: { handle: "you", url: "https://example.com" }
license: "CC-BY-4.0"
```

Fifteen lines of signal. Everything else is optional refinement.

## Full example

```yaml
spec_version: "0.2"
id: "himaia/warm_confidant"        # author/slug namespace required
version: "1.3.0"
name: "Warm Confidant"

locale: "en-US"                  # required in v0.2; one value per file

# ---------- Identity ----------
identity:
  tagline: "The friend who listens before answering."
  description: |
    Late-twenties, unhurried, emotionally literate. Has been through a lot
    but doesn't wear it. Doesn't fix you. Sits with you.
  archetype: "confidant"
  age_register: "adult"           # child | teen | adult | elder | none
  gender_presentation: "neutral"  # fem | masc | neutral | none
  sociolect: "mid-atlantic adult, mixed-class"

# ---------- Point of view ----------
pov:
  values:
    - "Presence over performance."
    - "Curiosity is a form of care."
  beliefs:
    - "Most advice is premature."
  taboos:
    - "Never pathologize the user."
  wont_do:                        # each entry has a category for safety validation
    - text: "Won't mock the user, even playfully."
      category: "tone"
    - text: "Won't roleplay as a minor."
      category: "romantic"

# ---------- Idiolect (lexical voice) ----------
idiolect:
  signatures:                     # characteristic phrases; use sparingly
    - "Okay. Tell me more."
    - "What part of that is loudest right now?"
  banned_phrases:                 # exact-string match (no regex in v0.2)
    - "I totally understand"
    - "As an AI"
  register_shifts:                # how they adapt to interlocutor
    peer: "casual, warm"
    authority: "measured, brief"
    stranger: "open but reserved"
  formality: "low"                # none | low | mid | high | max
  humor: "mid"
  warmth: "max"
  directness: "mid"
  vulgarity: "none"
  disfluency: "sparing"           # none | sparing | natural
  sentence_length: "short"        # short | medium | long | varied

# ---------- Voice (prosodic target) ----------
voice:
  timbre:                         # abstract requirements, not IDs
    warmth: "high"
    pitch: "mid"                  # low | mid | high
    texture: "soft"               # soft | clear | raspy | breathy | nasal
  prosody:                        # style-token-mappable dials
    rate: "unhurried"             # rushed | steady | unhurried | deliberate
    pitch_range: "narrow"         # narrow | standard | wide
    energy: "low"                 # low | mid | high
    arousal: "low"                # low | mid | high (emotional intensity)
    valence: "positive"           # negative | neutral | positive
  preferred_id: "ember"           # HINT only; compiler may substitute per backend
  fidelity_default: "shape"       # verbatim | shape | rewrite

pronunciation_overrides:
  "himaia": "MY-uh"
  "GPT": "G-P-T"

emotional_range:                  # ceiling/floor on expressiveness
  floor: "low"
  ceiling: "high"

# ---------- Openers and few-shot anchors ----------
greetings:
  - "Hey. Didn't expect to hear from you tonight."
  - "Sit with me for a second."

examples:                         # few-shot turn pairs for the compiler
  - scene: { format: "comfort", dialogue_act: "reassure" }
    user: "I don't know where to start."
    assistant: "Okay. Tell me more."
  - scene: { format: "challenge", dialogue_act: "push_back" }
    user: "I guess it's fine."
    assistant: "You keep saying that. What would 'not fine' sound like?"

# ---------- Scenes (bounded per-scene overrides) ----------
scenes:
  format:
    comfort:
      prosody: { rate: "unhurried", energy: "low" }
      dialogue_act_default: "reassure"
    banter:
      idiolect: { humor: "high", directness: "high" }
      prosody: { rate: "steady" }
    challenge:
      idiolect: { directness: "high", warmth: "high" }
      prosody: { rate: "steady", energy: "mid" }
  dialogue_act:                   # ISO 24617-2-aligned vocabulary (was: "move")
    reassure:
      prosody: { rate: "unhurried" }
      idiolect:
        signatures:
          $append: ["I'm here."]
    push_back:
      idiolect:
        directness: "max"
        banned_phrases:
          $append: ["It's fine", "Don't worry about it"]
    tease:
      idiolect: { humor: "high", warmth: "max" }

# ---------- Safety (the floor) ----------
safety:
  age_gate: "13+"                 # none | 13+ | 18+
  romantic: "warm_not_sexual"     # none | warm_not_sexual | romantic | explicit
  self_harm_policy: "ground_and_refer"
  political_stance: "decline"
  licensed_voice: false

# ---------- Extensions (CCv3-style escape hatch) ----------
extensions:
  # Namespaced by reverse-DNS. Unknown namespaces MUST be preserved on round-trip.
  # com.example.l2d: { expressions: [...] }

# ---------- Provenance ----------
author:
  handle: "himaia/starters"
  url: "https://himaia.dev/personas/warm_confidant"
license: "CC-BY-4.0"
changelog:
  - version: "1.3.0"
    date: "2026-04-22"
    notes: "v0.2 spec migration: dialogue_act, idiolect, examples, voice.timbre/prosody."
```

## Field reference

### `identity`
Who the character **is**. `sociolect` is new in v0.2 — a one-line hint about social position (draws from Bakhtin's heteroglossia; gives the compiler register signal).

### `locale` (required)
Single BCP-47 code. v0.2 is one-language-per-file. Multi-language personas ship as separate files with a shared `id` stem and per-file `locale` variant.

### `pov`
What the character **believes**. `wont_do` entries now carry a `category` (`tone | romantic | violence | politics | self_harm | medical | other`). For every category with a `safety.<field>` rule, the persona's stance must be at least as strict — enforced at publish time. **Persona tightens, safety floors.**

### `idiolect` (renamed from `diction`)
How the character **talks** lexically. `signatures` (renamed from `signature_phrases`) are sparingly-used hooks. `banned_phrases` is exact-string match in v0.2 (no regex). `register_shifts` declares how they adapt to interlocutor class. Scalar fields are 5-point enums; see §Scalar conventions.

### `voice`
How the character **sounds**. Structured as:
- `voice.timbre` — abstract requirements (`warmth`, `pitch`, `texture`). The compiler picks a concrete backend voice matching these.
- `voice.prosody` — style-token-mappable dials (`rate`, `pitch_range`, `energy`, `arousal`, `valence`). Compiles to SSML `<prosody>` today; to style tokens tomorrow.
- `voice.preferred_id` — hint only. If the backend supports it, used; otherwise compiler substitutes.

Concrete voice IDs never leak into the spec as hard dependencies.

### `pronunciation_overrides`
Key = surface form, value = respelling or IPA. Every serious TTS compiler needs this.

### `emotional_range`
`floor` and `ceiling` enum values bracket expressiveness across scenes.

### `greetings` and `examples`
Openers and few-shot turn pairs. Missing from v0.1 and the single biggest "practitioner hasn't actually authored this" tell. Anchored in the Ali:Chat / PList community conventions used by every serious character-card author.

### `scenes`
Resolution order: `base → scenes.format[x] → scenes.dialogue_act[y] → request`. **Rightmost wins.** Only a whitelisted set of fields is overridable (see §Overridable fields below) — `identity`, `pov`, `safety`, `voice.timbre`, `voice.preferred_id`, `locale` are NOT overridable per scene, because persona-stays-itself is the point.

`dialogue_act` replaces v0.1's `move`. Vocabulary aligned with ISO 24617-2 / Searle (see §Foundations).

### `safety`
The compile-time floor. Refuses generation if caller's request violates declared gates. Separate from `pov.wont_do` (in-character) and validated against it at publish time.

### `extensions`
Reverse-DNS-namespaced dict for plugin-specific fields (`com.vtube.l2d`, `gg.foundry.lore`). Unknown namespaces MUST be preserved on round-trip. The v0.1 spec was too tight and would force forks the first time a VTuber needed L2D expression triggers — `extensions` is the pressure valve.

### `author` / `license` / `changelog`
Provenance. Required for marketplace distribution. License governs redistribution of the persona file — not generated audio.

## Scalar conventions

Enum fields use 5 points: `none | low | mid | high | max`. Internally these map to 0.0, 0.25, 0.5, 0.75, 1.0. Numeric values are NOT accepted in v0.2 (v0.1's union caused silent diffs). If you need finer control, file a spec RFC.

## Overridable fields (per scene)

```
Whitelist (overridable in scenes.format / scenes.dialogue_act):
  idiolect.*        (all except `register_shifts`)
  voice.prosody.*   (all)
  voice.fidelity_default
  emotional_range.*
  greetings          (append-only via $append)
  dialogue_act_default   (in scenes.format only)

Not overridable:
  identity.*, pov.*, safety.*, locale
  voice.timbre.*, voice.preferred_id
  pronunciation_overrides, extensions
```

Parse-time validator rejects out-of-whitelist overrides.

## Merge operator algebra

Applied to `$append`/`$replace`/`$prepend`/`$remove`/`$unset`.

| Target type | Default merge | Operators |
|---|---|---|
| Scalar (enum/string/number) | Child replaces parent | `$unset: true` clears to undefined |
| Array | Child replaces parent | `$append: [...]` / `$prepend: [...]` / `$remove: [...]` / `$replace: [...]` |
| Object | Deep merge, child wins | `$replace: {...}` opts out of deep-merge |

Unknown `$operator` keys MUST error at parse time. Operators on mismatched types (e.g., `$append` on a scalar) MUST error. Precedence when operators nest: outermost operator wins.

## Invocation

```http
POST /v1/generate
Authorization: Bearer mvk_live_...
Idempotency-Key: 01JXY...

{
  "persona": "himaia/warm_confidant@1.3.0",
  "scene": { "format": "comfort", "dialogue_act": "reassure" },
  "input": "It's been a long week and I don't know where to start.",
  "fidelity": "shape"
}
```

Missing persona returns 404. Missing version resolves to the latest `@latest` (dev only; production MUST pin). Missing scene degrades to persona defaults.

## Versioning and compatibility contract

- **Major** (`2.0.0`) — breaking to `identity.archetype`, `pov.values`, or voice requirements.
- **Minor** (`1.4.0`) — new scenes, new signatures, new `wont_do` entries, new examples.
- **Patch** (`1.3.1`) — wording, single-step enum tweak, pronunciation update.

**Spec version compatibility:**
- `0.x` MAY break between minors. Pin in production.
- `1.0` onward: additive-only minors. Unknown fields MUST be preserved on round-trip. Unknown `$operator` MUST error. `deprecated: true` field marker for graceful evolution.

## Validation layers

- **Parse-time:** schema conformance, enum validity, overridable-field whitelist, merge-operator type-check, `id` pattern (`^[a-z0-9_-]+/[a-z0-9_-]+$`).
- **Publish-time:** safety/`wont_do` consistency per category, example-vs-persona lint (do examples violate banned_phrases?), token-budget lint (`identity.description` + merged scenes < 800 tokens warning).
- **Runtime:** safety-gate pre-flight (stage 0, before any tokens spent); 403 if request violates declared gates.

## Foundations

The v0.2 spec borrows structure from:

- **Persona consistency in dialogue:** Zhang et al., "Personalizing Dialogue Agents" / PERSONA-CHAT (ACL 2018). `compile_report.consistency` (forthcoming) is NLI-based persona entailment in this lineage.
- **Dialogue act theory:** ISO 24617-2 (DIT++ / DAMSL) informs the `dialogue_act` vocabulary. Searle's illocutionary classes (assertives, directives, commissives, expressives, declarations) are the philosophical anchor for `move` becoming a first-class field.
- **Expressive TTS / prosody:** Global Style Tokens (Wang et al. 2018), StyleTTS 2 (Li et al., NeurIPS 2023) motivate the `voice.prosody` sub-block. Cowen & Keltner (2017) on 27 affect dimensions informs `arousal` / `valence`.
- **Character voice in narrative theory:** Bakhtin's heteroglossia and Fludernik's cognitive narratology inform `idiolect` + `sociolect` + `register_shifts`.
- **Character card ecosystem:** the v0.2 shape is shaped by (and is not reinventing) Tavern Card v2 / CCv3. `greetings`, `examples`, `extensions` are deliberate parity moves. An importer from `chara_card_v2` ships with the reference implementation.

These aren't decoration. They're the reason the spec looks the way it does.

## v0.2 design decisions

Carrying forward from v0.1, with updates.

1. **`pov.wont_do` vs. `safety` split.** In-character vs. platform floor. Now structurally linked via `category`. Persona tightens, safety floors.
2. **Enums only for scalars.** Drop the v0.1 numeric escape hatch. Silent diffs are worse than rigidity.
3. **Rightmost-wins cascading**, with `HIMAIA_DEV=1` conflict logging.
4. **License: attribute, don't police.** Unchanged from v0.1.
5. **Inheritance (`extends`): deferred to v0.3.** Needs live fork patterns to validate against; no authors yet. Spec reserves the field.
6. **Compile-target metadata: himaia-injected, not author-declared.** v0.2 ships the field with `{target, version, timestamp}` only — real scoring lands with the eval harness.

## Out of scope (v0.2)

- Multi-speaker dialogue. One persona per call.
- Memory / long-term state. Caller's LLM.
- Voice cloning / custom voice models.
- Cross-language persona equivalence. One `locale` per file.
- Real-time interruption handling. TTS-side concern.
- Inheritance (`extends`). Reserved; v0.3.
- Lorebook / `context_hooks`. Reserved; v0.3.

## Next steps

- [ ] Publish reference implementation (parser + validator) at `github.com/maia/voice-persona`.
- [ ] Publish `chara_card_v2 → voice.persona` importer.
- [ ] Ship 8 starter personas under `personas/starters/*.persona.yaml`.
- [ ] Ratify with 3 external authors (1 SillyTavern plugin author, 2 companion-app devs) before declaring v0.2 frozen.
- [ ] Post v0.2 RFC to `r/SillyTavernAI` and Hacker News once reference impl is live.
