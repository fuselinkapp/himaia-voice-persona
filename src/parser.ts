import { parse as parseYaml } from "yaml";
import { validateVoicePersona } from "./validator.js";
import type { VoicePersona } from "./types.js";

// parseVoicePersona is pure — text in, validated VoicePersona out, no I/O.
// Node consumers wrap with their own readFile; the package itself stays
// runnable in Deno, Bun, browsers, and edge runtimes.

export type ParseFormat = "yaml" | "json";

export type ParseOptions = {
  /** Force a specific format. If omitted, auto-detected: leading `{` or `[` → JSON, else YAML. */
  format?: ParseFormat;
};

export function parseVoicePersona(text: string, opts: ParseOptions = {}): VoicePersona {
  if (typeof text !== "string") {
    throw new TypeError("parseVoicePersona: expected string input");
  }
  // Strip a UTF-8 BOM if present so JSON detection works and YAML doesn't
  // misinterpret it as content.
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (body.trim().length === 0) {
    throw new Error("parseVoicePersona: empty input");
  }
  const format = opts.format ?? detectFormat(body);
  let raw: unknown;
  try {
    raw = format === "json" ? JSON.parse(body) : parseYaml(body);
  } catch (err) {
    const fmt = format === "json" ? "JSON" : "YAML";
    throw new Error(`parseVoicePersona: ${fmt} parse failed: ${(err as Error).message}`);
  }
  return validateVoicePersona(raw);
}

function detectFormat(text: string): ParseFormat {
  // Skip leading whitespace; first non-ws char picks the format. BOM is
  // already stripped upstream. YAML's `---` document marker starts with `-`,
  // not `{` or `[`, so this routes correctly.
  let i = 0;
  while (i < text.length && /\s/.test(text[i] ?? "")) i++;
  const ch = text[i];
  return ch === "{" || ch === "[" ? "json" : "yaml";
}
