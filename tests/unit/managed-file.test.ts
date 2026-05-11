import { describe, test, expect } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { detectDrift } from "../../src/managed-file.ts";

async function withTempFile<T>(initial: string | null, fn: (p: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "devbox-managed-"));
  const file = path.join(dir, "managed.txt");
  if (initial !== null) await fs.writeFile(file, initial);
  try {
    return await fn(file);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("detectDrift", () => {
  test("returns stale=false when the file does not exist", async () => {
    await withTempFile(null, async (file) => {
      const r = await detectDrift(file, "anything");
      expect(r.stale).toBe(false);
    });
  });

  test("returns stale=false when on-disk content matches the target byte-for-byte", async () => {
    await withTempFile("hello world\n", async (file) => {
      const r = await detectDrift(file, "hello world\n");
      expect(r.stale).toBe(false);
    });
  });

  test("returns stale=true when on-disk content differs", async () => {
    await withTempFile("old contents\n", async (file) => {
      const r = await detectDrift(file, "new contents\n");
      expect(r.stale).toBe(true);
    });
  });

  test("byte-equal comparison: trailing newline differences count as drift", async () => {
    await withTempFile("hello", async (file) => {
      const r = await detectDrift(file, "hello\n");
      expect(r.stale).toBe(true);
    });
  });
});
