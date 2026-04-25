// node --test test/importer.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { stringify as yamlStringify } from "yaml";

import {
  importTavernCard,
  ImporterError,
  parseVoicePersona,
} from "../dist/index.js";

const minimalCard = {
  spec: "chara_card_v2",
  spec_version: "2.0",
  data: {
    name: "Aria",
    description: "A bookseller in a quiet town. Mid-thirties, dry humor.",
    first_mes: "Welcome. Anything in particular today?",
  },
};

test("importTavernCard — minimal CCv2 maps cleanly", () => {
  const { persona, warnings } = importTavernCard(minimalCard);
  assert.equal(persona.id, "imported/aria");
  assert.equal(persona.name, "Aria");
  assert.equal(persona.spec_version, "0.2");
  assert.equal(persona.locale, "en-US");
  assert.equal(persona.safety.age_gate, "13+");
  assert.equal(persona.author.handle, "imported");
  assert.ok(persona.identity.tagline);
  assert.ok(persona.greetings && persona.greetings.length === 1);
  // Always warns about unfilled idiolect/voice/scenes.
  assert.ok(warnings.some((w) => /review needed/.test(w)));
});

test("importTavernCard — full card maps + surfaces drops as warnings", () => {
  const card = {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "Cassian Reed",
      description: "Veteran detective. Reads silence.",
      personality: "Quiet. Thorough. Suspicious of small talk.",
      scenario: "You enter the precinct at 2am.",
      first_mes: "Sit down. Coffee's bad but it's hot.",
      alternate_greetings: ["You came back.", "Door's unlocked."],
      mes_example:
        "<START>\n{{user}}: who are you\n{{char}}: Reed. Detective. *gestures at the chair*\n",
      creator_notes: "Originally written for a noir setting.",
      system_prompt: "Stay in character as Cassian Reed.",
      post_history_instructions: "Never break character.",
      tags: ["noir", "detective", "adult"],
      creator: "noirfan",
      character_version: "2.1.0",
      extensions: { depth_prompt: { prompt: "be terse", depth: 4 } },
    },
  };

  const { persona, warnings } = importTavernCard(card);
  assert.equal(persona.id, "imported/cassian-reed");
  assert.equal(persona.version, "2.1.0");
  assert.equal(persona.author.handle, "noirfan");
  assert.equal(persona.greetings?.length, 3);
  assert.equal(persona.examples?.length, 1);
  assert.deepEqual(persona.extensions?.["chub.ai/tags"], ["noir", "detective", "adult"]);
  assert.equal(persona.extensions?.["chub.ai/creator_notes"], "Originally written for a noir setting.");
  assert.deepEqual(persona.extensions?.["chub.ai/depth_prompt"], { prompt: "be terse", depth: 4 });

  // Warnings should mention each dropped field at least once.
  const joined = warnings.join("\n");
  assert.ok(/scenario/.test(joined), "warns about scenario drop");
  assert.ok(/system_prompt/.test(joined), "warns about system_prompt drop");
  assert.ok(/post_history_instructions/.test(joined), "warns about post_history_instructions drop");
});

test("importTavernCard — parses two <START> blocks into two examples", () => {
  const card = {
    ...minimalCard,
    data: {
      ...minimalCard.data,
      mes_example:
        "<START>\n" +
        "{{user}}: hi\n{{char}}: hello.\n" +
        "<START>\n" +
        "{{user}}: still there?\n{{char}}: yes.\n",
    },
  };
  const { persona } = importTavernCard(card);
  assert.equal(persona.examples?.length, 2);
  assert.equal(persona.examples?.[0]?.user, "hi");
  assert.equal(persona.examples?.[0]?.assistant, "hello.");
  assert.equal(persona.examples?.[1]?.user, "still there?");
  assert.equal(persona.examples?.[1]?.assistant, "yes.");
});

test("importTavernCard — rejects unsupported spec", () => {
  assert.throws(
    () => importTavernCard({ spec: "chara_card_v3", spec_version: "3.0", data: { name: "x" } }),
    (err) => err instanceof ImporterError && /chara_card_v3/.test(err.message),
  );
});

test("importTavernCard — abbreviation in personality doesn't truncate the tagline at 'Dr.'", () => {
  const card = {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "Dr. Smith",
      personality: "Dr. Smith is a tired physician with dry humor. She has been doing this for thirty years.",
      first_mes: "Sit.",
    },
  };
  const { persona } = importTavernCard(card);
  assert.match(persona.identity.tagline, /Dr\. Smith is a tired physician/);
  // Tagline is the first sentence, ending at the first ". " after the actual sentence.
  assert.equal(persona.identity.tagline, "Dr. Smith is a tired physician with dry humor.");
});

test("importTavernCard — long personality truncated to tagline + remainder kept as description", () => {
  const longSentence = "She walks softly and never raises her voice except when she is very, very, very, very, very sure of something.";
  const card = {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "Q",
      personality: longSentence + " She also collects stamps.",
      first_mes: "Hello.",
    },
  };
  const { persona } = importTavernCard(card);
  // Tagline should be truncated with ellipsis, NOT contain the full first sentence.
  assert.ok(persona.identity.tagline.endsWith("…"));
  assert.ok(persona.identity.tagline.length <= 100);
  // Description should NOT duplicate the full personality (the bug being fixed).
  assert.ok(persona.identity.description, "expected a description leftover");
  assert.ok(
    !persona.identity.description.includes(longSentence + " She also collects stamps."),
    "description must not duplicate the entire personality",
  );
  assert.match(persona.identity.description, /stamps/);
});

test("importTavernCard — multi-turn <START> block warns about dropped turns", () => {
  const card = {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "Multi",
      first_mes: "hi",
      mes_example:
        "<START>\n" +
        "{{user}}: hello\n{{char}}: hello.\n" +
        "{{user}}: how are you\n{{char}}: peachy.\n" +
        "{{user}}: ok bye\n{{char}}: bye.\n",
    },
  };
  const { persona, warnings } = importTavernCard(card);
  assert.equal(persona.examples?.length, 1);
  assert.equal(persona.examples?.[0]?.user, "hello");
  assert.ok(
    warnings.some((w) => /3 user \/ 3 char turns/.test(w)),
    "expected a multi-turn loss warning",
  );
});

test("importTavernCard — depth_prompt extension preserved AND surfaced as warning", () => {
  const card = {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "Stoic",
      first_mes: "Hello.",
      extensions: {
        depth_prompt: { prompt: "Always speak in clipped, formal English.", depth: 4 },
      },
    },
  };
  const { persona, warnings } = importTavernCard(card);
  assert.deepEqual(
    persona.extensions?.["chub.ai/depth_prompt"],
    { prompt: "Always speak in clipped, formal English.", depth: 4 },
  );
  assert.ok(warnings.some((w) => /depth_prompt/.test(w)));
});

test("importTavernCard — license defaults to NOASSERTION (SPDX standard)", () => {
  const { persona } = importTavernCard(minimalCard);
  assert.equal(persona.license, "NOASSERTION");
});

test("importTavernCard — round-trips through parseVoicePersona", () => {
  const { persona } = importTavernCard(minimalCard);
  // Stringify with `yaml` (the same library parseVoicePersona uses) and re-parse.
  const round = parseVoicePersona(yamlStringify(persona));
  assert.equal(round.id, persona.id);
  assert.equal(round.name, persona.name);
  assert.equal(round.identity.tagline, persona.identity.tagline);
  assert.equal(round.locale, persona.locale);
});
