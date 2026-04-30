import { describe, test, expect } from "bun:test";
import { selectTools, type Tool } from "../../src/tools/index.ts";

const noop = async () => {};

const fixture: Tool[] = [
  { id: "system",        label: "system",        default: true,  required: true,  run: noop },
  { id: "runtimes",      label: "runtimes",      default: true,  required: true,  run: noop },
  { id: "github",        label: "github",        default: true,  required: true,  run: noop },
  { id: "doppler",       label: "doppler",       default: true,  required: false, run: noop },
  { id: "infisical",     label: "infisical",     default: false, required: false, run: noop },
  { id: "agent-browser", label: "agent-browser", default: true,  required: false, run: noop },
  { id: "socket",        label: "socket",        default: true,  required: false, run: noop },
  { id: "vite-plus",     label: "vite-plus",     default: true,  required: false, run: noop },
  { id: "ignore-scripts",label: "ignore-scripts",default: true,  required: true,  run: noop },
  { id: "mcp",           label: "mcp",           default: true,  required: true,  run: noop },
  { id: "repo",          label: "repo",          default: true,  required: true,  run: noop },
  { id: "claude",        label: "claude",        default: true,  required: true,  run: noop },
];

const ids = (ts: Tool[]) => ts.map((t) => t.id);

describe("selectTools", () => {
  test("required tools are always included, even with empty pickedIds", () => {
    const out = selectTools(fixture, new Set(), "none");
    const required = fixture.filter((t) => t.required).map((t) => t.id);
    for (const id of required) expect(ids(out)).toContain(id);
  });

  test("preserves canonical ordering from input list", () => {
    const out = selectTools(fixture, new Set(["socket", "vite-plus"]), "doppler");
    const positions = ids(out).map((id) => fixture.findIndex((t) => t.id === id));
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);
  });

  test("doppler chosen → doppler in, infisical out", () => {
    const out = selectTools(fixture, new Set(), "doppler");
    expect(ids(out)).toContain("doppler");
    expect(ids(out)).not.toContain("infisical");
  });

  test("infisical chosen → infisical in, doppler out", () => {
    const out = selectTools(fixture, new Set(), "infisical");
    expect(ids(out)).toContain("infisical");
    expect(ids(out)).not.toContain("doppler");
  });

  test("none chosen → neither doppler nor infisical", () => {
    const out = selectTools(fixture, new Set(), "none");
    expect(ids(out)).not.toContain("doppler");
    expect(ids(out)).not.toContain("infisical");
  });

  test("infisical chosen → doppler excluded even if accidentally in pickedIds", () => {
    const out = selectTools(fixture, new Set(["doppler"]), "infisical");
    expect(ids(out)).not.toContain("doppler");
    expect(ids(out)).toContain("infisical");
  });

  test("optional tools appear iff in pickedIds", () => {
    const empty = selectTools(fixture, new Set(), "none");
    expect(ids(empty)).not.toContain("socket");
    expect(ids(empty)).not.toContain("vite-plus");
    expect(ids(empty)).not.toContain("agent-browser");

    const some = selectTools(fixture, new Set(["socket", "vite-plus"]), "none");
    expect(ids(some)).toContain("socket");
    expect(ids(some)).toContain("vite-plus");
    expect(ids(some)).not.toContain("agent-browser");
  });
});
