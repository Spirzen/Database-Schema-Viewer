/** Performance thresholds for schema visualization. */

export const PERF = {
  COMPACT_TABLES: 40,
  MINIMAL_TABLES: 120,
  HUGE_SCHEMA: 500,
  MAX_INITIAL_VISIBLE: 200,
  MAX_RENDER_NODES: 500,
  GRID_LAYOUT_ONLY: 50,
  HIDE_MINIMAP: 150,
  HIDE_EDGE_LABELS: 80,
  SIMPLE_EDGES: 100,
} as const;

export type RenderMode = "full" | "compact" | "minimal";

export function getRenderMode(visibleCount: number, totalTables: number): RenderMode {
  if (visibleCount > PERF.MINIMAL_TABLES || totalTables > PERF.HUGE_SCHEMA) {
    return "minimal";
  }
  if (visibleCount > PERF.COMPACT_TABLES || totalTables > 100) {
    return "compact";
  }
  return "full";
}

export function computeInitialVisible(
  tableNames: string[],
  foreignKeys: { from_table: string; to_table: string }[]
): Set<string> {
  if (tableNames.length <= PERF.COMPACT_TABLES) {
    return new Set(tableNames);
  }

  const linked = new Set<string>();
  for (const fk of foreignKeys) {
    linked.add(fk.from_table);
    linked.add(fk.to_table);
  }

  if (linked.size > 0) {
    const picked = [...linked].slice(0, PERF.MAX_INITIAL_VISIBLE);
    return new Set(picked);
  }

  return new Set(tableNames.slice(0, 50));
}

export const COMPACT_NODE_HEIGHT = 36;
export const MINIMAL_NODE_HEIGHT = 28;
