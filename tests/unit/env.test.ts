import { describe, test, expect } from "bun:test";
import { parseRepoUrl, ghFineGrainedTokenUrl, ghClassicTokenUrl } from "../../src/env.ts";

describe("parseRepoUrl", () => {
  test("https URL", () => {
    expect(parseRepoUrl("https://github.com/owner/repo")).toEqual({
      owner: "owner",
      name: "repo",
      slug: "repo",
    });
  });

  test("https URL with .git suffix", () => {
    expect(parseRepoUrl("https://github.com/owner/repo.git")).toEqual({
      owner: "owner",
      name: "repo",
      slug: "repo",
    });
  });

  test("https URL with trailing slash", () => {
    expect(parseRepoUrl("https://github.com/owner/repo/")).toEqual({
      owner: "owner",
      name: "repo",
      slug: "repo",
    });
  });

  test("ssh URL", () => {
    expect(parseRepoUrl("git@github.com:owner/repo.git")).toEqual({
      owner: "owner",
      name: "repo",
      slug: "repo",
    });
  });

  test("shorthand owner/repo", () => {
    expect(parseRepoUrl("owner/repo")).toEqual({
      owner: "owner",
      name: "repo",
      slug: "repo",
    });
  });

  test("trims whitespace", () => {
    expect(parseRepoUrl("  https://github.com/owner/repo  ")).toEqual({
      owner: "owner",
      name: "repo",
      slug: "repo",
    });
  });

  test("rejects gibberish", () => {
    expect(parseRepoUrl("not-a-url")).toBeNull();
  });

  test("rejects empty string", () => {
    expect(parseRepoUrl("")).toBeNull();
  });

  test("rejects non-github hosts", () => {
    expect(parseRepoUrl("https://gitlab.com/owner/repo")).toBeNull();
  });
});

describe("ghFineGrainedTokenUrl", () => {
  test("read access scopes contents+PRs to read", () => {
    const url = ghFineGrainedTokenUrl({
      name: "devbox-myrepo",
      description: "test",
      ownerLogin: "octocat",
      access: "read",
    });
    const params = new URL(url).searchParams;
    expect(params.get("contents")).toBe("read");
    expect(params.get("pull_requests")).toBe("read");
    expect(params.get("target_name")).toBe("octocat");
    expect(params.get("name")).toBe("devbox-myrepo");
    expect(params.get("description")).toBe("test");
    expect(params.get("metadata")).toBe("read");
  });

  test("write access scopes contents+PRs to write", () => {
    const url = ghFineGrainedTokenUrl({
      name: "devbox-myrepo",
      description: "test",
      ownerLogin: "octocat",
      access: "write",
    });
    const params = new URL(url).searchParams;
    expect(params.get("contents")).toBe("write");
    expect(params.get("pull_requests")).toBe("write");
  });

  test("URL points at github.com fine-grained token form", () => {
    const url = ghFineGrainedTokenUrl({
      name: "n",
      description: "d",
      ownerLogin: "o",
      access: "read",
    });
    expect(url.startsWith("https://github.com/settings/personal-access-tokens/new?")).toBe(true);
  });

  test("URL-encodes special chars in description", () => {
    const url = ghFineGrainedTokenUrl({
      name: "n",
      description: "has space & ampersand",
      ownerLogin: "o",
      access: "read",
    });
    const params = new URL(url).searchParams;
    expect(params.get("description")).toBe("has space & ampersand");
  });
});

describe("ghClassicTokenUrl", () => {
  test("scopes string contains repo and read:org", () => {
    const url = ghClassicTokenUrl({ name: "test" });
    const params = new URL(url).searchParams;
    expect(params.get("scopes")).toBe("repo,read:org");
    expect(params.get("description")).toBe("test");
  });
});
