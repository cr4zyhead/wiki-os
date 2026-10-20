import { describe, expect, it } from "vitest";

import { prepareWikiMarkdown, transformObsidianLinks } from "../src/lib/markdown";
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

  it("uses the leading H1 as the page title", () => {
    expect(prepareWikiMarkdown("# Trip *notes*: [[Travel/packing|packing list]]\n\nBody").title).toBe(
      "Trip notes: packing list",
    );
    expect(prepareWikiMarkdown("Intro\n\n# Not a title").title).toBeUndefined();
    expect(prepareWikiMarkdown("## Only h2").title).toBeUndefined();
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
      title: "Title",
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
