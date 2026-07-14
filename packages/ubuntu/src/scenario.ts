import * as fs from "node:fs/promises";
import { parseRepoUrl } from "./env.ts";
import type { Ctx, GitMode, GitWritePolicy } from "./tools/index.ts";

// Scenario file used by the smoke-test harness to drive the installer
// non-interactively. Every prompt in cli.ts checks for a preset value first
// and only prompts the user when one is absent. See tests/smoke/.
export type Scenario = {
  repo: Ctx["repo"];
  gitIdentity: { name: string; email: string };
  gitMode: GitMode;
  gitWritePolicy: GitWritePolicy;
  secretsManager: Ctx["secretsManager"];
  selectedToolIds: string[];
};

const SECRETS = new Set(["doppler", "infisical", "none"]);
const MODES = new Set(["read-only", "write"]);

export async function loadScenario(path: string): Promise<Scenario> {
  const raw = JSON.parse(await fs.readFile(path, "utf8"));

  const repoUrl = req(raw, "repo", "string") as string;
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) throw new Error(`scenario.repo: not a valid GitHub URL (${repoUrl})`);

  const ident = req(raw, "gitIdentity", "object") as Record<string, unknown>;
  const identName = req(ident, "name", "string", "gitIdentity.name") as string;
  const identEmail = req(ident, "email", "string", "gitIdentity.email") as string;

  const gitMode = req(raw, "gitMode", "string") as string;
  if (!MODES.has(gitMode))
    throw new Error(`scenario.gitMode: must be "read-only" or "write" (got "${gitMode}")`);

  const wp = req(raw, "gitWritePolicy", "object") as Record<string, unknown>;
  const writePolicy: GitWritePolicy = {
    pushMain: req(wp, "pushMain", "boolean", "gitWritePolicy.pushMain") as boolean,
    deleteBranches: req(
      wp,
      "deleteBranches",
      "boolean",
      "gitWritePolicy.deleteBranches",
    ) as boolean,
  };

  const secretsManager = req(raw, "secretsManager", "string") as string;
  if (!SECRETS.has(secretsManager)) {
    throw new Error(
      `scenario.secretsManager: must be "doppler" | "infisical" | "none" (got "${secretsManager}")`,
    );
  }

  const tools = req(raw, "selectedToolIds", "object") as unknown;
  if (!Array.isArray(tools) || !tools.every((t) => typeof t === "string")) {
    throw new Error(`scenario.selectedToolIds: must be a string[]`);
  }

  return {
    repo: { url: repoUrl, ...parsed },
    gitIdentity: { name: identName, email: identEmail },
    gitMode: gitMode as GitMode,
    gitWritePolicy: writePolicy,
    secretsManager: secretsManager as Ctx["secretsManager"],
    selectedToolIds: tools as string[],
  };
}

function req(
  obj: Record<string, unknown> | unknown,
  key: string,
  type: "string" | "boolean" | "object",
  label?: string,
): unknown {
  const where = label ?? `scenario.${key}`;
  if (!obj || typeof obj !== "object") throw new Error(`${where}: missing parent object`);
  const v = (obj as Record<string, unknown>)[key];
  if (v === undefined || v === null) throw new Error(`${where}: required`);
  if (type === "object") {
    if (typeof v !== "object") throw new Error(`${where}: expected object`);
  } else if (typeof v !== type) {
    throw new Error(`${where}: expected ${type}, got ${typeof v}`);
  }
  return v;
}
