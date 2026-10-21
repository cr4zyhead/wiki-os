import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { fullDate, timeAgo } from "@/lib/time-format";
import type { WikiHealthReport } from "@/lib/wiki-shared";

function Panel({
  title,
  count,
  accent,
  hint,
  empty,
  hasItems = count > 0,
  children,
}: {
  title: string;
  count: number;
  hasItems?: boolean;
  accent: string;
  hint: string;
  empty: string;
  children: ReactNode;
}) {
  return (
    <section className="surface-raised flex min-w-0 flex-col overflow-hidden rounded-3xl">
      <header className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div className="min-w-0">
          <h3 className="font-display text-[1.05rem] text-[var(--foreground)]">{title}</h3>
          <p className="mt-0.5 text-[0.72rem] text-[var(--muted-foreground)]">{hint}</p>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold text-white"
          style={{ background: count > 0 ? accent : "var(--muted-foreground)" }}
        >
          {count}
        </span>
      </header>
      {!hasItems ? (
        <p className="px-5 py-4 text-sm text-[var(--muted-foreground)]">✓ {empty}</p>
      ) : (
        <ul className="max-h-80 divide-y divide-[var(--border)] overflow-y-auto">{children}</ul>
      )}
    </section>
  );
}

const rowClass =
  "flex items-center justify-between gap-3 px-5 py-2.5 text-sm transition-colors duration-150 hover:bg-white/60";

/** Stats section: broken links, orphan pages and the pages that went longest without an update. */
export function WikiHealth({ health }: { health: WikiHealthReport }) {
  const staleCount = health.leastUpdated.filter((page) => page.stale).length;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-[var(--peach)] shadow-[0_0_12px_var(--peach)]" />
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          Wiki Health
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel
          title="Broken links"
          count={health.brokenLinks.length}
          accent="#d9534f"
          hint="[[Links]] that point to no page or file"
          empty="Every link resolves"
        >
          {health.brokenLinks.map((link) => (
            <li key={`${link.slug}→${link.target}`}>
              <Link to={`/wiki/${link.slug}`} className={rowClass}>
                <span className="min-w-0 truncate text-[var(--foreground)]">{link.title}</span>
                <code className="min-w-0 shrink truncate rounded bg-[var(--secondary)] px-1.5 py-0.5 text-[0.72rem] text-[#b04a45]">
                  {link.target}
                </code>
              </Link>
            </li>
          ))}
        </Panel>

        <Panel
          title="Orphan pages"
          count={health.orphans.length}
          accent="var(--lavender)"
          hint="No other page links to them"
          empty="Every page is linked from somewhere"
        >
          {health.orphans.map((page) => (
            <li key={page.slug}>
              <Link to={`/wiki/${page.slug}`} className={rowClass}>
                <span className="min-w-0 truncate text-[var(--foreground)]">{page.title}</span>
                <span className="shrink-0 truncate text-[0.72rem] text-[var(--muted-foreground)]">
                  {page.slug.split("/").slice(0, -1).map(decodeURIComponent).join(" / ")}
                </span>
              </Link>
            </li>
          ))}
        </Panel>

        <div className="md:col-span-2">
          <Panel
            title="Least recently updated"
            count={staleCount}
            hasItems={health.leastUpdated.length > 0}
            accent="var(--peach)"
            hint={`Oldest last update first · flagged after ${health.staleDays} days`}
            empty="No pages yet"
          >
            {health.leastUpdated.map((page) => (
              <li key={page.slug}>
                <Link to={`/wiki/${page.slug}`} className={rowClass}>
                  <span className="min-w-0 truncate text-[var(--foreground)]">{page.title}</span>
                  <time
                    dateTime={new Date(page.updatedAt).toISOString()}
                    title={fullDate(page.updatedAt)}
                    className={`shrink-0 text-[0.72rem] ${page.stale ? "font-semibold text-[#b5652b]" : "text-[var(--muted-foreground)]"}`}
                  >
                    {timeAgo(page.updatedAt)}
                  </time>
                </Link>
              </li>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}
