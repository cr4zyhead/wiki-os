import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, redirect, useLoaderData, useNavigate } from "react-router-dom";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import FA2Layout from "graphology-layout-forceatlas2/worker";
import SigmaLib from "sigma";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";

import { useWikiConfig } from "@/client/wiki-config";
import { getTopicColor } from "@/lib/wiki-config";
import { assignGroupColors, folderGroup, mixColor, seedPosition } from "@/lib/graph-visuals";
import type { GraphData, GraphNode } from "@/lib/wiki-shared";
import { fetchJson, isSetupRequiredResponse } from "../api";
import { RouteErrorBoundary } from "../route-error-boundary";

/* ── Colors ── */

const DEFAULT_NODE_COLOR = "#c4c0cc";
const EDGE_DEFAULT = "#e6dfcc";
const EDGE_ACTIVE = "#84b9c9";
const FADED_NODE = "#ebe6da";
const LABEL_COLOR = "#6b6673";
const BG_COLOR = "#faf7f3";

type ColorMode = "folder" | "topic";

function groupKey(node: GraphNode, mode: ColorMode) {
  return mode === "folder" ? folderGroup(node.slug) : (node.categories[0] ?? "Other");
}

/* ── Graph building ── */

function buildGraph(data: GraphData): Graph {
  const graph = new Graph();
  const folders = [...new Set(data.nodes.map((node) => folderGroup(node.slug)))];

  for (const node of data.nodes) {
    const size = Math.max(3, Math.min(16, 3 + Math.sqrt(node.backlinkCount) * 2));
    graph.addNode(node.slug, {
      label: node.title,
      size,
      color: DEFAULT_NODE_COLOR,
      ...seedPosition(folders.indexOf(folderGroup(node.slug)), folders.length),
      categories: node.categories,
      backlinkCount: node.backlinkCount,
      wordCount: node.wordCount,
    });
  }

  for (const edge of data.edges) {
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
      const key = `${edge.source}->${edge.target}`;
      if (!graph.hasEdge(key)) {
        graph.addEdgeWithKey(key, edge.source, edge.target, {
          weight: edge.weight,
          size: 0.6,
          color: EDGE_DEFAULT,
        });
      }
    }
  }

  return graph;
}

function createLayout(graph: Graph) {
  return new FA2Layout(graph, {
    settings: {
      ...forceAtlas2.inferSettings(graph),
      gravity: 1,
      scalingRatio: 10,
      barnesHutOptimize: graph.order > 300,
      strongGravityMode: true,
      // High slowDown keeps the entrance visible for a couple of seconds on small vaults.
      slowDown: 12,
      linLogMode: true,
    },
  });
}

/** Stable 0..1 offset per edge, so particles on different edges don't move in lockstep. */
function edgePhase(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return ((hash >>> 0) % 1000) / 1000;
}

/* ── Search ── */

