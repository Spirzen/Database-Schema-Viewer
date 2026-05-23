import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  type Edge,
  type Node,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import { TableNode } from "./TableNode";
import { CompactTableNode } from "./CompactTableNode";
import { GraphFocus } from "./GraphFocus";
import type { ForeignKeyInfo, TableInfo } from "../types";
import { applyDagreLayout } from "../layout";
import {
  computeCompactNodeWidth,
  computeFullNodeWidth,
  tableNodeHeight as fullTableHeight,
} from "../nodeSizing";
import { getRenderMode, PERF, type RenderMode } from "../graphConfig";

const nodeTypes = { tableNode: TableNode, compactTableNode: CompactTableNode };

interface HighlightState {
  selectedTable: string | null;
  selectedFkId: string | null;
  relatedTables: Set<string>;
  highlightColumn: { table: string; column: string } | null;
}

interface Props {
  tables: TableInfo[];
  tablesByName: Map<string, TableInfo>;
  foreignKeys: ForeignKeyInfo[];
  visibleTables: Set<string>;
  searchQuery: string;
  showEdges: boolean;
  highlight: HighlightState;
  focusTick: number;
  onSelectTable: (t: TableInfo | null) => void;
  onSelectFk: (fk: ForeignKeyInfo | null) => void;
  flowRef: React.RefObject<HTMLDivElement | null>;
  layoutKey: number;
}

function buildGraph(
  tables: TableInfo[],
  foreignKeys: ForeignKeyInfo[],
  visibleTables: Set<string>,
  searchQuery: string,
  renderMode: RenderMode,
  showEdges: boolean,
  highlight: HighlightState
): { nodes: Node[]; edges: Edge[] } {
  const q = searchQuery.trim().toLowerCase();
  const visible = tables.filter((t) => visibleTables.has(t.name));
  const compact = renderMode !== "full";
  const minimal = renderMode === "minimal";
  const { selectedTable, selectedFkId, relatedTables, highlightColumn } = highlight;
  const hasFocus = Boolean(selectedTable || selectedFkId);

  const matchingTables = new Set<string>();
  const columnHits = new Map<string, string[]>();

  if (q && !minimal) {
    for (const t of tables) {
      if (t.name.toLowerCase().includes(q)) matchingTables.add(t.name);
      if (renderMode === "full") {
        for (const c of t.columns) {
          if (c.name.toLowerCase().includes(q)) {
            matchingTables.add(t.name);
            if (!columnHits.has(t.name)) columnHits.set(t.name, []);
            columnHits.get(t.name)!.push(c.name.toLowerCase());
          }
        }
      }
    }
  } else if (q) {
    for (const t of tables) {
      if (t.name.toLowerCase().includes(q)) matchingTables.add(t.name);
    }
  }

  const nodes: Node[] = visible.map((t) => {
    const searchHit = q ? matchingTables.has(t.name) : false;
    const isSelected = selectedTable === t.name;
    const isRelated = relatedTables.has(t.name) && !isSelected;
    const dimmedSearch = q && !searchHit;
    const dimmedFocus =
      hasFocus && !isSelected && !isRelated && !selectedFkId;
    const dimmed = dimmedSearch || dimmedFocus;

    const colHighlight =
      highlightColumn?.table === t.name ? highlightColumn.column : null;

    if (compact) {
      const layoutWidth = computeCompactNodeWidth(t.name, minimal);
      return {
        id: t.name,
        type: "compactTableNode",
        position: { x: 0, y: 0 },
        data: {
          tableName: t.name,
          tableSchema: t.schema,
          columnCount: t.columns.length,
          layoutWidth,
          highlighted: searchHit,
          dimmed,
          minimal,
          compact: true,
          isSelected,
          isRelated,
        },
      };
    }

    const layoutWidth = computeFullNodeWidth(t);
    const h = fullTableHeight(t.columns.length);
    return {
      id: t.name,
      type: "tableNode",
      position: { x: 0, y: 0 },
      data: {
        table: t,
        height: h,
        layoutWidth,
        highlighted: searchHit,
        dimmed,
        searchHits: columnHits.get(t.name) ?? [],
        isSelected,
        isRelated,
        highlightColumn: colHighlight,
      },
    };
  });

  const visibleNames = new Set(visible.map((t) => t.name));
  const edgeType = visible.length > PERF.SIMPLE_EDGES ? "straight" : "smoothstep";
  const showLabels = visible.length <= PERF.HIDE_EDGE_LABELS && !minimal;

  const edges: Edge[] = showEdges
    ? foreignKeys
        .filter((fk) => visibleNames.has(fk.from_table) && visibleNames.has(fk.to_table))
        .map((fk) => {
          const isFkSelected = selectedFkId === fk.id;
          const connectsSelectedTable =
            Boolean(selectedTable) &&
            (fk.from_table === selectedTable || fk.to_table === selectedTable);

          let className = "";
          if (isFkSelected) className = "edge-selected";
          else if (connectsSelectedTable) className = "edge-related";

          const dimEdge = hasFocus && !className;
          const isBright = isFkSelected || connectsSelectedTable;

          return {
            id: fk.id,
            source: fk.from_table,
            target: fk.to_table,
            type: edgeType,
            animated: isFkSelected,
            label: showLabels ? fk.from_columns.join(", ") : undefined,
            className,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: {
              strokeWidth: isFkSelected ? 3.5 : connectsSelectedTable ? 2.5 : minimal ? 1 : 1.5,
              opacity: dimEdge ? 0.1 : isBright ? 1 : 0.5,
            },
            data: { fk },
          };
        })
    : [];

  const laid = applyDagreLayout(nodes, edges, "LR", compact);
  return { nodes: laid, edges };
}

