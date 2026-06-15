#!/usr/bin/env node
// voice-persona lint — parse + validate a .persona.yaml/.persona.json file and
// print path-tagged errors/warnings. Exits with code 1 on validation failure.
//
// Usage:
//   voice-persona lint <file> [<file2> ...]
//   voice-persona lint --help
//
// Dependency-light: only the `yaml` package already required by the parser.

import { readFileSync, statSync } from "node:fs";
import { resolve, extname, basename } from "node:path";
import { parseVoicePersona } from "./parser.js";
import { PersonaValidationError } from "./validator.js";

const SUPPORTED_EXTENSIONS = new Set([".yaml", ".yml", ".json"]);

function printUsage(): void {
  process.stdout.write(
    [
      "",
      "  voice-persona lint <file> [<file2> ...]",
      "",
      "  Parses and validates one or more .persona.yaml / .persona.json files.",
      "  Prints path-tagged errors. Exits 0 on success, 1 on any failure.",
      "",
      "  Options:",
      "    --help, -h   Show this help message.",
      "",
    ].join("\n"),
  );
}

type FileResult = {
  file: string;
  ok: boolean;
  errors: string[];
};

function lintFile(filePath: string): FileResult {
  const errors: string[] = [];

  // File existence / stat check
  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    return { file: filePath, ok: false, errors: [`file not found: ${filePath}`] };
  }
  if (!stat.isFile()) {
    return { file: filePath, ok: false, errors: [`not a file: ${filePath}`] };
  }

  const ext = extname(basename(filePath)).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    errors.push(
      `warning: unexpected extension "${ext}" — expected .yaml, .yml, or .json`,
    );
    // Non-fatal: attempt to parse anyway.
  }

  // Read
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (err) {
    return { file: filePath, ok: false, errors: [`read failed: ${(err as Error).message}`] };
  }

  // Parse + validate
  try {
    parseVoicePersona(text);
  } catch (err) {
    if (err instanceof PersonaValidationError) {
      errors.push(`error  ${err.path}: ${err.message.slice(err.path.length + 2)}`);
    } else {
      errors.push(`error  $: ${(err as Error).message}`);
    }
    return { file: filePath, ok: false, errors };
  }

  return { file: filePath, ok: errors.length === 0, errors };
}

function run(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const files = args.map((f) => resolve(f));
  let anyFailed = false;

  for (const filePath of files) {
    const result = lintFile(filePath);

    if (result.ok) {
      process.stdout.write(`ok     ${filePath}\n`);
    } else {
      anyFailed = true;
      process.stdout.write(`fail   ${filePath}\n`);
    }

    for (const msg of result.errors) {
      // Indent sub-messages under the file
      process.stdout.write(`       ${msg}\n`);
    }
  }

  process.exit(anyFailed ? 1 : 0);
}

run();
