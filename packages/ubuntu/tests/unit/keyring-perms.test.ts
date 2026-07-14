import { describe, test, expect } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import * as path from "node:path";

// install.sh sets `umask 077`, which sudo inherits. A keyring written by
// `sudo gpg --dearmor -o ...` or `sudo tee ...` lands as root:root mode 0600,
// which apt's `_apt` user can't read → GPG verification fails → `apt-get
// update` exits 100. Every script that drops a file in /usr/share/keyrings/
// must either follow up with `chmod go+r` (or equivalent) on the same path,
// or run under an explicit `umask 022` (the approach core's doppler/infisical
// setup modules take — their vendor install scripts write keyrings
// internally, invisible to this lint's path regex).
//
// This test is here because we've shipped this exact bug twice (gh, doppler).
// It scans both the ubuntu tools and core's setup modules.

const SCAN_DIRS = [
  path.join(import.meta.dir, "../../src/tools"),
  path.join(import.meta.dir, "../../../core/src/setup"),
];
const KEYRING_PATH = /\/usr\/share\/keyrings\/([A-Za-z0-9._-]+\.gpg)/g;
const KEYRING_WRITE = /(?:-o\s+|\btee\s+(?:-a\s+)?|>\s*)\/usr\/share\/keyrings\//;
// Vendor install scripts (cloudsmith setup.deb.sh, doppler install.sh) write
// keyrings internally; a leading `umask 022` in the same script neutralises
// the installer's 077 for everything they create.
const VENDOR_INSTALLER = /(?:setup\.deb\.sh|cli\.doppler\.com\/install\.sh)/;

describe("apt keyring permissions", () => {
  test("every script that writes a keyring also makes it readable", async () => {
    const violations: string[] = [];

    for (const dir of SCAN_DIRS) {
      const files = (await readdir(dir)).filter((f) => f.endsWith(".ts"));
      for (const f of files) {
        const src = await readFile(path.join(dir, f), "utf8");
        const hasUmask = /umask 022/.test(src);

        // Vendor installers that write keyrings internally must run under
        // umask 022 — their keyring paths never appear in our source.
        if (VENDOR_INSTALLER.test(src) && !hasUmask) {
          violations.push(
            `${path.basename(dir)}/${f}: pipes a vendor install script that writes apt ` +
              `keyrings, without a leading \`umask 022\`. Under umask 077 the keyring ` +
              `lands mode 0600 → apt-get update exits 100.`,
          );
        }

        if (!KEYRING_WRITE.test(src)) continue;
        const keyrings = new Set<string>();
        for (const m of src.matchAll(KEYRING_PATH)) keyrings.add(m[1]!);

        for (const name of keyrings) {
          const escaped = name.replace(/[.-]/g, "\\$&");
          const chmodForFile = new RegExp(
            `chmod\\s+(?:go\\+r|g\\+r,o\\+r|o\\+r,g\\+r|a\\+r|\\+r|0?644)\\s+\\/usr\\/share\\/keyrings\\/${escaped}\\b`,
          );
          if (!chmodForFile.test(src) && !hasUmask) {
            violations.push(
              `${path.basename(dir)}/${f}: writes /usr/share/keyrings/${name} without ` +
                `chmod (go+r|a+r|644) or umask 022. Under umask 077 the keyring lands ` +
                `mode 0600 → apt-get update exits 100.`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
