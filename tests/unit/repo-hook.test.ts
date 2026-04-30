import { describe, test, expect } from "bun:test";
import { prePushHook, shouldInstallHook } from "../../src/tools/repo.ts";

describe("shouldInstallHook", () => {
  test("read-only never installs (regardless of policy)", () => {
    expect(shouldInstallHook("read-only", { pushMain: false, deleteBranches: false })).toBe(false);
    expect(shouldInstallHook("read-only", { pushMain: true, deleteBranches: true })).toBe(false);
  });

  test("write + fully permissive policy: skip (nothing to enforce)", () => {
    expect(shouldInstallHook("write", { pushMain: true, deleteBranches: true })).toBe(false);
  });

  test("write + fully restrictive policy: install", () => {
    expect(shouldInstallHook("write", { pushMain: false, deleteBranches: false })).toBe(true);
  });

  test("write + partial restrictions: install", () => {
    expect(shouldInstallHook("write", { pushMain: true, deleteBranches: false })).toBe(true);
    expect(shouldInstallHook("write", { pushMain: false, deleteBranches: true })).toBe(true);
  });
});

describe("prePushHook", () => {
  test("starts with shell shebang", () => {
    const out = prePushHook({ pushMain: false, deleteBranches: false });
    expect(out.startsWith("#!/bin/sh\n")).toBe(true);
  });

  test("encodes pushMain=false → ALLOW_MAIN=0", () => {
    const out = prePushHook({ pushMain: false, deleteBranches: true });
    expect(out).toContain("ALLOW_MAIN=0");
    expect(out).toContain("ALLOW_DELETE=1");
  });

  test("encodes pushMain=true → ALLOW_MAIN=1", () => {
    const out = prePushHook({ pushMain: true, deleteBranches: false });
    expect(out).toContain("ALLOW_MAIN=1");
    expect(out).toContain("ALLOW_DELETE=0");
  });

  test("resolves default branch dynamically (handles main/master/trunk)", () => {
    const out = prePushHook({ pushMain: false, deleteBranches: false });
    expect(out).toContain("git symbolic-ref --short refs/remotes/origin/HEAD");
  });

  test("blocks branch deletion when not allowed", () => {
    const out = prePushHook({ pushMain: false, deleteBranches: false });
    expect(out).toContain("branch deletion is disabled");
  });

  test("blocks default-branch push when not allowed", () => {
    const out = prePushHook({ pushMain: false, deleteBranches: false });
    expect(out).toContain("direct push to $DEFAULT_BRANCH is disabled");
  });

  test("uses sentinel zero-SHA for delete detection", () => {
    const out = prePushHook({ pushMain: false, deleteBranches: false });
    expect(out).toContain("ZERO=0000000000000000000000000000000000000000");
  });
});
