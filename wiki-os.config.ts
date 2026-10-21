import type { WikiOsConfigInput } from "./src/lib/wiki-config";

const config: WikiOsConfigInput = {
  siteTitle: "WikiOS",
  tagline: "Plug-and-play Obsidian wiki for search, browsing, and local knowledge graphs.",
  searchPlaceholder: "Search notes, ideas, and people...",
  homepage: {
    labels: {
      featured: "Discover",
      topConnected: "Most Connected",
      people: "People",
      recentPages: "Recent Activity",
    },
  },
  categories: {
    // This vault's project tag and project folder are the same group: show one category.
    aliases: {
      proyecto: { label: "Proyectos" },
    },
    // index.md has no folder or tag, so it gets a guessed topic from its most frequent word.
    hidden: ["actualizado"],
  },
  people: {
    mode: "explicit",
  },
};

export default config;