export function SchemaGraph({
  tables,
  tablesByName,
  foreignKeys,
  visibleTables,
  searchQuery,
  showEdges,
  highlight,
  focusTick,
  onSelectTable,
  onSelectFk,
  flowRef,
  layoutKey,
}: Props) {
  const visibleCount = useMemo(() => {
    let n = 0;
    for (const t of tables) {
      if (visibleTables.has(t.name)) n++;
    }
    return n;
  }, [tables, visibleTables]);

  const renderMode = getRenderMode(visibleCount, tables.length);

  const { nodes, edges } = useMemo(
    () =>
      buildGraph(
        tables,
        foreignKeys,
        visibleTables,
        searchQuery,
        renderMode,
        showEdges,
        highlight
      ),
    [tables, foreignKeys, visibleTables, searchQuery, renderMode, showEdges, highlight, layoutKey]
  );

  const onSelectionChange = useCallback(
    ({ nodes: selNodes, edges: selEdges }: OnSelectionChangeParams) => {
      if (selEdges.length > 0) {
        const fk = (selEdges[0].data as { fk?: ForeignKeyInfo })?.fk;
        onSelectFk(fk ?? null);
        onSelectTable(null);
        return;
      }
      if (selNodes.length > 0) {
        const id = selNodes[0].id;
        onSelectTable(tablesByName.get(id) ?? null);
        onSelectFk(null);
      }
    },
    [onSelectTable, onSelectFk, tablesByName]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const t = tablesByName.get(node.id);
      if (t) {
        onSelectTable(t);
        onSelectFk(null);
      }
    },
    [onSelectTable, onSelectFk, tablesByName]
  );

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      const fk = (edge.data as { fk?: ForeignKeyInfo })?.fk;
      if (fk) {
        onSelectFk(fk);
        onSelectTable(null);
      }
    },
    [onSelectFk, onSelectTable]
  );

  if (tables.length === 0) {
    return (
      <div className="graph-empty">
        <p>Подключитесь к базе данных или откройте демо SQLite</p>
      </div>
    );
  }

  const showMinimap = visibleCount <= PERF.HIDE_MINIMAP;
  const perfBanner =
    visibleCount > PERF.MAX_RENDER_NODES ? (
      <div className="perf-banner">
        Показано {visibleCount} таблиц — уменьшите выбор в фильтре для плавности
      </div>
    ) : renderMode !== "full" ? (
      <div className="perf-banner subtle">
        Режим {renderMode === "minimal" ? "обзора" : "компактный"} ({visibleCount}{" "}
        табл.) — детали столбцов в панели справа
      </div>
    ) : null;

  const focusTable =
    highlight.selectedTable ??
    (highlight.selectedFkId
      ? foreignKeys.find((f) => f.id === highlight.selectedFkId)?.from_table ?? null
      : null);

  return (
    <div className="graph-wrap" ref={flowRef}>
      {perfBanner}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onlyRenderVisibleElements
        nodesDraggable={visibleCount < 80}
        elevateNodesOnSelect={false}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 0.9, minZoom: 0.08 }}
        minZoom={0.02}
        maxZoom={2}
        onSelectionChange={onSelectionChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        proOptions={{ hideAttribution: true }}
      >
        <GraphFocus
          focusTable={focusTable}
          focusFkId={highlight.selectedFkId}
          tick={focusTick}
        />
        <Background
          color="var(--flow-bg)"
          gap={renderMode === "minimal" ? 32 : 24}
          size={1}
        />
        <Controls className="flow-controls" />
        {showMinimap && <MiniMap className="flow-minimap" zoomable pannable />}
      </ReactFlow>
    </div>
  );
}
