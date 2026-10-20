import { describe, expect, it } from "vitest";

import {
  createHeadingIdSequence,
  extractMarkdownHeadings,
  prepareWikiMarkdown,
  transformObsidianLinks,
} from "../src/lib/markdown";
import { decodeSlugParts, slugFromFileName, titleFromFileName } from "../src/lib/wiki";

describe("wiki helpers", () => {
  it("builds stable slugs from file names", () => {
    expect(slugFromFileName("LLM Knowledge Bases.md")).toBe("LLM%20Knowledge%20Bases");
    expect(slugFromFileName("slides/The Algorithm - Slides.md")).toBe(
      "slides/The%20Algorithm%20-%20Slides",
    );
    expect(titleFromFileName("LLM Knowledge Bases.md")).toBe("LLM Knowledge Bases");
    expect(titleFromFileName("slides/The Algorithm - Slides.md")).toBe("The Algorithm - Slides");
  });

  it("converts obsidian wikilinks into internal markdown links", () => {
    expect(transformObsidianLinks("See [[LLMs]] and [[Andrej Karpathy|Karpathy]].")).toBe(
      "See [LLMs](/wiki/LLMs) and [Karpathy](/wiki/Andrej%20Karpathy).",
    );
    expect(transformObsidianLinks("Deck: [[slides/The Algorithm - Slides]].")).toBe(
      "Deck: [slides/The Algorithm - Slides](/wiki/slides/The%20Algorithm%20-%20Slides).",
    );
  });

  it("extracts unique, readable heading ids and skips code blocks", () => {
    const headings = extractMarkdownHeadings(
      [
        "## Estado actual",
        "```markdown",
        "## Estado actual",
        "## Log",
        "```",
        "## Configuración `aplicada` (2026-10-18)",
        "~~~",
        "# Not a heading",
        "~~~",
        "### Estado actual ##",
      ].join("\n"),
    );

    expect(headings).toEqual([
      { text: "Estado actual", id: "estado-actual", level: 2 },
      { text: "Configuración aplicada (2026-10-18)", id: "configuración-aplicada-2026-10-18", level: 2 },
      { text: "Estado actual", id: "estado-actual-1", level: 3 },
    ]);
  });

  it("numbers repeated heading ids in document order", () => {
    const nextId = createHeadingIdSequence();
    expect(["Intro", "Intro", "intro!", "★"].map(nextId)).toEqual(["intro", "intro-1", "intro-2", "section"]);
  });

  it("decodes nested slug parts safely", () => {
    expect(decodeSlugParts(["slides", "The%20Algorithm%20-%20Slides"])).toEqual([
      "slides",
      "The Algorithm - Slides",
    ]);
  });

  it("prepares markdown once for article rendering", () => {
    expect(
      prepareWikiMarkdown(
        "---\n" +
          "tags:\n" +
          "  - demo\n" +
          "---\n\n" +
          "# Title\n\nSee [[LLMs]].\n\n## Deep Dive\n\n```ts\nconst x = 1;\n```",
      ),
    ).toEqual({
      contentMarkdown:
        "See [LLMs](/wiki/LLMs).\n\n## Deep Dive\n\n```ts\nconst x = 1;\n```",
      hasCodeBlocks: true,
      headings: [
        {
          text: "Deep Dive",
          id: "deep-dive",
          level: 2,
        },
      ],
    });
  });
});
