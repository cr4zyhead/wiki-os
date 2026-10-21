import { useSyncExternalStore } from "react";

import { fetchJson } from "./api";

/**
 * "Changed since your last visit": a page is unread when its last update (git commit, or file
 * mtime) is newer than both the start of this visit's window and the last time it was opened here.
 * Everything lives in this browser's localStorage.
 */

const VISIT_KEY = "wiki-os:visit";
const SEEN_KEY = "wiki-os:seen";
/** A gap this long without opening WikiOS starts a new visit (tabs and reloads stay in the same one). */
export const VISIT_GAP_MS = 30 * 60_000;

interface Visit {
  since: number;
  lastSeen: number;
}

function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode / storage disabled: markers just don't persist
  }
}

/** Start of the current visit's window. First visit ever: now, so nothing shows as unread. */
export function nextVisit(previous: Visit | null, now: number): Visit {
  if (!previous) return { since: now, lastSeen: now };
  const since = now - previous.lastSeen > VISIT_GAP_MS ? previous.lastSeen : previous.since;
  return { since, lastSeen: now };
}

export function isUnread(updatedAt: number | undefined, since: number, seenAt = 0) {
  return updatedAt !== undefined && updatedAt > Math.max(since, seenAt);
}

interface UnreadState {
  since: number;
  seen: Record<string, number>;
  updates: Record<string, number>;
}

let state: UnreadState = { since: Number.POSITIVE_INFINITY, seen: {}, updates: {} };
let started = false;
const listeners = new Set<() => void>();

function setState(next: UnreadState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  const visit = nextVisit(readJson<Visit>(VISIT_KEY), Date.now());
  writeJson(VISIT_KEY, visit);
  state = { ...state, since: visit.since, seen: readJson<Record<string, number>>(SEEN_KEY) ?? {} };
  fetchJson<Record<string, number>>("/api/updates").then(
    (updates) => setState({ ...state, updates }),
    () => {},
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function markSeen(slug: string) {
  const now = Date.now();
  const seen = { ...state.seen, [slug]: now };
  writeJson(SEEN_KEY, seen);
  writeJson(VISIT_KEY, { since: state.since, lastSeen: now });
  setState({ ...state, seen });
}

export function markAllSeen() {
  const now = Date.now();
  writeJson(SEEN_KEY, {});
  writeJson(VISIT_KEY, { since: now, lastSeen: now });
  setState({ ...state, since: now, seen: {} });
}

export function useUnread() {
  start();
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);
  const unread = (slug: string) => isUnread(snapshot.updates[slug], snapshot.since, snapshot.seen[slug]);
  return {
    isUnread: unread,
    unreadCount: Object.keys(snapshot.updates).filter(unread).length,
    since: snapshot.since,
  };
}
