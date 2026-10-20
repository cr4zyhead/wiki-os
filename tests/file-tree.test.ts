import { describe, expect, it } from "vitest";

import { buildFileTree, folderPathsForSlug } from "../src/lib/file-tree";

const pages = [
  { slug: "index", title: "Index" },
  { slug: "Research/home-server", title: "Home server" },
  { slug: "Research/Deep%20Dive/reading-list", title: "Reading list" },
  { slug: "Projects/garden", title: "Garden" },
  { slug: "Research/media-server", title: "Media server" },
];

describe("file tree", () => {
  it("groups pages by folder with counts and sorted entries", () => {
    const tree = buildFileTree(pages);

    expect(tree.count).toBe(5);
    expect(tree.pages.map((p) => p.slug)).toEqual(["index"]);
    expect(tree.folders.map((f) => [f.name, f.count])).toEqual([
      ["Projects", 1],
      ["Research", 3],
    ]);

    const research = tree.folders[1];
    expect(research.pages.map((p) => p.title)).toEqual(["Home server", "Media server"]);
    expect(research.folders[0]).toMatchObject({ name: "Deep Dive", path: "Research/Deep Dive", count: 1 });
  });

  it("filters by title or path and drops empty folders", () => {
    const byTitle = buildFileTree(pages, "reading");
    expect(byTitle.count).toBe(1);
    expect(byTitle.folders.map((f) => f.name)).toEqual(["Research"]);

    const byPath = buildFileTree(pages, "projects/");
    expect(byPath.folders.map((f) => f.name)).toEqual(["Projects"]);

    expect(buildFileTree(pages, "nothing matches").folders).toEqual([]);
  });

  it("lists the decoded ancestor folders of a slug", () => {
    expect(folderPathsForSlug("Research/Deep%20Dive/reading-list")).toEqual([
      "Research",
      "Research/Deep Dive",
    ]);
    expect(folderPathsForSlug("index")).toEqual([]);
  });
});