function GraphSearch({
  graph,
  onSelect,
}: {
  graph: Graph | null;
  onSelect: (slug: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ slug: string; label: string }[]>([]);

  useEffect(() => {
    if (!graph || !query.trim()) {
      setResults([]);
      return;
    }
    const q = query.toLowerCase();
    const matched: { slug: string; label: string }[] = [];
    graph.forEachNode((slug, attrs) => {
      if (attrs.label?.toLowerCase().includes(q)) {
        matched.push({ slug, label: attrs.label });
      }
    });
    matched.sort((a, b) => a.label.localeCompare(b.label));
    setResults(matched.slice(0, 8));
  }, [graph, query]);

  const handleSelect = (slug: string) => {
    onSelect(slug);
    setQuery("");
    setResults([]);
  };

  return (
    <div
      className="absolute left-4 right-4 z-10 sm:right-auto sm:w-64"
      style={{ top: "calc(env(safe-area-inset-top) + 4.75rem)" }}
    >
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a concept..."
        className="surface w-full rounded-full px-4 py-2.5 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
      />
      {results.length > 0 && (
        <div className="surface-raised mt-2 overflow-hidden rounded-2xl">
          {results.map((r) => (
            <button
              key={r.slug}
              type="button"
              onClick={() => handleSelect(r.slug)}
              className="block w-full px-4 py-2 text-left text-sm font-display text-[var(--foreground)] transition-colors hover:bg-[var(--teal-soft)]/50"
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Info panel (shown when a node is focused) ── */

function InfoPanel({
  node,
  neighborNodes,
  onClose,
  onClickNeighbor,
  onNavigate,
  colorOf,
  groupLabel,
}: {
  node: GraphNode;
  neighborNodes: GraphNode[];
  onClose: () => void;
  onClickNeighbor: (slug: string) => void;
  onNavigate: (slug: string) => void;
  colorOf: (slug: string) => string;
  groupLabel: string;
}) {
  const catColor = colorOf(node.slug);

  return (
    <div
      className="surface-raised absolute left-4 right-4 z-20 overflow-hidden rounded-3xl sm:left-auto sm:right-4 sm:w-80"
      style={{ top: "calc(env(safe-area-inset-top) + 4.75rem)" }}
    >
      {/* Header */}
      <div className="border-b border-[var(--border)] px-5 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-display text-[1.1rem] text-[var(--foreground)]">
              {node.title}
            </h3>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: catColor, boxShadow: `0 0 8px ${catColor}80` }}
                />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                  {groupLabel}
                </span>
              </div>
              <span className="text-[10px] text-[var(--muted-foreground)]">
                {node.backlinkCount} · {node.wordCount}w
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M3 3l8 8M11 3l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Summary */}
      {node.summary && (
        <div className="border-b border-[var(--border)] px-5 py-3">
          <p className="line-clamp-3 text-[0.8rem] leading-relaxed text-[var(--muted-foreground)]">
            {node.summary}
          </p>
        </div>
      )}

      {/* Open article button */}
      <div className="border-b border-[var(--border)] px-5 py-3">
        <button
          type="button"
          onClick={() => onNavigate(node.slug)}
          className="w-full rounded-full bg-[var(--foreground)] px-4 py-2 text-xs font-semibold text-[var(--background)] transition-[background,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-[var(--teal)] active:scale-[0.97]"
        >
          Open article →
        </button>
      </div>

      {/* Connections list */}
      {neighborNodes.length > 0 && (
        <div className="max-h-56 overflow-y-auto">
          <p className="px-5 pb-1.5 pt-3 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Connections ({neighborNodes.length})
          </p>
          {neighborNodes.map((n) => (
            <button
              key={n.slug}
              type="button"
              onClick={() => onClickNeighbor(n.slug)}
              className="group flex w-full items-center gap-2.5 px-5 py-2 text-left transition-colors hover:bg-white/60"
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full transition-all duration-200 group-hover:scale-125"
                style={{
                  backgroundColor: colorOf(n.slug),
                  boxShadow: `0 0 6px ${colorOf(n.slug)}60`,
                }}
              />
              <span className="truncate font-display text-[0.85rem] text-[var(--foreground)]">
                {n.title}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Tooltip ── */

function NodeTooltip({
  node,
  position,
}: {
  node: { label: string; group: string; color: string; backlinkCount: number; wordCount: number } | null;
  position: { x: number; y: number };
}) {
  if (!node) return null;
  const catColor = node.color;

  return (
    <div
      className="surface-raised pointer-events-none absolute z-20 max-w-xs rounded-2xl px-4 py-2.5"
      style={{ left: position.x + 14, top: position.y - 12 }}
    >
      <p className="font-display text-[0.95rem] text-[var(--foreground)]">{node.label}</p>
      <div className="mt-1 flex items-center gap-1.5 text-[0.7rem] font-medium text-[var(--muted-foreground)]">
        <span>{node.backlinkCount} connections</span>
        <span>·</span>
        <span>{node.wordCount} words</span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: catColor, boxShadow: `0 0 8px ${catColor}80` }}
        />
        <span className="text-[0.7rem] font-semibold text-[var(--muted-foreground)]">{node.group}</span>
      </div>
    </div>
  );
}

/* ── Main Component ── */

export async function loader() {
  try {
    return await fetchJson<GraphData>("/api/graph");
  } catch (error) {
    if (isSetupRequiredResponse(error)) {
      throw redirect("/setup");
    }

    throw error;
  }
}

export function Component() {
  const data = useLoaderData() as GraphData;
  const config = useWikiConfig();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const sigmaRef = useRef<SigmaLib | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const focusedRef = useRef<string | null>(null);
  const hiddenGroupsRef = useRef(new Set<string>());
  const colorModeRef = useRef<ColorMode>("folder");
  const replayRef = useRef<() => void>(() => {});
  const highlightRef = useRef<(node: string | null) => void>(() => {});
  const [focusedSlug, setFocusedSlug] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>("folder");
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<{
    node: { label: string; group: string; color: string; backlinkCount: number; wordCount: number };
    position: { x: number; y: number };
  } | null>(null);
  const [graphReady, setGraphReady] = useState(false);

  const nodeMap = useMemo(() => new Map(data.nodes.map((n) => [n.slug, n])), [data]);

  // Groups for the current color mode: name, color and size, biggest first.
  const groups = useMemo(() => {
    const sizes = new Map<string, number>();
    for (const node of data.nodes) {
      const key = groupKey(node, colorMode);
      sizes.set(key, (sizes.get(key) ?? 0) + 1);
    }
    const colors =
      colorMode === "folder"
        ? assignGroupColors(sizes)
        : new Map([...sizes.keys()].map((key) => [key, getTopicColor(key, config.categories.aliases)]));
    return [...colors.entries()].map(([name, color]) => ({ name, color, count: sizes.get(name) ?? 0 }));
  }, [colorMode, config.categories.aliases, data.nodes]);

  const colorOf = useCallback(
    (slug: string) => {
      const node = nodeMap.get(slug);
      if (!node) return DEFAULT_NODE_COLOR;
      return groups.find((group) => group.name === groupKey(node, colorMode))?.color ?? DEFAULT_NODE_COLOR;
    },
    [colorMode, groups, nodeMap],
  );

  const focusedNode = focusedSlug ? nodeMap.get(focusedSlug) ?? null : null;
  const focusedNeighbors = focusedNode
    ? focusedNode.neighbors
        .map((s) => nodeMap.get(s))
        .filter((n): n is GraphNode => n !== undefined)
        .sort((a, b) => b.backlinkCount - a.backlinkCount)
    : [];

  const focusNode = useCallback((slug: string | null, zoom = true) => {
    focusedRef.current = slug;
    setFocusedSlug(slug);
    highlightRef.current(slug ?? hoveredRef.current);
    const sigma = sigmaRef.current;
    if (slug && zoom && sigma) {
      // Center the node, zooming in only a little so its neighbors stay in view.
      const pos = sigma.getNodeDisplayData(slug);
      const camera = sigma.getCamera();
      if (pos) camera.animate({ x: pos.x, y: pos.y, ratio: Math.min(camera.ratio, 0.85) }, { duration: 500 });
    }
  }, []);

  const handleSearchSelect = useCallback((slug: string) => focusNode(slug), [focusNode]);
  const handleInfoClose = useCallback(() => focusNode(null), [focusNode]);
  const handleInfoNeighborClick = useCallback((slug: string) => focusNode(slug), [focusNode]);

  // Esc leaves focus mode.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && focusedRef.current) focusNode(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusNode]);

  useEffect(() => {
    const container = containerRef.current;
    const overlay = overlayRef.current;
    if (!container || !overlay) return;

    const graph = buildGraph(data);
    graphRef.current = graph;
    const layout = createLayout(graph);
    let layoutTimer: ReturnType<typeof setTimeout> | undefined;
    let bboxFrozen = false;

    /*
     * Hover/focus "physics": a damped spring drives `amount` toward `target` (so it overshoots and
     * settles). While active, neighbors are pulled toward the center of attention and unrelated
     * nodes close to it are pushed away; everything springs back on leave. Only display positions
     * change (via the reducers), never the stored layout.
     */
    const fx = {
      key: null as string | null,
      active: new Set<string>(), // the hovered node, or both ends of a hovered link
      neighbors: new Set<string>(),
      edges: [] as string[], // links that get particles
      center: { x: 0, y: 0 },
      radius: 1, // graph units within which unrelated nodes get pushed away
      amount: 0,
      velocity: 0,
      target: 0,
    };
    let frame = 0;

    const position = (node: string) => graph.getNodeAttributes(node) as { x: number; y: number };

    /** Display offset for a node under the current highlight (graph coordinates). */
    const displaced = (node: string, x: number, y: number) => {
      const s = fx.amount;
      if (!fx.key || s === 0) return { x, y };
      const dx = fx.center.x - x;
      const dy = fx.center.y - y;
      if (fx.active.has(node)) {
        // Ends of a hovered link lean toward each other; a hovered node stays put.
        return fx.active.size > 1 ? { x: x + dx * 0.12 * s, y: y + dy * 0.12 * s } : { x, y };
      }
      if (fx.neighbors.has(node)) {
        return { x: x + dx * 0.16 * s, y: y + dy * 0.16 * s };
      }
      const distance = Math.hypot(dx, dy);
      if (distance === 0 || distance > fx.radius) return { x, y };
      const push = (1 - distance / fx.radius) * fx.radius * 0.08 * s;
      return { x: x - (dx / distance) * push, y: y - (dy / distance) * push };
    };

    const sigma = new SigmaLib(graph, container, {
      allowInvalidContainer: true,
      renderLabels: true,
      renderEdgeLabels: false,
      labelColor: { color: LABEL_COLOR },
      labelFont: '"Urbanist", -apple-system, BlinkMacSystemFont, sans-serif',
      labelSize: 11,
      labelWeight: "500",
      labelRenderedSizeThreshold: 7,
      defaultEdgeColor: EDGE_DEFAULT,
      defaultEdgeType: "line",
      defaultNodeColor: DEFAULT_NODE_COLOR,
      stagePadding: 60,
      zIndex: true,
      enableEdgeEvents: true,
      nodeReducer(node, attrs) {
        const res = { ...attrs };
        if (hiddenGroupsRef.current.has(groupKey(nodeMap.get(node)!, colorModeRef.current))) {
          res.hidden = true;
          return res;
        }
        const s = fx.amount; // may overshoot 1 (spring); colors use the clamped value
        const a = Math.min(1, Math.max(0, s));
        if (fx.key && s !== 0) {
          Object.assign(res, displaced(node, attrs.x, attrs.y));
          if (fx.active.has(node)) {
            res.size = (attrs.size ?? 4) * (1 + 0.5 * s);
            res.zIndex = 2;
            res.forceLabel = true;
          } else if (fx.neighbors.has(node)) {
            res.size = (attrs.size ?? 4) * (1 + 0.15 * s);
            res.zIndex = 1;
            res.forceLabel = a > 0.5;
          } else {
            res.color = mixColor(attrs.color ?? DEFAULT_NODE_COLOR, FADED_NODE, a * 0.85);
            res.zIndex = 0;
            if (a > 0.3) res.label = "";
          }
        }
        return res;
      },
      edgeReducer(edge, attrs) {
        const res = { ...attrs };
        const src = graph.source(edge);
        const tgt = graph.target(edge);
        const hidden = hiddenGroupsRef.current;
        const mode = colorModeRef.current;
        if (hidden.has(groupKey(nodeMap.get(src)!, mode)) || hidden.has(groupKey(nodeMap.get(tgt)!, mode))) {
          res.hidden = true;
          return res;
        }
        const a = Math.min(1, Math.max(0, fx.amount));
        if (fx.key && a > 0) {
          if (fx.edges.includes(edge)) {
            res.color = mixColor(EDGE_DEFAULT, EDGE_ACTIVE, a);
            res.size = 0.6 + 1.4 * a;
            res.zIndex = 1;
          } else {
            res.color = mixColor(EDGE_DEFAULT, BG_COLOR, a * 0.8);
          }
        }
        return res;
      },
    });
    sigmaRef.current = sigma;
    setGraphReady(true);

    /* Overlay: particles along the active node's links (source → target) and a pulsing halo. */
    const dpr = window.devicePixelRatio || 1;
    const ctx = overlay.getContext("2d");
    const resizeOverlay = () => {
      overlay.width = overlay.clientWidth * dpr;
      overlay.height = overlay.clientHeight * dpr;
    };
    resizeOverlay();
    const resizeObserver = new ResizeObserver(resizeOverlay);
    resizeObserver.observe(overlay);

    const drawOverlay = (now: number) => {
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      const a = Math.min(1, Math.max(0, fx.amount));
      if (!fx.key || a <= 0.01) return;
      const t = now / 1000;
      // Screen position of a node as currently displayed (after the hover displacement).
      const onScreen = (node: string) => {
        const display = sigma.getNodeDisplayData(node);
        return display ? sigma.framedGraphToViewport(display) : sigma.graphToViewport(position(node));
      };

      // Halo on each active node
      for (const node of fx.active) {
        if (!graph.hasNode(node)) continue;
        const color = graph.getNodeAttribute(node, "color") as string;
        const center = onScreen(node);
        const display = sigma.getNodeDisplayData(node);
        const radius = display ? sigma.scaleSize(display.size) : 8;
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius * (1.6 + 0.25 * Math.sin(t * 3)), 0, Math.PI * 2);
        ctx.strokeStyle = `${color}${Math.round(90 * a).toString(16).padStart(2, "0")}`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Particles: move from the linking page to the linked page.
      for (const edge of fx.edges) {
        if (!graph.hasEdge(edge)) continue;
        const source = graph.source(edge);
        const from = onScreen(source);
        const to = onScreen(graph.target(edge));
        ctx.fillStyle = graph.getNodeAttribute(source, "color") as string;
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        const count = Math.max(1, Math.min(4, Math.round(length / 120)));
        for (let k = 0; k < count; k++) {
          const p = (t * 0.45 + k / count + edgePhase(edge)) % 1;
          ctx.globalAlpha = a * Math.sin(p * Math.PI) * 0.9;
          ctx.beginPath();
          ctx.arc(from.x + (to.x - from.x) * p, from.y + (to.y - from.y) * p, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    let springSettled = true;
    const tick = (now: number) => {
      // Damped spring (stiffness 0.14, damping 0.72): overshoots a little, then settles.
      fx.velocity = (fx.velocity + (fx.target - fx.amount) * 0.14) * 0.72;
      fx.amount += fx.velocity;
      const settled = Math.abs(fx.target - fx.amount) < 0.002 && Math.abs(fx.velocity) < 0.002;
      if (settled) {
        fx.amount = fx.target;
        fx.velocity = 0;
        if (fx.target === 0) fx.key = null;
      }
      // Re-index (hover hit-testing) only once the motion settles; cheap refreshes while moving.
      sigma.refresh(settled && !springSettled ? undefined : { skipIndexation: true });
      springSettled = settled;
      drawOverlay(now);
      frame = fx.key ? requestAnimationFrame(tick) : 0;
    };

    const start = (key: string, active: string[], neighbors: string[], edges: string[]) => {
      if (fx.key !== key) {
        fx.key = key;
        fx.active = new Set(active);
        fx.neighbors = new Set(neighbors.filter((n) => !fx.active.has(n)));
        fx.edges = edges;
        // Push radius: a fifth of the graph's extent.
        const xs = graph.mapNodes((_n, attrs) => attrs.x as number);
        const ys = graph.mapNodes((_n, attrs) => attrs.y as number);
        fx.radius = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 5 || 1;
        if (fx.amount > 0.4) {
          fx.amount = 0.4; // re-spring when jumping between targets
          fx.velocity = 0;
        }
      }
      // Recomputed on every call so the pull follows a node being dragged.
      const points = active.map(position);
      fx.center = {
        x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
        y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
      };
      fx.target = 1;
      springSettled = false;
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const highlight = (node: string | null) => {
      if (node && graph.hasNode(node)) {
        start(`node:${node}`, [node], graph.neighbors(node), graph.edges(node));
      } else {
        fx.target = 0;
        springSettled = false;
        if (!frame && fx.key) frame = requestAnimationFrame(tick);
      }
    };
    const highlightEdge = (edge: string) => {
      start(`edge:${edge}`, [graph.source(edge), graph.target(edge)], [], [edge]);
    };
    highlightRef.current = highlight;

    /* Live layout: the graph blooms out of its folder clusters, then settles. */
    const runLayoutFor = (ms: number) => {
      clearTimeout(layoutTimer);
      if (!layout.isRunning()) layout.start();
      layoutTimer = setTimeout(() => {
        layout.stop();
        if (!bboxFrozen) {
          // Freeze the viewport once settled so dragging a node doesn't rescale everything.
          sigma.setCustomBBox(sigma.getBBox());
          bboxFrozen = true;
        }
      }, ms);
    };
    replayRef.current = () => {
      layout.stop();
      const folders = [...new Set(data.nodes.map((n) => folderGroup(n.slug)))];
      graph.updateEachNodeAttributes((slug, attrs) => ({
        ...attrs,
        ...seedPosition(folders.indexOf(folderGroup(slug)), folders.length),
      }));
      sigma.setCustomBBox(null);
      bboxFrozen = false;
      sigma.getCamera().animatedReset({ duration: 300 });
      runLayoutFor(6000);
    };
    runLayoutFor(6000);

    /* Drag nodes; the physics pulls their neighbors along. */
    let dragged: string | null = null;
    let dragMoved = false;
    sigma.on("downNode", ({ node }) => {
      dragged = node;
      dragMoved = false;
      graph.setNodeAttribute(node, "fixed", true);
    });
    sigma.on("moveBody", ({ event }) => {
      if (!dragged) return;
      const pos = sigma.viewportToGraph(event);
      graph.mergeNodeAttributes(dragged, { x: pos.x, y: pos.y });
      if (!dragMoved) {
        dragMoved = true;
        setTooltip(null);
        clearTimeout(layoutTimer);
        if (!layout.isRunning()) layout.start();
      }
      highlight(dragged);
      event.preventSigmaDefault();
      event.original.preventDefault();
      event.original.stopPropagation();
    });
    const release = () => {
      if (!dragged) return;
      graph.removeNodeAttribute(dragged, "fixed");
      dragged = null;
      if (dragMoved) runLayoutFor(2500);
    };
    sigma.on("upNode", release);
    sigma.on("upStage", release);

    sigma.on("enterNode", ({ node }) => {
      hoveredRef.current = node;
      if (!focusedRef.current) highlight(node);
      container.style.cursor = "pointer";
    });
    sigma.on("leaveNode", () => {
      hoveredRef.current = null;
      if (!focusedRef.current && !dragged) highlight(null);
      setTooltip(null);
      container.style.cursor = "default";
    });
    sigma.on("enterEdge", ({ edge }) => {
      if (focusedRef.current || dragged || hoveredRef.current) return;
      highlightEdge(edge);
      container.style.cursor = "pointer";
    });
    sigma.on("leaveEdge", () => {
      if (focusedRef.current || dragged || hoveredRef.current) return;
      highlight(null);
      container.style.cursor = "default";
    });
    // Clicking a link focuses the page it comes from.
    sigma.on("clickEdge", ({ edge }) => {
      if (!dragMoved) focusNode(graph.source(edge));
    });

    sigma.on("clickNode", ({ node }) => {
      if (dragMoved) {
        dragMoved = false;
        return;
      }
      const focused = focusedRef.current;
      if (focused === node || (focused && graph.areNeighbors(focused, node))) {
        navigate(`/wiki/${node}`);
        return;
      }
      focusNode(node);
    });
    sigma.on("clickStage", () => {
      // Releasing a drag also emits a click; it must not close the focused node.
      if (dragMoved) {
        dragMoved = false;
        return;
      }
      if (focusedRef.current) focusNode(null);
    });
    sigma.on("downStage", () => {
      dragMoved = false;
    });

    // Keep the overlay in sync while the camera moves (pan/zoom) and nothing is highlighted-animating.
    const onCamera = () => {
      if (!frame) drawOverlay(performance.now());
    };
    sigma.getCamera().on("updated", onCamera);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(layoutTimer);
      resizeObserver.disconnect();
      layout.kill();
      sigma.kill();
      sigmaRef.current = null;
      graphRef.current = null;
    };
  }, [data, navigate, nodeMap, focusNode]);

  // Recolor nodes when the color mode or its groups change.
  useEffect(() => {
    colorModeRef.current = colorMode;
    const graph = graphRef.current;
    if (!graph || !graphReady) return;
    graph.updateEachNodeAttributes((slug, attrs) => ({ ...attrs, color: colorOf(slug) }));
  }, [colorMode, colorOf, graphReady]);

  useEffect(() => {
    hiddenGroupsRef.current = hiddenGroups;
    sigmaRef.current?.refresh();
  }, [hiddenGroups]);

  const toggleGroup = (name: string) =>
    setHiddenGroups((previous) => {
      const next = new Set(previous);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  // Tooltip tracking
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const hovered = hoveredRef.current;
      if (!hovered || !graphRef.current || focusedRef.current) {
        if (!focusedRef.current) setTooltip(null);
        return;
      }
      const attrs = graphRef.current.getNodeAttributes(hovered);
      const node = nodeMap.get(hovered);
      const rect = container.getBoundingClientRect();
      setTooltip({
        node: {
          label: attrs.label,
          group: node ? groupKey(node, colorModeRef.current) : "",
          color: attrs.color ?? DEFAULT_NODE_COLOR,
          backlinkCount: attrs.backlinkCount ?? 0,
          wordCount: attrs.wordCount ?? 0,
        },
        position: { x: e.clientX - rect.left, y: e.clientY - rect.top },
      });
    };

    container.addEventListener("mousemove", handleMouseMove);
    return () => container.removeEventListener("mousemove", handleMouseMove);
  }, [nodeMap]);

  return (
    <div className="fixed inset-0" style={{ background: BG_COLOR }}>
      {/* Header */}
      <header className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between gap-2 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1.5rem)] sm:gap-3 sm:px-6 sm:pb-4 sm:pt-[calc(env(safe-area-inset-top)+1.25rem)]">
        <Link to="/" className="font-display text-lg text-[var(--foreground)] sm:text-xl">
          {config.siteTitle}
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <span className="surface hidden items-center gap-2 rounded-full px-3.5 py-2 text-xs text-[var(--muted-foreground)] sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--lavender)]" />
            <span className="font-semibold tabular-nums text-[var(--foreground)]">
              {data.nodes.length}
            </span>
            <span>{config.navigation.conceptsLabel}</span>
            <span>·</span>
            <span className="font-semibold tabular-nums text-[var(--foreground)]">
              {data.edges.length}
            </span>
            <span>{config.navigation.connectionsLabel}</span>
          </span>
          <Link
            to="/"
            className="surface rounded-full px-3.5 py-2 text-sm font-medium text-[var(--foreground)] transition-[transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.96] sm:px-4"
          >
            <span className="sm:hidden">Back</span>
            <span className="hidden sm:inline">{config.navigation.backToWikiLabel}</span>
          </Link>
        </div>
      </header>

      {/* Search */}
      <GraphSearch
        graph={graphReady ? graphRef.current : null}
        onSelect={handleSearchSelect}
      />

      {/* Tooltip (only when not focused) */}
      {!focusedSlug && (
        <NodeTooltip
          node={tooltip?.node ?? null}
          position={tooltip?.position ?? { x: 0, y: 0 }}
        />
      )}

      {/* Info panel (when focused) */}
      {focusedNode && (
        <InfoPanel
          node={focusedNode}
          neighborNodes={focusedNeighbors}
          onClose={handleInfoClose}
          onClickNeighbor={handleInfoNeighborClick}
          onNavigate={(slug) => navigate(`/wiki/${slug}`)}
          colorOf={colorOf}
          groupLabel={groupKey(focusedNode, colorMode)}
        />
      )}

      {/* Sigma canvas + animation overlay (particles, halo) */}
      <div ref={containerRef} className="h-full w-full" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />

      {/* Legend: color mode + groups (click to hide/show) */}
      <div className="surface-raised absolute bottom-4 left-4 z-10 max-w-[calc(100%-2rem)] rounded-2xl px-3 py-2.5 sm:max-w-sm">
        <div className="mb-2 flex items-center gap-1 text-[0.7rem] font-medium">
          <span className="mr-1 uppercase tracking-wider text-[var(--muted-foreground)]">Color</span>
          {(["folder", "topic"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setHiddenGroups(new Set());
                setColorMode(mode);
              }}
              aria-pressed={colorMode === mode}
              className={`rounded-full px-2.5 py-1 transition-colors duration-150 ${
                colorMode === mode
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
              }`}
            >
              {mode === "folder" ? "Folder" : "Topic"}
            </button>
          ))}
        </div>
        <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
          {groups.map((group) => {
            const hidden = hiddenGroups.has(group.name);
            return (
              <button
                key={group.name}
                type="button"
                onClick={() => toggleGroup(group.name)}
                aria-pressed={!hidden}
                title={hidden ? `Show ${group.name}` : `Hide ${group.name}`}
                className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-[opacity,background-color] duration-150 hover:bg-[var(--secondary)] ${
                  hidden ? "opacity-40" : ""
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: group.color }} />
                <span className="text-[var(--foreground)]">{group.name}</span>
                <span className="tabular-nums text-[var(--muted-foreground)]">{group.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Camera + animation controls */}
      <div className="surface-raised absolute bottom-4 right-4 z-10 flex flex-col overflow-hidden rounded-2xl">
        {[
          { label: "Zoom in", icon: Plus, action: () => sigmaRef.current?.getCamera().animatedZoom({ duration: 300 }) },
          { label: "Zoom out", icon: Minus, action: () => sigmaRef.current?.getCamera().animatedUnzoom({ duration: 300 }) },
          { label: "Fit graph", icon: Maximize2, action: () => sigmaRef.current?.getCamera().animatedReset({ duration: 400 }) },
          { label: "Replay layout", icon: RotateCcw, action: () => replayRef.current() },
        ].map(({ label, icon: Icon, action }) => (
          <button
            key={label}
            type="button"
            onClick={action}
            aria-label={label}
            title={label}
            className="p-2.5 text-[var(--muted-foreground)] transition-colors duration-150 hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
}

export const ErrorBoundary = RouteErrorBoundary;
