import { describe, expect, it } from "vitest";

import {
  GROUP_PALETTE,
  ROOT_GROUP,
  assignGroupColors,
  folderGroup,
  mixColor,
  seedPosition,
} from "../src/lib/graph-visuals";

describe("graph visuals", () => {
  it("groups pages by top-level folder", () => {
    expect(folderGroup("Research/media-server")).toBe("Research");
    expect(folderGroup("docs/plans/2026-plan")).toBe("docs");
    expect(folderGroup("Deep%20Dive/x")).toBe("Deep Dive");
    expect(folderGroup("index")).toBe(ROOT_GROUP);
  });

  it("gives the biggest groups the first colors and Root the last", () => {
    const colors = assignGroupColors(
      new Map([
        [ROOT_GROUP, 5],
        ["docs", 2],
        ["Research", 7],
        ["Projects", 5],
      ]),
    );
    expect([...colors.keys()]).toEqual(["Research", "Projects", "docs", ROOT_GROUP]);
    expect(colors.get("Research")).toBe(GROUP_PALETTE[0]);
    expect(colors.get(ROOT_GROUP)).toBe(GROUP_PALETTE[3]);
  });

  it("blends hex colors and clamps t", () => {
    expect(mixColor("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixColor("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixColor("#000000", "#ffffff", 2)).toBe("#ffffff");
    expect(mixColor("red", "#ffffff", 0.5)).toBe("red");
  });

  it("seeds each group on its own spot of a circle", () => {
    const center = () => 0.5; // no jitter
    expect(seedPosition(0, 4, center)).toEqual({ x: 1, y: 0 });
    const opposite = seedPosition(2, 4, center);
    expect(opposite.x).toBeCloseTo(-1);
    expect(opposite.y).toBeCloseTo(0);
    expect(seedPosition(0, 1, center)).toEqual({ x: 0, y: 0 });
  });
});
