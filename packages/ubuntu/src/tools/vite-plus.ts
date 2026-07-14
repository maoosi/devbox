import { setupVitePlus } from "@devbox/core";
import { LocalExecutor } from "../executor.ts";
import type { Tool } from "./index.ts";

const tool: Tool = {
  id: "vite-plus",
  label: "Vite+ (unified JS toolchain)",
  default: true,
  required: false,
  async run() {
    return setupVitePlus(new LocalExecutor());
  },
};

export default tool;
