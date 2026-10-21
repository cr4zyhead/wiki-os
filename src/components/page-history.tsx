import { useEffect, useState } from "react";
import { ChevronRight, History } from "lucide-react";

import { fetchJson } from "@/client/api";
import { fullDate, timeAgo } from "@/lib/time-format";

interface Commit {
  hash: string;
  at: number;
  author: string;
  subject: string;
}

const LINE_STYLES: Record<string, string> = {
  "+": "bg-[#e3f4e8] text-[#1f5c35]",
  "-": "bg-[#fbe5e5] text-[#8a2a2a] line-through decoration-[#8a2a2a]/30",
  "@": "mt-2 text-[var(--muted-foreground)]/70 first:mt-0",
};

function DiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n").filter((line) => line !== "" && !line.startsWith("\\"));
  if (lines.length === 0) {
    return <p className="px-3 py-2 text-xs text-[var(--muted-foreground)]">No text changes in this commit.</p>;
  }
  return (
    <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-[var(--border)] bg-white/70 py-2 font-mono text-[0.72rem] leading-relaxed">
      {lines.map((line, index) => (
        <div
          key={index}
          className={`whitespace-pre-wrap break-words px-3 ${LINE_STYLES[line[0]] ?? "text-[var(--muted-foreground)]"}`}
        >
          {line[0] === "@" ? "⋯" : line}
        </div>
      ))}
    </div>
  );
}

/** "History (N)" under a page title: the commits that touched it, each expandable to its diff. */
export function PageHistory({ file }: { file: string }) {
  const [commits, setCommits] = useState<Commit[] | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [diffs, setDiffs] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let alive = true;
    setCommits(null);
    setOpen(false);
    setSelected(null);
    setDiffs({});
    fetchJson<{ commits: Commit[] }>(`/api/history?file=${encodeURIComponent(file)}`)
      .then((response) => alive && setCommits(response.commits))
      .catch(() => alive && setCommits([]));
    return () => {
      alive = false;
    };
  }, [file]);

  function toggleCommit(hash: string) {
    setSelected((current) => (current === hash ? null : hash));
    if (hash in diffs) return;
    setDiffs((current) => ({ ...current, [hash]: null }));
    fetchJson<{ diff: string }>(
      `/api/history/diff?file=${encodeURIComponent(file)}&commit=${hash}`,
    )
      .then((response) => setDiffs((current) => ({ ...current, [hash]: response.diff })))
      .catch(() => setDiffs((current) => ({ ...current, [hash]: "" })));
  }

  if (!commits || commits.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]/80 transition-colors duration-150 hover:text-[var(--foreground)]"
      >
        <History className="h-3.5 w-3.5" />
        History ({commits.length})
        <ChevronRight className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <ol className="animate-in surface mt-3 divide-y divide-[var(--border)] overflow-hidden rounded-2xl">
          {commits.map((commit) => {
            const expanded = selected === commit.hash;
            const diff = diffs[commit.hash];
            return (
              <li key={commit.hash}>
                <button
                  type="button"
                  onClick={() => toggleCommit(commit.hash)}
                  aria-expanded={expanded}
                  className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-white/60"
                >
                  <ChevronRight
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)] transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.85rem] text-[var(--foreground)]">{commit.subject}</span>
                    <span className="mt-0.5 block text-[0.7rem] text-[var(--muted-foreground)]">
                      <time dateTime={new Date(commit.at).toISOString()}>{fullDate(commit.at)}</time>
                      {" · "}
                      {timeAgo(commit.at)}
                      {" · "}
                      <code className="font-mono">{commit.hash.slice(0, 7)}</code>
                    </span>
                  </span>
                </button>
                {expanded && (
                  <div className="px-4 pb-3">
                    {diff === undefined || diff === null ? (
                      <div className="h-16 animate-pulse rounded-xl bg-[var(--secondary)]" />
                    ) : (
                      <DiffView diff={diff} />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
