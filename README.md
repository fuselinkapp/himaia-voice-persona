# voice.persona

> A file format for voices that have a point of view — identity, idiolect,
> scene modulation, and refusals in one versioned artifact.

`voice.persona` is the spec; this package is the reference parser, validator,
and TypeScript types. Apache-2.0. The runtime that compiles personas onto a
TTS backend is separate (and not Apache-2.0); the spec is.

The full spec lives in [`SPEC.md`](./SPEC.md).

## Why

Most TTS treats voice as a timbre. A character whispering at 2am and rallying
allies in a fight ends up sounding identical. `voice.persona` makes the *point
of view* — values, idiolect, scene-aware delivery — first-class, versioned,
and forkable.

## Hello world

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

Fifteen lines of signal. Everything else in `SPEC.md` is optional refinement.

## Install

```bash
npm install voice-persona
```

## Use

```ts
import { parseVoicePersona } from "voice-persona";
import { readFileSync } from "node:fs";

const persona = parseVoicePersona(readFileSync("warm_confidant.persona.yaml", "utf8"));
console.log(persona.identity.tagline);
```

The package is pure — no file I/O of its own. Wrap with whatever runtime
gives you bytes (Node `fs`, Deno, Bun, fetch in a browser, an edge runtime).

For JSON personas, the parser auto-detects:

```ts
parseVoicePersona('{"spec_version": "0.2", "id": "you/x", ... }');
```

Or force the format explicitly:

```ts
parseVoicePersona(text, { format: "yaml" });
```

## Validation

`parseVoicePersona` runs the validator before returning. Bad input throws
`PersonaValidationError` with a path-prefixed message (`$.identity.tagline:
expected non-empty string`). Validate without parsing:

```ts
import { validateVoicePersona } from "voice-persona";
validateVoicePersona(alreadyParsedObject); // throws on bad shape
```

## Examples

[`examples/starters/`](https://github.com/maia-voice/voice-persona/tree/main/examples/starters)
ships the 8 canonical starter personas — Apache-2.0,
fork them. Drop them into your runtime and call them by id (`maia/warm_confidant`,
`maia/skeptical_buyer`, etc.) or copy the file and rename for your own roster.

## Status

`v0.2.0` — first public release. The spec is stable enough to ship against
but expect minor refinements as real authors push on it. See `CHANGELOG.md`
for the version policy.

## Contributing

Spec issues and clarifications: open a GitHub issue. Reference parser bugs:
same. Major changes (new fields, new merge operators, breaking shifts)
require a written spec RFC in the issues — discuss before sending a PR.

## License

Apache-2.0. See `LICENSE`. The spec, the reference implementation, and the
example starters are all Apache-2.0. Any persona file you author is yours;
the example starters carry CC-BY-4.0 attribution per `author` / `license`
fields in each file.
