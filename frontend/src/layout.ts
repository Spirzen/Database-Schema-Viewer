import dagre from "dagre";
import type { Edge, Node } from "@xyflow/react";
import { COMPACT_NODE_HEIGHT, MINIMAL_NODE_HEIGHT, PERF } from "./graphConfig";

const DEFAULT_WIDTH = 200;
const ROW_HEIGHT = 22;
const HEADER = 44;

export function tableNodeHeight(columnCount: number): number {
  return HEADER + columnCount * ROW_HEIGHT + 12;
}

export function getNodeLayoutWidth(node: Node): number {
  const d = node.data as { layoutWidth?: number };
  return d.layoutWidth ?? DEFAULT_WIDTH;
}

export function nodeHeightForLayout(
  data: { height?: number; compact?: boolean; minimal?: boolean },
  defaultH = 200
): number {
  if (data.minimal) return MINIMAL_NODE_HEIGHT;
  if (data.compact) return COMPACT_NODE_HEIGHT;
  return data.height ?? defaultH;
}

function simpleGridLayout(nodes: Node[]): Node[] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));

  return nodes.map((n, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const h = nodeHeightForLayout(n.data as { height?: number; compact?: boolean });

    let x = 0;
    for (let c = 0; c < col; c++) {
      const idx = row * cols + c;
      if (idx < nodes.length) x += getNodeLayoutWidth(nodes[idx]) + 48;
    }

    return {
      ...n,
      position: {
        x,
        y: row * (h + 32),
      },
    };
  });
}

export function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR" = "LR",
  _compact = false
): Node[] {
  if (nodes.length === 0) return nodes;

  if (nodes.length > PERF.GRID_LAYOUT_ONLY) {
    return simpleGridLayout(nodes);
  }

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 60,
    ranksep: 100,
    marginx: 48,
    marginy: 48,
  });

  nodes.forEach((n) => {
    const w = getNodeLayoutWidth(n);
    const h = nodeHeightForLayout(n.data as { height?: number; compact?: boolean });
    g.setNode(n.id, { width: w, height: h });
  });

  edges.forEach((e) => {
    g.setEdge(e.source, e.target);
  });

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    const w = getNodeLayoutWidth(n);
    const h = nodeHeightForLayout(n.data as { height?: number; compact?: boolean });
    return {
      ...n,
      position: {
        x: pos.x - w / 2,
        y: pos.y - h / 2,
      },
    };
  });
}
