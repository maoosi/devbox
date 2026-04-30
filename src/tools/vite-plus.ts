import { sh } from "../exec.ts";
import type { Tool } from "./index.ts";

const tool: Tool = {
  id: "vite-plus",
  label: "Vite+ (unified JS toolchain)",
  default: true,
  required: false,
  async run() {
    await sh("curl -fsSL https://vite.plus | bash", { quiet: true });
  },
};

export default tool;
