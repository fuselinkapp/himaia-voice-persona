// voice.persona spec v0.2 — TypeScript types for the subset we enforce at load
// time. The published reference schema (github.com/fuselinkapp/himaia-voice-persona, bet1.10)
// will be the authoritative version; these types track what the runtime needs.

export type Scalar5 = "none" | "low" | "mid" | "high" | "max";
export type Fidelity = "verbatim" | "shape" | "rewrite";
export type Pitch = "low" | "mid" | "high";
export type Texture = "soft" | "clear" | "raspy" | "breathy" | "nasal";
export type Rate = "rushed" | "steady" | "unhurried" | "deliberate";
export type PitchRange = "narrow" | "standard" | "wide";
export type Level3 = "low" | "mid" | "high";
export type Valence = "negative" | "neutral" | "positive";
export type AgeGate = "none" | "13+" | "18+";
export type RomanticLevel = "none" | "warm_not_sexual" | "romantic" | "explicit";

export type AgeRegister = "child" | "teen" | "adult" | "elder" | "none";
export type GenderPresentation = "fem" | "masc" | "neutral" | "none";
export type WontDoCategory =
  | "tone"
  | "romantic"
  | "violence"
  | "politics"
  | "self_harm"
  | "medical"
  | "other";

export type Identity = {
  tagline: string;
  description?: string;
  archetype?: string;
  age_register?: AgeRegister;
  gender_presentation?: GenderPresentation;
  sociolect?: string;
};

export type WontDo = { text: string; category: WontDoCategory };

export type Pov = {
  values?: string[];
  beliefs?: string[];
  taboos?: string[];
  wont_do?: WontDo[];
};

export type Idiolect = {
  signatures?: string[];
  banned_phrases?: string[];
  register_shifts?: { peer?: string; authority?: string; stranger?: string };
  formality?: Scalar5;
  humor?: Scalar5;
  warmth?: Scalar5;
  directness?: Scalar5;
  vulgarity?: Scalar5;
  disfluency?: "none" | "sparing" | "natural";
  sentence_length?: "short" | "medium" | "long" | "varied";
};

export type Timbre = { warmth?: Scalar5; pitch?: Pitch; texture?: Texture };
export type Prosody = {
  rate?: Rate;
  pitch_range?: PitchRange;
  energy?: Level3;
  arousal?: Level3;
  valence?: Valence;
};

export type Voice = {
  timbre?: Timbre;
  prosody?: Prosody;
  preferred_id?: string;
  fidelity_default?: Fidelity;
};

export type SceneExample = {
  scene: { format?: string; dialogue_act?: string };
  user: string;
  assistant: string;
};

export type FormatOverride = {
  prosody?: Prosody;
  idiolect?: Partial<Idiolect>;
  dialogue_act_default?: string;
  greetings?: string[];
  fidelity_default?: Fidelity;
};

export type DialogueActOverride = {
  prosody?: Prosody;
  idiolect?: Partial<Idiolect> & {
    signatures?: string[] | { $append?: string[] };
    banned_phrases?: string[] | { $append?: string[] };
  };
  fidelity_default?: Fidelity;
};

export type Scenes = {
  format?: Record<string, FormatOverride>;
  dialogue_act?: Record<string, DialogueActOverride>;
};

export type Safety = {
  age_gate: AgeGate;
  romantic?: RomanticLevel;
  self_harm_policy?: string;
  political_stance?: string;
  licensed_voice?: boolean;
};

export type Author = { handle: string; url?: string };
export type ChangelogEntry = { version: string; date: string; notes: string };

export type VoicePersona = {
  spec_version: "0.2";
  id: string;
  version: string;
  name: string;
  locale: string;
  identity: Identity;
  pov?: Pov;
  idiolect?: Idiolect;
  voice?: Voice;
  pronunciation_overrides?: Record<string, string>;
  emotional_range?: { floor?: Scalar5; ceiling?: Scalar5 };
  greetings?: string[];
  examples?: SceneExample[];
  scenes?: Scenes;
  safety: Safety;
  extensions?: Record<string, unknown>;
  author: Author;
  license: string;
  changelog?: ChangelogEntry[];
};
