import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  parseRepoUrl,
  ghFineGrainedTokenUrl,
  ghClassicTokenUrl,
  readEnv,
  writeShellInit,
} from "../../src/env.ts";

describe("parseRepoUrl", () => {
  test("https URL", () => {
    expect(parseRepoUrl("https://github.com/owner/repo")).toEqual({
      owner: "owner",
      name: "repo",
      slug: "repo",
    });
  });

  test("https URL with .git suffix", () => {
    expect(parseRepoUrl("https://github.com/owner/repo.git")).toEqual({
      owner: "owner",
      name: "repo",
      slug: "repo",
    });
  });

  test("https URL with trailing slash", () => {
    expect(parseRepoUrl("https://github.com/owner/repo/")).toEqual({
      owner: "owner",
      name: "repo",
      slug: "repo",
    });
  });

  test("ssh URL", () => {
    expect(parseRepoUrl("git@github.com:owner/repo.git")).toEqual({
      owner: "owner",
      name: "repo",
      slug: "repo",
    });
  });

  test("shorthand owner/repo", () => {
    expect(parseRepoUrl("owner/repo")).toEqual({
      owner: "owner",
      name: "repo",
      slug: "repo",
    });
  });

  test("trims whitespace", () => {
    expect(parseRepoUrl("  https://github.com/owner/repo  ")).toEqual({
      owner: "owner",
      name: "repo",
      slug: "repo",
    });
  });

  test("rejects gibberish", () => {
    expect(parseRepoUrl("not-a-url")).toBeNull();
  });

  test("rejects empty string", () => {
    expect(parseRepoUrl("")).toBeNull();
  });

  test("rejects non-github hosts", () => {
    expect(parseRepoUrl("https://gitlab.com/owner/repo")).toBeNull();
  });
});

// The fine-grained token URL deliberately omits target_name / contents /
// pull_requests / metadata params — see env.ts for the comment block; GitHub
// bug community/discussions/188111 makes pre-filling them unsafe.
describe("ghFineGrainedTokenUrl", () => {
  test("only pre-fills name and description; ignores ownerLogin and access", () => {
    const url = ghFineGrainedTokenUrl({
      name: "devbox-myrepo",
      description: "test",
      ownerLogin: "octocat",
      access: "read",
    });
    const params = new URL(url).searchParams;
    expect(params.get("name")).toBe("devbox-myrepo");
    expect(params.get("description")).toBe("test");
    expect(params.get("target_name")).toBeNull();
    expect(params.get("contents")).toBeNull();
    expect(params.get("pull_requests")).toBeNull();
    expect(params.get("metadata")).toBeNull();
  });

  test("write access produces the same URL as read access", () => {
    const opts = { name: "n", description: "d", ownerLogin: "o" } as const;
    const read = ghFineGrainedTokenUrl({ ...opts, access: "read" });
    const write = ghFineGrainedTokenUrl({ ...opts, access: "write" });
    expect(read).toBe(write);
  });

  test("URL points at github.com fine-grained token form", () => {
    const url = ghFineGrainedTokenUrl({
      name: "n",
      description: "d",
      ownerLogin: "o",
      access: "read",
    });
    expect(url.startsWith("https://github.com/settings/personal-access-tokens/new?")).toBe(true);
  });

  test("URL-encodes special chars in description", () => {
    const url = ghFineGrainedTokenUrl({
      name: "n",
      description: "has space & ampersand",
      ownerLogin: "o",
      access: "read",
    });
    const params = new URL(url).searchParams;
    expect(params.get("description")).toBe("has space & ampersand");
  });
});

describe("ghClassicTokenUrl", () => {
  test("scopes string contains repo and read:org", () => {
    const url = ghClassicTokenUrl({ name: "test" });
    const params = new URL(url).searchParams;
    expect(params.get("scopes")).toBe("repo,read:org");
    expect(params.get("description")).toBe("test");
  });
});

// File mode + bashrc source-line-once are covered by the smoke harness end-to-end.
// Quote-escaping is the one case worth exercising in-process: it's pure parser
// behavior and would be tedious to assert from a shell.
describe("readEnv", () => {
  let tmpHome: string | undefined;
  const origHome = process.env.HOME;
  afterEach(async () => {
    if (tmpHome) await fs.rm(tmpHome, { recursive: true, force: true });
    process.env.HOME = origHome;
    tmpHome = undefined;
  });

  async function writeEnvFile(body: string): Promise<void> {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "devbox-env-"));
    process.env.HOME = tmpHome;
    const dir = path.join(tmpHome, ".config", "devbox");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "env"), body);
  }

  test("parses the export lines written by core's upsertEnv", async () => {
    // shellQuote escaping: a literal ' becomes '\''
    await writeEnvFile(`export GH_TOKEN='abc'\nexport QUOTED='sec'\\''ond'\n`);
    expect(await readEnv()).toEqual({ GH_TOKEN: "abc", QUOTED: "sec'ond" });
  });

  test("tolerates legacy pre-monorepo KEY=\"value\" lines", async () => {
    await writeEnvFile(`GH_TOKEN="abc"\nQUOTED="has \\"quotes\\" inside"\n`);
    expect(await readEnv()).toEqual({ GH_TOKEN: "abc", QUOTED: 'has "quotes" inside' });
  });

  test("returns {} when the file is missing", async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "devbox-env-"));
    process.env.HOME = tmpHome;
    expect(await readEnv()).toEqual({});
  });
});

describe("writeShellInit", () => {
  let tmpHome: string | undefined;
  const origHome = process.env.HOME;
  afterEach(async () => {
    if (tmpHome) await fs.rm(tmpHome, { recursive: true, force: true });
    process.env.HOME = origHome;
    tmpHome = undefined;
  });

  async function setup(): Promise<string> {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "devbox-shell-"));
    process.env.HOME = tmpHome;
    return tmpHome;
  }

  test("omits cd line when cdSlug not provided", async () => {
    const home = await setup();
    await writeShellInit({ exports: ["export FOO=bar"] });
    const body = await fs.readFile(path.join(home, ".bashrc.d", "devbox.sh"), "utf8");
    expect(body).not.toContain("cd ~/");
  });

  test("sources the env file plainly (export lines carry their own export)", async () => {
    const home = await setup();
    await writeShellInit({});
    const body = await fs.readFile(path.join(home, ".bashrc.d", "devbox.sh"), "utf8");
    expect(body).toContain(`. ${path.join(home, ".config", "devbox", "env")}`);
    expect(body).not.toContain("set -a");
  });

  test("emits guarded cd line when cdSlug provided", async () => {
    const home = await setup();
    await writeShellInit({ cdSlug: "myrepo" });
    const body = await fs.readFile(path.join(home, ".bashrc.d", "devbox.sh"), "utf8");
    expect(body).toContain("[[ $- == *i* ]] && [ -d ~/myrepo ] && cd ~/myrepo");
  });

  test("appends ~/.bashrc source line exactly once across reruns", async () => {
    const home = await setup();
    const SOURCE_LINE = `for f in ~/.bashrc.d/*.sh; do [ -r "$f" ] && . "$f"; done`;
    await writeShellInit({ cdSlug: "r" });
    await writeShellInit({ cdSlug: "r" });
    const body = await fs.readFile(path.join(home, ".bashrc"), "utf8");
    const occurrences = body.split(SOURCE_LINE).length - 1;
    expect(occurrences).toBe(1);
  });
});
