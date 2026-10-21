import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, FileText, Folder, FolderOpen, X } from "lucide-react";

import { fetchJson } from "@/client/api";
import { useUnread } from "@/client/unread";
import { buildFileTree, folderPathsForSlug, type FileTreeFolder, type FileTreePage } from "@/lib/file-tree";

const EXPANDED_KEY = "wiki-os:file-tree-expanded";

// ponytail: reuses /api/graph (already loaded by the graph view) instead of a dedicated
// page-list endpoint; add one if graph payloads get heavy on very large vaults.
let pagesPromise: Promise<FileTreePage[]> | null = null;

function loadPages() {
  pagesPromise ??= fetchJson<{ nodes: FileTreePage[] }>("/api/graph")
    .then((data) => data.nodes.map(({ slug, title }) => ({ slug, title })))
    .catch((error: unknown) => {
      pagesPromise = null;
      throw error;
    });
  return pagesPromise;
}

function readExpanded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) || "[]") as string[]);
  } catch {
    return new Set();
  }
}

function writeExpanded(expanded: Set<string>) {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
  } catch {
    // Storage can be unavailable (private mode); the tree still works for this visit.
  }
}

/** Expanded-folder state for the tree, remembered per browser. The current page's folders always open. */
export function useFileTreeState(currentSlug: string) {
  const [expanded, setExpanded] = useState(readExpanded);

  useEffect(() => {
    setExpanded((previous) => {
      const ancestors = folderPathsForSlug(currentSlug);
      if (ancestors.every((path) => previous.has(path))) return previous;
      const next = new Set([...previous, ...ancestors]);
      writeExpanded(next);
      return next;
    });
  }, [currentSlug]);

  const setFolder = useCallback((path: string, open: boolean) => {
    setExpanded((previous) => {
      if (previous.has(path) === open) return previous;
      const next = new Set(previous);
      if (open) next.add(path);
      else next.delete(path);
      writeExpanded(next);
      return next;
    });
  }, []);

  return { expanded, setFolder };
}

function UnreadDot({ label }: { label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="h-1.5 w-1.5 shrink-0 self-center rounded-full bg-[var(--teal)] shadow-[0_0_8px_var(--teal)]"
    />
  );
}

function folderHasUnread(folder: FileTreeFolder, isUnread: (slug: string) => boolean): boolean {
  return folder.pages.some((page) => isUnread(page.slug)) || folder.folders.some((child) => folderHasUnread(child, isUnread));
}

function TreeFolder({
  folder,
  depth,
  currentSlug,
  isOpen,
  setFolder,
  onNavigate,
}: {
  folder: FileTreeFolder;
  depth: number;
  currentSlug: string;
  isOpen: (path: string) => boolean;
  setFolder: (path: string, open: boolean) => void;
  onNavigate?: () => void;
}) {
  const indent = { paddingLeft: `${depth * 0.9 + 0.5}rem` };
  const { isUnread } = useUnread();

  return (
    <ul>
      {folder.folders.map((child) => {
        const open = isOpen(child.path);
        const Icon = open ? FolderOpen : Folder;
        return (
          <li key={child.path}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setFolder(child.path, !open)}
              className="flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm text-[var(--foreground)] transition-colors duration-150 hover:bg-[var(--secondary)]"
              style={indent}
            >
              <ChevronRight
                aria-hidden
                className={`h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)] transition-transform duration-150 ${open ? "rotate-90" : ""}`}
              />
              <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
              <span className="min-w-0 flex-1 truncate">{child.name}</span>
              {folderHasUnread(child, isUnread) && <UnreadDot label="Has pages changed since your last visit" />}
              <span className="text-[11px] tabular-nums text-[var(--muted-foreground)]">{child.count}</span>
            </button>
            {open && (
              <TreeFolder
                folder={child}
                depth={depth + 1}
                currentSlug={currentSlug}
                isOpen={isOpen}
                setFolder={setFolder}
                onNavigate={onNavigate}
              />
            )}
          </li>
        );
      })}
      {folder.pages.map((page) => {
        const active = page.slug === currentSlug;
        return (
          <li key={page.slug}>
            <Link
              to={`/wiki/${page.slug}`}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              title={page.title}
              className={`flex items-start gap-2 rounded-md py-1.5 pr-2 text-sm leading-snug transition-colors duration-150 ${
                active
                  ? "bg-[var(--secondary)] font-medium text-[var(--foreground)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
              }`}
              style={{ paddingLeft: `${depth * 0.9 + 1.6}rem` }}
            >
              <FileText aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />
              <span className="min-w-0 flex-1 break-words">{page.title}</span>
              {!active && isUnread(page.slug) && <UnreadDot label="Changed since your last visit" />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Obsidian-style folder tree of every page in the vault, with a filter box. */
export function FileTree({
  currentSlug,
  expanded,
  setFolder,
  onNavigate,
}: {
  currentSlug: string;
  expanded: Set<string>;
  setFolder: (path: string, open: boolean) => void;
  onNavigate?: () => void;
}) {
  const [pages, setPages] = useState<FileTreePage[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadPages().then(
      (loaded) => !cancelled && setPages(loaded),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const tree = useMemo(() => (pages ? buildFileTree(pages, query) : null), [pages, query]);
  // While filtering, every folder with a match is shown open.
  const filtering = query.trim().length > 0;
  const isOpen = useCallback((path: string) => filtering || expanded.has(path), [filtering, expanded]);

  return (
    <nav aria-label="Pages" className="text-sm">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter pages…"
        aria-label="Filter pages"
        className="mb-3 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--muted-foreground)]"
      />
      {failed && <p className="px-2 text-xs text-[var(--muted-foreground)]">Could not load pages.</p>}
      {!failed && !tree && <p className="px-2 text-xs text-[var(--muted-foreground)]">Loading…</p>}
      {tree && tree.count === 0 && (
        <p className="px-2 text-xs text-[var(--muted-foreground)]">No pages match.</p>
      )}
      {tree && (
        <TreeFolder
          folder={tree}
          depth={0}
          currentSlug={currentSlug}
          isOpen={isOpen}
          setFolder={setFolder}
          onNavigate={onNavigate}
        />
      )}
    </nav>
  );
}

/** Slide-in panel holding the tree on screens too narrow for the sidebar. */
export function FileTreeDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Pages">
      <button type="button" aria-label="Close pages" onClick={onClose} className="absolute inset-0 bg-black/20" />
      <div className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col bg-[var(--background)] shadow-xl">
        <div className="flex items-center justify-between px-4 pb-2 pt-[calc(env(safe-area-inset-top)+1rem)]">
          <span className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Pages</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close pages"
            className="rounded-md p-1 text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">{children}</div>
      </div>
    </div>
  );
}
