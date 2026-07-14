import { setupSupplyChain } from "@devbox/core";
import { LocalExecutor } from "../executor.ts";
import type { Tool } from "./index.ts";

// Block install-time exfil from postinstall scripts. This pairs with Socket Firewall.
const tool: Tool = {
  id: "ignore-scripts",
  label: "ignore-scripts (block postinstall scripts)",
  default: true,
  required: true,
  async run() {
    return setupSupplyChain(new LocalExecutor());
  },
};

export default tool;
