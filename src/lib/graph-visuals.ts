/** Pure helpers for the graph view (grouping, colors, seed positions). */

export const ROOT_GROUP = "Root";

/** Distinct, soft colors that read on the light background, in assignment order. */
export const GROUP_PALETTE = [
  "#6fb3c9", // teal
  "#f2a07b", // peach
  "#b18fe0", // lavender
  "#7fbf95", // sage
  "#e5859a", // rose
  "#d6b04e", // ochre
  "#7d9de0", // periwinkle
  "#c49a74", // clay
];

/** Top-level folder of a page slug ("Research/media-server" → "Research"), or "Root". */
export function folderGroup(slug: string): string {
  const slash = slug.indexOf("/");
  if (slash === -1) return ROOT_GROUP;
  const part = slug.slice(0, slash);
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/**
 * Assigns a palette color to each group: biggest groups first so they get the most distinct
 * colors, "Root" last. Colors repeat if there are more groups than palette entries.
 */
export function assignGroupColors(groupSizes: Map<string, number>): Map<string, string> {
  const ordered = [...groupSizes.entries()].sort(
    ([a, sizeA], [b, sizeB]) =>
      Number(a === ROOT_GROUP) - Number(b === ROOT_GROUP) || sizeB - sizeA || a.localeCompare(b),
  );
  return new Map(ordered.map(([group], i) => [group, GROUP_PALETTE[i % GROUP_PALETTE.length]]));
}

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Linear blend of two #rrggbb colors; t=0 → a, t=1 → b. Returns `a` unchanged if either can't be parsed. */
export function mixColor(a: string, b: string, t: number): string {
  const from = parseHex(a);
  const to = parseHex(b);
  if (!from || !to) return a;
  const k = Math.min(1, Math.max(0, t));
  const [r, g, bl] = from.map((channel, i) => Math.round(channel + (to[i] - channel) * k));
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

/**
 * Starting positions for the entrance animation: each group starts as a small cloud on its own
 * spot of a circle, so the layout visibly "blooms" out of folder clusters.
 */
export function seedPosition(groupIndex: number, groupCount: number, random: () => number = Math.random) {
  const angle = (2 * Math.PI * groupIndex) / Math.max(1, groupCount);
  const radius = groupCount > 1 ? 1 : 0;
  return {
    x: Math.cos(angle) * radius + (random() - 0.5) * 0.4,
    y: Math.sin(angle) * radius + (random() - 0.5) * 0.4,
  };
}
