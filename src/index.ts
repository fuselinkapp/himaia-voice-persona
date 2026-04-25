// voice.persona — reference parser, validator, and types for the v0.2 spec.
// Apache-2.0. https://github.com/maia-voice/voice-persona

export { parseVoicePersona } from "./parser.js";
export type { ParseFormat, ParseOptions } from "./parser.js";

export {
  PersonaValidationError,
  validateVoicePersona,
} from "./validator.js";

export type {
  VoicePersona,
  Identity,
  Pov,
  WontDo,
  WontDoCategory,
  Idiolect,
  Voice,
  Timbre,
  Prosody,
  SceneExample,
  Scenes,
  FormatOverride,
  DialogueActOverride,
  Safety,
  Author,
  ChangelogEntry,
  Scalar5,
  Fidelity,
  Pitch,
  Texture,
  Rate,
  PitchRange,
  Level3,
  Valence,
  AgeGate,
  RomanticLevel,
  AgeRegister,
  GenderPresentation,
} from "./types.js";
