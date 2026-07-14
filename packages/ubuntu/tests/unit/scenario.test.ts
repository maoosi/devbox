import { describe, test, expect } from "bun:test";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { loadScenario } from "../../src/scenario.ts";

async function withScenario<T>(json: unknown, fn: (path: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "scenario-"));
  const f = path.join(dir, "s.json");
  await writeFile(f, JSON.stringify(json));
  try {
    return await fn(f);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const valid = {
  repo: "https://github.com/octocat/hello",
  gitIdentity: { name: "A", email: "a@b.c" },
  gitMode: "write",
  gitWritePolicy: { pushMain: false, deleteBranches: false },
  secretsManager: "doppler",
  selectedToolIds: ["agent-browser"],
};

describe("loadScenario", () => {
  test("parses a valid scenario into a typed object", async () => {
    await withScenario(valid, async (f) => {
      const s = await loadScenario(f);
      expect(s.repo).toEqual({ url: valid.repo, owner: "octocat", name: "hello", slug: "hello" });
      expect(s.gitMode).toBe("write");
      expect(s.secretsManager).toBe("doppler");
      expect(s.selectedToolIds).toEqual(["agent-browser"]);
    });
  });

  test("rejects bad GitHub URL with a useful message", async () => {
    const bad = { ...valid, repo: "not-a-url" };
    await withScenario(bad, async (f) => {
      await expect(loadScenario(f)).rejects.toThrow(/scenario\.repo: not a valid GitHub URL/);
    });
  });

  test("rejects unknown secretsManager", async () => {
    const bad = { ...valid, secretsManager: "vault" };
    await withScenario(bad, async (f) => {
      await expect(loadScenario(f)).rejects.toThrow(/scenario\.secretsManager:/);
    });
  });

  test("rejects unknown gitMode", async () => {
    const bad = { ...valid, gitMode: "rebase" };
    await withScenario(bad, async (f) => {
      await expect(loadScenario(f)).rejects.toThrow(/scenario\.gitMode:/);
    });
  });

  test("rejects missing required fields", async () => {
    const { repo: _r, ...bad } = valid;
    await withScenario(bad, async (f) => {
      await expect(loadScenario(f)).rejects.toThrow(/scenario\.repo: required/);
    });
  });
});
