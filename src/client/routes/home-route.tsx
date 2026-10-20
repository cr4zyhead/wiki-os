import { useCallback, useState } from "react";
import { redirect, useLoaderData } from "react-router-dom";
import { PanelLeft } from "lucide-react";

import { FileTree, FileTreeDrawer, useFileTreeState } from "@/components/file-tree";
import { HomepageContent } from "@/components/homepage-content";
import { SearchBox } from "@/components/search-box";
import type { HomepageData } from "@/lib/wiki-shared";

import { fetchJson, isSetupRequiredResponse } from "../api";
import { RouteErrorBoundary } from "../route-error-boundary";

export async function loader() {
  try {
    return await fetchJson<HomepageData>("/api/home");
  } catch (error) {
    if (isSetupRequiredResponse(error)) {
      throw redirect("/setup");
    }

    throw error;
  }
}

export function Component() {
  const homepage = useLoaderData() as HomepageData;
  const { expanded, setFolder } = useFileTreeState("");
  const [treeDrawerOpen, setTreeDrawerOpen] = useState(false);
  const closeTreeDrawer = useCallback(() => setTreeDrawerOpen(false), []);

  return (
    <>
      <SearchBox
        totalPages={homepage.totalPages}
        headerStart={
          <button
            type="button"
            onClick={() => setTreeDrawerOpen(true)}
            aria-label="Browse pages"
            className="surface rounded-full p-2 text-[var(--foreground)] transition-[transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.96] 2xl:hidden"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        }
      >
        <HomepageContent homepage={homepage} />
      </SearchBox>

      {/* The centered homepage is max-w-4xl, so the tree only fits beside it on 2xl screens. */}
      <aside className="fixed bottom-6 left-8 top-24 hidden w-72 overflow-y-auto pr-1 2xl:block">
        <FileTree currentSlug="" expanded={expanded} setFolder={setFolder} />
      </aside>

      <FileTreeDrawer open={treeDrawerOpen} onClose={closeTreeDrawer}>
        <FileTree currentSlug="" expanded={expanded} setFolder={setFolder} onNavigate={closeTreeDrawer} />
      </FileTreeDrawer>
    </>
  );
}

export const ErrorBoundary = RouteErrorBoundary;
