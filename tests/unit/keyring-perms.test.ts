import { describe, test, expect } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import * as path from "node:path";

// install.sh sets `umask 077`, which sudo inherits. A keyring written by
// `sudo gpg --dearmor -o ...` or `sudo tee ...` lands as root:root mode 0600,
// which apt's `_apt` user can't read → GPG verification fails → `apt-get
// update` exits 100. Every tool that drops a file in /usr/share/keyrings/
// must follow up with `chmod go+r` (or equivalent) on the same path.
//
// This test is here because we've shipped this exact bug twice (gh, doppler).

const TOOLS_DIR = path.join(import.meta.dir, "../../src/tools");
const KEYRING_PATH = /\/usr\/share\/keyrings\/([A-Za-z0-9._-]+\.gpg)/g;
const KEYRING_WRITE = /(?:-o\s+|\btee\s+(?:-a\s+)?|>\s*)\/usr\/share\/keyrings\//;

describe("apt keyring permissions", () => {
  test("every tool that writes a keyring also chmods it readable", async () => {
    const files = (await readdir(TOOLS_DIR)).filter((f) => f.endsWith(".ts"));
    const violations: string[] = [];

    for (const f of files) {
      const src = await readFile(path.join(TOOLS_DIR, f), "utf8");
      if (!KEYRING_WRITE.test(src)) continue;

      const keyrings = new Set<string>();
      for (const m of src.matchAll(KEYRING_PATH)) keyrings.add(m[1]!);

      for (const name of keyrings) {
        const escaped = name.replace(/[.-]/g, "\\$&");
        const chmodForFile = new RegExp(
          `chmod\\s+(?:go\\+r|g\\+r,o\\+r|o\\+r,g\\+r|a\\+r|\\+r|0?644)\\s+\\/usr\\/share\\/keyrings\\/${escaped}\\b`,
        );
        if (!chmodForFile.test(src)) {
          violations.push(
            `${f}: writes /usr/share/keyrings/${name} without chmod (go+r|a+r|644). ` +
              `Under umask 077 the keyring lands mode 0600 → apt-get update exits 100.`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
