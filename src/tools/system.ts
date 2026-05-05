import { run } from "../exec.ts";
import type { Tool } from "./index.ts";

const tool: Tool = {
  id: "system",
  label: "System packages",
  default: true,
  required: true,
  async run(ctx) {
    await run("sudo", ["apt-get", "update", "-qq"], { quiet: true });
    await run(
      "sudo",
      [
        "env",
        "DEBIAN_FRONTEND=noninteractive",
        "apt-get",
        "install",
        "-y",
        "-qq",
        "build-essential",
        "curl",
        "wget",
        "ca-certificates",
        "gnupg",
        "lsb-release",
        "software-properties-common",
        "apt-transport-https",
        "zip",
        "git",
        "jq",
      ],
      { quiet: true },
    );
    ctx.aliases.push(`alias cls="clear"`);
  },
};

export default tool;
