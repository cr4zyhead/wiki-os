import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Menu, PanelLeftClose, Search } from "lucide-react";

import { useWikiConfig } from "@/client/wiki-config";
import { FileTree, FileTreeDrawer, useFileTreeState } from "@/components/file-tree";

const SIDEBAR_KEY = "wiki-os:sidebar";
// Must match the `lg` breakpoint used for `.app-sidebar` in globals.css.
const DOCKED_QUERY = "(min-width: 1024px)";

interface AppShellState {
  /** Opens the sidebar (or the drawer on small screens). */
  toggleSidebar: () => void;
  /** Expands a folder in the tree and makes the tree visible. */
  revealFolder: (path: string) => void;
}

const AppShellContext = createContext<AppShellState>({
  toggleSidebar: () => {},
  revealFolder: () => {},
});

export function useAppShell() {
  return useContext(AppShellContext);
}

function readDocked() {
  let docked = true;
  try {
    docked = localStorage.getItem(SIDEBAR_KEY) !== "closed";
  } catch {
    // Storage unavailable: default to docked.
  }
  // Set before the first paint so the layout does not jump.
  document.documentElement.dataset.sidebar = docked ? "open" : "closed";
  return docked;
}

/** Slug of the page being read, as used by the tree ("" outside article pages). */
function slugFromPathname(pathname: string) {
  return pathname.startsWith("/wiki/") ? pathname.slice("/wiki/".length) : "";
}

const pillClass =
  "surface rounded-full px-3.5 py-2 text-sm font-medium text-[var(--foreground)] transition-[transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.96] sm:px-4";

/** Shared header: menu button and site title (hidden while the sidebar is docked), then actions. */
export function SiteHeader({
  children,
  search = true,
  brandClassName = "",
  onBrandClick,
  className = "",
}: {
  children?: ReactNode;
  /** Show the search (⌘K) button. Off on the homepage, which is the search. */
  search?: boolean;
  brandClassName?: string;
  onBrandClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  className?: string;
}) {
  const config = useWikiConfig();
  const { toggleSidebar } = useAppShell();

  return (
    <header
      className={`flex items-center justify-between gap-2 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1.5rem)] sm:gap-3 sm:px-6 sm:pb-4 sm:pt-[calc(env(safe-area-inset-top)+1.25rem)] ${className}`}
    >
      <div className="hide-when-docked flex min-w-0 items-center gap-2">
        <button type="button" onClick={toggleSidebar} aria-label="Show pages" className="surface rounded-full p-2 text-[var(--foreground)] transition-[transform] duration-200 active:scale-[0.96]">
          <Menu className="h-4 w-4" />
        </button>
        <Link
          to="/"
          onClick={onBrandClick}
          className={`truncate font-display text-lg text-[var(--foreground)] sm:text-xl ${brandClassName}`}
        >
          {config.siteTitle}
        </Link>
      </div>
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
        {search && (
          <Link to="/" state={{ focusSearch: true }} aria-label="Search" className={`flex items-center gap-2 ${pillClass}`}>
            <Search aria-hidden className="h-4 w-4" />
            <kbd className="hidden font-sans text-xs text-[var(--muted-foreground)] sm:inline">⌘K</kbd>
          </Link>
        )}
        {children}
      </div>
    </header>
  );
}

/** Nav pills shared by every page header. The current page renders as a label. */
export function SiteNav({ current }: { current?: "graph" | "stats" }) {
  const config = useWikiConfig();
  const activeClass = "rounded-full bg-[var(--foreground)] px-3.5 py-2 text-sm font-medium text-[var(--background)] sm:px-4";

  return (
    <>
      {current === "graph" ? (
        <span className={activeClass}>{config.navigation.graphLabel}</span>
      ) : (
        <Link to="/graph" className={pillClass}>{config.navigation.graphLabel}</Link>
      )}
      {current === "stats" ? (
        <span className={activeClass}>{config.navigation.statsLabel}</span>
      ) : (
        <Link to="/stats" className={pillClass}>{config.navigation.statsLabel}</Link>
      )}
    </>
  );
}

/**
 * Layout every page inherits: a full-height page tree on the left (docked on lg+ screens,
 * a drawer below that), toggled from the header menu button, and the page in the remaining space.
 */
export function Component() {
  const config = useWikiConfig();
  const { pathname } = useLocation();
  const currentSlug = slugFromPathname(pathname);
  const { expanded, setFolder } = useFileTreeState(currentSlug);
  const [docked, setDocked] = useState(readDocked);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => {
    document.documentElement.dataset.sidebar = docked ? "open" : "closed";
    try {
      localStorage.setItem(SIDEBAR_KEY, docked ? "open" : "closed");
    } catch {
      // Not persisted (private mode); the toggle still works for this visit.
    }
    // Canvas views (graph) size themselves on window resize.
    window.dispatchEvent(new Event("resize"));
  }, [docked]);

  const toggleSidebar = useCallback(() => {
    if (window.matchMedia(DOCKED_QUERY).matches) setDocked((open) => !open);
    else setDrawerOpen(true);
  }, []);

  const revealFolder = useCallback(
    (path: string) => {
      setFolder(path, true);
      if (window.matchMedia(DOCKED_QUERY).matches) setDocked(true);
      else setDrawerOpen(true);
    },
    [setFolder],
  );

  const tree = (onNavigate?: () => void) => (
    <FileTree currentSlug={currentSlug} expanded={expanded} setFolder={setFolder} onNavigate={onNavigate} />
  );

  return (
    <AppShellContext.Provider value={{ toggleSidebar, revealFolder }}>
      <aside className="app-sidebar fixed inset-y-0 left-0 z-40 w-72 flex-col border-r border-[var(--border)] bg-[var(--background)]">
        <div className="flex items-center justify-between gap-2 px-5 pb-4 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
          <Link to="/" className="truncate font-display text-xl text-[var(--foreground)]">
            {config.siteTitle}
          </Link>
          <button
            type="button"
            onClick={() => setDocked(false)}
            aria-label="Hide pages"
            title="Hide pages"
            className="rounded-md p-1.5 text-[var(--muted-foreground)] transition-colors duration-150 hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-6">{tree()}</div>
      </aside>

      <div className="app-content">
        <Outlet />
      </div>

      <FileTreeDrawer open={drawerOpen} onClose={closeDrawer}>
        {tree(closeDrawer)}
      </FileTreeDrawer>
    </AppShellContext.Provider>
  );
}
