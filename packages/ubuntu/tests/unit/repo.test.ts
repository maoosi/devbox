import { describe, test, expect } from "bun:test";
import * as path from "node:path";
import { cloneDir, cloneDirDisplay } from "../../src/tools/repo.ts";

// Hook generation + shouldInstallHook now live in @devbox/core (see
// packages/core/tests/hooks.test.ts). Only the clone-path helpers stay here.
describe("cloneDir", () => {
  test("builds ~/<slug> from the given slug", () => {
    const original = process.env.HOME;
    process.env.HOME = "/home/testuser";
    try {
      expect(cloneDir("hello-world")).toBe(path.join("/home/testuser", "hello-world"));
      expect(cloneDir("devbox")).toBe(path.join("/home/testuser", "devbox"));
      expect(cloneDirDisplay("hello-world")).toBe("~/hello-world");
    } finally {
      if (original === undefined) delete process.env.HOME;
      else process.env.HOME = original;
    }
  });
});
