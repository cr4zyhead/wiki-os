export interface FileTreePage {
  slug: string;
  title: string;
}

export interface FileTreeFolder {
  name: string;
  /** Decoded folder path, e.g. "Research/Sub". The root folder has path "". */
  path: string;
  folders: FileTreeFolder[];
  pages: FileTreePage[];
  /** Number of pages in this folder and all of its subfolders. */
  count: number;
}

function decodePart(part: string) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/** Decoded folder paths that contain the page, outermost first. */
export function folderPathsForSlug(slug: string): string[] {
  const parts = slug.split("/").filter(Boolean).map(decodePart);
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
}

function sortTree(folder: FileTreeFolder) {
  folder.folders.sort((a, b) => a.name.localeCompare(b.name));
  folder.pages.sort((a, b) => a.title.localeCompare(b.title));
  folder.folders.forEach(sortTree);
}

/**
 * Builds a folder tree from page slugs (slug parts are URI-encoded file path parts).
 * An optional query keeps only pages whose title or path contains it, and drops empty folders.
 */
export function buildFileTree(pages: FileTreePage[], query = ""): FileTreeFolder {
  const root: FileTreeFolder = { name: "", path: "", folders: [], pages: [], count: 0 };
  const needle = query.trim().toLowerCase();

  for (const page of pages) {
    const folderPaths = folderPathsForSlug(page.slug);
    if (needle) {
      const haystack = `${page.title}\n${decodePart(page.slug)}`.toLowerCase();
      if (!haystack.includes(needle)) continue;
    }

    let node = root;
    node.count++;
    for (const path of folderPaths) {
      let child = node.folders.find((folder) => folder.path === path);
      if (!child) {
        child = { name: path.split("/").pop() ?? path, path, folders: [], pages: [], count: 0 };
        node.folders.push(child);
      }
      child.count++;
      node = child;
    }
    node.pages.push(page);
  }

  sortTree(root);
  return root;
}
