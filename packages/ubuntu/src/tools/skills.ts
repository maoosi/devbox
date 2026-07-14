import { setupSkills } from "@devbox/core";
import { LocalExecutor } from "../executor.ts";
import type { Tool } from "./index.ts";

// Bundled Claude Code skills, shipped from @devbox/core's templates. Existing
// (possibly user-edited) skills are never overwritten on re-run.
const tool: Tool = {
  id: "skills",
  label: "Skills",
  hint: "code-review, code-simplify, code-checklist, code-changelog",
  default: true,
  required: false,
  async run() {
    return setupSkills(new LocalExecutor());
  },
};

export default tool;
