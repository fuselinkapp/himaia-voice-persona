// node --test test/parser.test.mjs
// Runs against the built dist/. Build first: `pnpm build`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { parseVoicePersona, PersonaValidationError } from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const examplePath = resolve(here, "../examples/starters/warm_confidant.persona.yaml");

test("parseVoicePersona — loads a starter cleanly", () => {
  const text = readFileSync(examplePath, "utf8");
  const persona = parseVoicePersona(text);
  assert.equal(persona.id, "maia/warm_confidant");
  assert.equal(persona.spec_version, "0.2");
  assert.equal(persona.locale, "en-US");
  assert.equal(typeof persona.identity.tagline, "string");
  assert.ok(persona.identity.tagline.length > 0);
});

test("parseVoicePersona — rejects missing spec_version", () => {
  const broken = `id: "test/x"
version: "1.0.0"
name: "X"
locale: "en-US"
identity: { tagline: "x" }
safety: { age_gate: "13+" }
author: { handle: "x" }
license: "CC-BY-4.0"
`;
  assert.throws(
    () => parseVoicePersona(broken),
    (err) =>
      err instanceof PersonaValidationError &&
      /spec_version/.test(err.message),
  );
});

test("parseVoicePersona — rejects out-of-enum scalar", () => {
  const broken = `spec_version: "0.2"
id: "test/x"
version: "1.0.0"
name: "X"
locale: "en-US"
identity: { tagline: "x" }
idiolect: { warmth: "extremely-high" }
safety: { age_gate: "13+" }
author: { handle: "x" }
license: "CC-BY-4.0"
`;
  assert.throws(
    () => parseVoicePersona(broken),
    (err) =>
      err instanceof PersonaValidationError &&
      /warmth/.test(err.message),
  );
});

test("parseVoicePersona — rejects empty / whitespace-only input", () => {
  for (const empty of ["", "   ", "\n\n\t\n"]) {
    assert.throws(
      () => parseVoicePersona(empty),
      (err) => /empty input/.test(err.message),
    );
  }
});

test("parseVoicePersona — wraps malformed YAML with prefix", () => {
  // Unbalanced flow mapping
  assert.throws(
    () => parseVoicePersona("foo: { bar:"),
    (err) => /YAML parse failed/.test(err.message),
  );
});

test("parseVoicePersona — accepts JSON input", () => {
  const json = JSON.stringify({
    spec_version: "0.2",
    id: "test/x",
    version: "1.0.0",
    name: "X",
    locale: "en-US",
    identity: { tagline: "test" },
    safety: { age_gate: "13+" },
    author: { handle: "test" },
    license: "CC-BY-4.0",
  });
  const persona = parseVoicePersona(json);
  assert.equal(persona.id, "test/x");
});
