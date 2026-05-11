import * as fs from "node:fs/promises";
import * as path from "node:path";
import { sh } from "../exec.ts";
import { home } from "../env.ts";
import type { Tool, ToolStatus } from "./index.ts";

const tool: Tool = {
  id: "vite-plus",
  label: "Vite+ (unified JS toolchain)",
  default: true,
  required: false,
  async run(): Promise<ToolStatus> {
    // Upstream installer appends `. "$HOME/.vite-plus/env"` to ~/.bashrc on
    // every run. Skip if the install marker is already there.
    try {
      await fs.access(path.join(home(), ".vite-plus"));
      return { kind: "reused", note: "~/.vite-plus already present" };
    } catch {
      /* not installed yet */
    }
    await sh("curl -fsSL https://vite.plus | bash", { quiet: true });
    return { kind: "installed" };
  },
};

export default tool;
