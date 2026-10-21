import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { HomepageData, PageSummary } from "./wiki-shared";

const run = promisify(execFile);

export interface GitFileActivity {
  addedAt: number;
  updatedAt: number;
  subject: string;
}

export interface GitActivity {
  lastCommit: { at: number; subject: string } | null;
  files: Map<string, GitFileActivity>;
}

export const GIT_LOG_FORMAT = "--format=%x1e%ct%x1f%s";

/**
 * Parses `git log --format=%x1e%ct%x1f%s --name-status --no-renames` (newest commit first):
 * the first commit that lists a file is its last update, the oldest one is when it was added.
 */
export function parseGitLog(output: string): GitActivity {
  const files = new Map<string, GitFileActivity>();
  let lastCommit: GitActivity["lastCommit"] = null;

  for (const block of output.split("\x1e").slice(1)) {
    const [header, ...lines] = block.split("\n");
    const [timestamp, subject = ""] = header.split("\x1f");
    const at = Number(timestamp) * 1000;
    lastCommit ??= { at, subject };

    for (const line of lines) {
      const file = line.split("\t")[1];
      if (!file) continue;
      const entry = files.get(file);
      if (entry) entry.addedAt = at;
      else files.set(file, { addedAt: at, updatedAt: at, subject });
    }
  }

  return { lastCommit, files };
}

let cache: { key: string; activity: GitActivity } | null = null;

/** Git history of the vault, cached per HEAD. Null when the vault isn't a git repo or git is missing. */
export async function readGitActivity(root: string): Promise<GitActivity | null> {
  const git = async (...args: string[]) =>
    (
      await run("git", ["-c", "safe.directory=*", "-c", "core.quotePath=false", "-C", root, ...args], {
        maxBuffer: 64 * 1024 * 1024,
      })
    ).stdout;

  try {
    const key = `${root}\n${(await git("rev-parse", "HEAD")).trim()}`;
    if (cache?.key !== key) {
      // --relative: paths relative to the vault even when it's a subfolder of the repo
      const log = await git("log", GIT_LOG_FORMAT, "--name-status", "--no-renames", "--relative");
      cache = { key, activity: parseGitLog(log) };
    }
    return cache.activity;
  } catch {
    return null; // not a git repo, or git isn't installed: keep file mtimes
  }
}

// ponytail: LLM-wiki catalog and changelog are touched by nearly every commit, so they'd always
// top "recent"; make this configurable if another vault has its own hub pages.
const HUB_FILES = new Set(["index.md", "log.md"]);

/** Re-dates the homepage's recent lists with git history (last commit and first commit per page). */
export function withGitActivity(
  homepage: HomepageData,
  pages: PageSummary[],
  activity: GitActivity,
  limit = 6,
): HomepageData {
  const dated = pages.flatMap((page) => {
    const entry = activity.files.get(page.file);
    if (!entry || HUB_FILES.has(page.file)) return [];
    return [{ ...page, modifiedAt: entry.updatedAt, addedAt: entry.addedAt, changeSummary: entry.subject }];
  });

  return {
    ...homepage,
    lastUpdate: activity.lastCommit,
    recentPages: [...dated].sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, limit),
    newPages: [...dated].sort((a, b) => b.addedAt - a.addedAt).slice(0, limit),
  };
}
