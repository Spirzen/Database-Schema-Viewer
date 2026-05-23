import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { TableInfo } from "../types";

export interface TableNodeData {
  table: TableInfo;
  height: number;
  highlighted: boolean;
  dimmed: boolean;
  searchHits: string[];
  isSelected?: boolean;
  isRelated?: boolean;
  highlightColumn?: string | null;
}

function ColumnRow({
  col,
  hit,
  focus,
}: {
  col: TableInfo["columns"][0];
  hit: boolean;
  focus: boolean;
}) {
  const badges: string[] = [];
  if (col.is_primary_key) badges.push("PK");
  if (col.is_foreign_key) badges.push("FK");

  return (
    <div className={`col-row ${hit ? "col-hit" : ""} ${focus ? "col-focus" : ""}`}>
      <span className="col-name">{col.name}</span>
      <span className="col-type">{col.data_type}</span>
      {badges.length > 0 && (
        <span className="col-badges">{badges.join(" ")}</span>
      )}
    </div>
  );
}

function TableNodeComponent({ data }: NodeProps) {
  const d = data as unknown as TableNodeData;
  const {
    table,
    highlighted,
    dimmed,
    searchHits,
    isSelected,
    isRelated,
    highlightColumn,
  } = d;

  return (
    <div
      className={`table-node ${isSelected ? "focus-selected" : ""} ${
        isRelated ? "related" : ""
      } ${highlighted ? "highlighted" : ""} ${dimmed ? "dimmed" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="handle-neon" />
      <div className="table-header">
        <span className="table-icon" aria-hidden>◈</span>
        <div className="table-header-text">
          <span className="table-title" title={table.name}>
            {table.name}
          </span>
          {table.schema && (
            <span className="table-schema" title={table.schema}>
              {table.schema}
            </span>
          )}
        </div>
      </div>
      <div className="table-columns">
        {table.columns.map((col) => (
          <ColumnRow
            key={col.name}
            col={col}
            hit={searchHits.includes(col.name.toLowerCase())}
            focus={highlightColumn === col.name}
          />
        ))}
      </div>
      <Handle type="source" position={Position.Right} className="handle-neon" />
    </div>
  );
}

export const TableNode = memo(TableNodeComponent);
