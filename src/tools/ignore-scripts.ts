import * as fs from "node:fs/promises";
import * as path from "node:path";
import { run } from "../exec.ts";
import { HOME } from "../env.ts";
import type { Tool } from "./index.ts";

// Block install-time exfil from postinstall scripts. This pairs with Socket Firewall.
const tool: Tool = {
  id: "ignore-scripts",
  label: "ignore-scripts (block postinstall scripts)",
  default: true,
  required: true,
  async run() {
    await run("npm", ["config", "set", "ignore-scripts", "true"], { quiet: true });
    await run("pnpm", ["config", "set", "ignore-scripts", "true"], { quiet: true, allowFail: true });

    const bunfig = path.join(HOME, ".bunfig.toml");
    let body = "";
    try {
      body = await fs.readFile(bunfig, "utf8");
    } catch {
      /* fresh VM */
    }
    if (!/ignoreScripts\s*=\s*true/m.test(body)) {
      const sep = body && !body.endsWith("\n") ? "\n" : "";
      await fs.writeFile(bunfig, body + sep + "[install]\nignoreScripts = true\n");
    }
  },
};

export default tool;
