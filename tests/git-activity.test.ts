import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  isCommitHash,
  isSafeVaultFile,
  parseGitLog,
  readFileDiff,
  readFileHistory,
  readGitActivity,
  withGitActivity,
} from "../src/lib/git-activity";
import type { HomepageData, PageSummary } from "../src/lib/wiki-shared";

const page = (file: string): PageSummary => ({
  file,
  slug: file.replace(/\.md$/, ""),
  title: file,
  summary: "",
  backlinkCount: 0,
  wordCount: 0,
  modifiedAt: 0,
});

describe("git activity", () => {
  it("takes the newest commit as last update and the oldest as added", () => {
    const log = [
      "\x1e300\x1fedit b\n\nM\tdocs/b.md\nM\tlog.md\n",
      "\x1e200\x1fadd b\n\nA\tdocs/b.md\nM\ta.md\n",
      "\x1e100\x1fadd a\n\nA\ta.md\n",
    ].join("");
    const activity = parseGitLog(log);
    expect(activity.lastCommit).toEqual({ at: 300_000, subject: "edit b" });
    expect(activity.files.get("docs/b.md")).toEqual({ addedAt: 200_000, updatedAt: 300_000, subject: "edit b" });
    expect(activity.files.get("a.md")).toEqual({ addedAt: 100_000, updatedAt: 200_000, subject: "add b" });
  });

  it("re-dates recent pages and leaves out the hub pages", () => {
    const activity = parseGitLog(
      "\x1e300\x1fedit a\n\nM\ta.md\nM\tindex.md\n\x1e200\x1fadd b\n\nA\tb.md\n\x1e100\x1fadd a\n\nA\ta.md\nA\tindex.md\n",
    );
    const homepage = { recentPages: [] } as unknown as HomepageData;
    const result = withGitActivity(homepage, [page("index.md"), page("a.md"), page("b.md"), page("untracked.md")], activity);
    expect(result.recentPages.map((p) => p.file)).toEqual(["a.md", "b.md"]);
    expect(result.recentPages[0].changeSummary).toBe("edit a");
    expect(result.newPages?.map((p) => p.file)).toEqual(["b.md", "a.md"]);
    expect(result.lastUpdate).toEqual({ at: 300_000, subject: "edit a" });
  });

  it("reads a real repo, with paths relative to a vault subfolder, and returns null outside git", async () => {
    const repo = mkdtempSync(path.join(tmpdir(), "wikios-git-"));
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", ...args]);
    git("init", "-q");
    mkdirSync(path.join(repo, "vault/Notas"), { recursive: true });
    writeFileSync(path.join(repo, "vault/Notas/árbol.md"), "# Árbol\n");
    git("add", ".");
    git("commit", "-qm", "primera nota");

    const activity = await readGitActivity(path.join(repo, "vault"));
    expect(activity?.lastCommit?.subject).toBe("primera nota");
    expect([...(activity?.files.keys() ?? [])]).toEqual(["Notas/árbol.md"]);
    expect(await readGitActivity(mkdtempSync(path.join(tmpdir(), "wikios-nogit-")))).toBeNull();
  });
});

describe("page history", () => {
  it("only accepts vault-relative markdown paths and hex hashes", () => {
    expect(isSafeVaultFile("Research/a b.md")).toBe(true);
    for (const bad of ["../etc/passwd.md", "a/../../b.md", "/abs.md", "--output=x.md", "a.txt", "a//b.md", 3]) {
      expect(isSafeVaultFile(bad)).toBe(false);
    }
    expect(isCommitHash("a1b2c3d")).toBe(true);
    expect(isCommitHash("HEAD")).toBe(false);
    expect(isCommitHash("a1b2c3d --stat")).toBe(false);
  });

  it("lists a page's commits and the diff of one of them", async () => {
    const repo = mkdtempSync(path.join(tmpdir(), "wikios-hist-"));
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", repo, "-c", "user.name=Ana", "-c", "user.email=a@a", ...args]).toString();
    git("init", "-q");
    writeFileSync(path.join(repo, "nota.md"), "uno\n");
    git("add", ".");
    git("commit", "-qm", "crea nota");
    writeFileSync(path.join(repo, "nota.md"), "uno\ndos\n");
    writeFileSync(path.join(repo, "otra.md"), "x\n");
    git("add", ".");
    git("commit", "-qm", "agrega dos");

    const history = await readFileHistory(repo, "nota.md");
    expect(history?.map((c) => [c.subject, c.author])).toEqual([
      ["agrega dos", "Ana"],
      ["crea nota", "Ana"],
    ]);
    const diff = await readFileDiff(repo, "nota.md", history![0].hash);
    expect(diff?.startsWith("@@")).toBe(true);
    expect(diff).toContain("+dos");
    expect(diff).not.toContain("otra.md");
  });
});
