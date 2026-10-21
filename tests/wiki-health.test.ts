import { describe, expect, it } from "vitest";

import {
  buildHealthReport,
  createLinkResolver,
  extractLinkTargets,
  isAttachmentTarget,
  type HealthPage,
} from "../src/lib/wiki-health";

const page = (file: string, markdown = "", modifiedAt = 0): HealthPage => ({
  file,
  slug: file.replace(/\.md$/, ""),
  title: file,
  markdown,
  modifiedAt,
});

describe("wiki health", () => {
  it("resolves links like Obsidian: exact path, any casing, unique file name", () => {
    const resolve = createLinkResolver(["Research/home-server.md", "Projects/GardenPlan.md", "a/dup.md", "b/dup.md"]);
    expect(resolve("Research/home-server")).toBe("Research/home-server.md");
    expect(resolve("projects/gardenplan")).toBe("Projects/GardenPlan.md");
    expect(resolve("home-server")).toBe("Research/home-server.md");
    expect(resolve("GardenPlan.md")).toBe("Projects/GardenPlan.md");
    expect(resolve("dup")).toBeNull(); // ambiguous
    expect(resolve("missing")).toBeNull();
  });

  it("skips code, same-page anchors and the heading part of a link", () => {
    const markdown = [
      "See [[a]], [[b#Section|label]] and [[#Local]].",
      "Example: `[[raw/<slug>]]`",
      "```",
      "[[inside-fence]]",
      "```",
      "And [[sources/c]].",
    ].join("\n");
    expect(extractLinkTargets(markdown)).toEqual(["a", "b", "c"]);
    expect(isAttachmentTarget("raw/photo.png")).toBe(true);
    expect(isAttachmentTarget("notes.md")).toBe(false);
    expect(isAttachmentTarget("Research/v1.2 plan")).toBe(false);
  });

  it("reports broken links, orphans and the least recently updated pages", () => {
    const day = 86_400_000;
    const now = 1000 * day;
    const report = buildHealthReport(
      [
        page("index.md", "[[a]] [[b]]", now),
        page("a.md", "[[b]] [[gone]] [[gone]] [[raw/ok.png]] [[raw/lost.pdf]] [[a]]", now - 200 * day),
        page("b.md", "", now - 10 * day),
        page("lonely.md", "[[a]]", now - 5 * day),
      ],
      { attachmentExists: (target) => target === "raw/ok.png", updatedAt: (p) => p.modifiedAt, now, staleDays: 90 },
    );
    expect(report.brokenLinks.map((link) => link.target)).toEqual(["gone", "raw/lost.pdf"]);
    expect(report.orphans.map((o) => o.slug)).toEqual(["lonely"]); // index is a hub; a links to itself only
    expect(report.leastUpdated.map((p) => [p.slug, p.stale])).toEqual([
      ["a", true],
      ["b", false],
      ["lonely", false],
    ]);
  });
});

describe("category heuristics", () => {
  it("can stop guessing topics for pages with no folder or tag", async () => {
    const { deriveCategoryNames } = await import("../src/lib/wiki-classification");
    const { resolveWikiOsConfig } = await import("../src/lib/wiki-config");
    const text = "Kubernetes cluster notes. Kubernetes upgrades, Kubernetes nodes.";
    expect(deriveCategoryNames("root.md", "Root", text, {}, resolveWikiOsConfig({})).length).toBeGreaterThan(0);
    expect(
      deriveCategoryNames("root.md", "Root", text, {}, resolveWikiOsConfig({ categories: { heuristic: false } })),
    ).toEqual([]);
    expect(
      deriveCategoryNames("Research/x.md", "X", text, {}, resolveWikiOsConfig({ categories: { heuristic: false } })),
    ).toEqual(["Research"]);
  });
});
