import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

export type Sandbox = {
  home: string;
  binDir: string;
  stubLog: string;
};

// Stub script: log every invocation as `<name>\t<arg1>\t<arg2>...` to STUB_LOG, then exit 0.
const STUB_TEMPLATE = (name: string) => `#!/bin/sh
{
  printf '%s' '${name}'
  for arg in "$@"; do printf '\\t%s' "$arg"; done
  printf '\\n'
} >>"$STUB_LOG"
exit 0
`;

const STUB_NAMES = [
  "apt-get", "curl", "wget", "bun", "npm", "pnpm", "yarn", "pip", "uv", "cargo",
  "sudo", "git", "gh", "doppler", "infisical", "agent-browser", "sfw", "fnm", "node",
  "tee", "dpkg",
];

export async function makeSandbox(): Promise<Sandbox> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "devbox-home-"));
  const binDir = await fs.mkdtemp(path.join(os.tmpdir(), "devbox-bin-"));
  const stubLog = path.join(binDir, "_log");
  await fs.writeFile(stubLog, "");
  for (const name of STUB_NAMES) {
    const p = path.join(binDir, name);
    await fs.writeFile(p, STUB_TEMPLATE(name), { mode: 0o755 });
  }
  return { home, binDir, stubLog };
}

export async function cleanupSandbox(sb: Sandbox): Promise<void> {
  await fs.rm(sb.home, { recursive: true, force: true });
  await fs.rm(sb.binDir, { recursive: true, force: true });
}

// Apply sandbox env to the current process, return a restore function.
export function applyEnv(sb: Sandbox): () => void {
  const prevHome = process.env.HOME;
  const prevPath = process.env.PATH;
  const prevLog = process.env.STUB_LOG;
  process.env.HOME = sb.home;
  process.env.PATH = `${sb.binDir}:${prevPath ?? ""}`;
  process.env.STUB_LOG = sb.stubLog;
  return () => {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevPath === undefined) delete process.env.PATH;
    else process.env.PATH = prevPath;
    if (prevLog === undefined) delete process.env.STUB_LOG;
    else process.env.STUB_LOG = prevLog;
  };
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readJson<T = unknown>(p: string): Promise<T> {
  return JSON.parse(await fs.readFile(p, "utf8")) as T;
}

export async function readStubLog(sb: Sandbox): Promise<string[]> {
  const body = await fs.readFile(sb.stubLog, "utf8");
  return body.split("\n").filter((l) => l.length > 0);
}

// Build a Ctx with sane defaults; tests override what they care about.
import type { Ctx } from "../../src/tools/index.ts";

export function makeCtx(overrides: Partial<Ctx> = {}): Ctx {
  return {
    repo: { url: "https://github.com/octocat/hello", owner: "octocat", name: "hello", slug: "hello" },
    secretsManager: "none",
    gitMode: "write",
    gitWritePolicy: { pushMain: false, deleteBranches: false },
    tokens: {},
    exports: [],
    aliases: [],
    mcpServers: {},
    selectedToolIds: new Set<string>(),
    ...overrides,
  };
}
