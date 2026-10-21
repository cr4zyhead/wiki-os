/** Wiki health: Obsidian-style link resolution, broken links, orphan pages and least recently updated pages. */

import { HUB_FILES } from "./git-activity";
import type { WikiHealthReport } from "./wiki-shared";

const withoutMd = (file: string) => file.replace(/\.md$/i, "");
const basename = (file: string) => file.slice(file.lastIndexOf("/") + 1);

/**
 * Resolves a `[[target]]` to a page file like Obsidian does: exact path, then the same path
 * ignoring case, then the file name alone when only one page has it.
 */
export function createLinkResolver(files: string[]) {
  const exact = new Map(files.map((file) => [withoutMd(file), file]));
  const lower = new Map(files.map((file) => [withoutMd(file).toLowerCase(), file]));
  const byName = new Map<string, string[]>();
  for (const file of files) {
    const name = basename(withoutMd(file)).toLowerCase();
    byName.set(name, [...(byName.get(name) ?? []), file]);
  }

  return (target: string): string | null => {
    const key = withoutMd(target.trim());
    const sameName = byName.get(basename(key).toLowerCase());
    return exact.get(key) ?? lower.get(key.toLowerCase()) ?? (sameName?.length === 1 ? sameName[0] : null);
  };
}

/**
 * Link targets of a page, skipping code (examples like `[[raw/<slug>]]`), same-page anchors
 * (`[[#Section]]`) and the heading/block part of a target.
 */
export function extractLinkTargets(markdown: string): string[] {
  const prose = markdown.replace(/^(```|~~~)[\s\S]*?^\1/gm, "").replace(/`[^`\n]*`/g, "");
  const targets: string[] = [];
  for (const match of prose.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
    const target = match[1].split(/[#^]/)[0].trim().replace(/^sources\//, "");
    if (target) targets.push(target);
  }
  return targets;
}

/** A link to something other than a page (`raw/photo.png`, `report.pdf`). */
export const isAttachmentTarget = (target: string) => /\.(?!md$)[a-z0-9]{1,5}$/i.test(target.trim());

export interface HealthPage {
  file: string;
  slug: string;
  title: string;
  markdown: string;
  modifiedAt: number;
}

export function buildHealthReport(
  pages: HealthPage[],
  options: {
    attachmentExists: (target: string) => boolean;
    updatedAt: (page: HealthPage) => number;
    now?: number;
    staleDays?: number;
    limit?: number;
  },
): WikiHealthReport {
  const { attachmentExists, updatedAt, now = Date.now(), staleDays = 90, limit = 10 } = options;
  const resolve = createLinkResolver(pages.map((page) => page.file));
  const linked = new Set<string>();
  const brokenLinks: WikiHealthReport["brokenLinks"] = [];

  for (const page of pages) {
    const seen = new Set<string>();
    for (const target of extractLinkTargets(page.markdown)) {
      if (isAttachmentTarget(target)) {
        if (!attachmentExists(target) && !seen.has(target)) brokenLinks.push({ slug: page.slug, title: page.title, target });
        seen.add(target);
        continue;
      }
      const file = resolve(target);
      if (file && file !== page.file) linked.add(file);
      if (!file && !seen.has(target)) brokenLinks.push({ slug: page.slug, title: page.title, target });
      seen.add(target);
    }
  }

  const staleBefore = now - staleDays * 86_400_000;
  return {
    brokenLinks,
    orphans: pages
      .filter((page) => !linked.has(page.file) && !HUB_FILES.has(page.file))
      .map(({ slug, title }) => ({ slug, title })),
    leastUpdated: pages
      .filter((page) => !HUB_FILES.has(page.file))
      .map((page) => ({ slug: page.slug, title: page.title, updatedAt: updatedAt(page) }))
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .slice(0, limit)
      .map((page) => ({ ...page, stale: page.updatedAt < staleBefore })),
    staleDays,
  };
}
