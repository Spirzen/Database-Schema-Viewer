import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export interface CompactTableNodeData {
  tableName: string;
  tableSchema: string | null;
  columnCount: number;
  highlighted: boolean;
  dimmed: boolean;
  minimal: boolean;
  isSelected?: boolean;
  isRelated?: boolean;
}

function CompactTableNodeComponent({ data }: NodeProps) {
  const d = data as unknown as CompactTableNodeData;

  return (
    <div
      className={`table-node compact ${d.minimal ? "minimal" : ""} ${
        d.isSelected ? "focus-selected" : ""
      } ${d.isRelated ? "related" : ""} ${d.highlighted ? "highlighted" : ""} ${
        d.dimmed ? "dimmed" : ""
      }`}
    >
      <Handle type="target" position={Position.Left} className="handle-neon" />
      <div className="table-header compact-header">
        <span className="table-icon" aria-hidden>◈</span>
        <span className="table-title" title={d.tableName}>
          {d.tableName}
        </span>
        {!d.minimal && (
          <span className="col-count">{d.columnCount} col</span>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="handle-neon" />
    </div>
  );
}

export const CompactTableNode = memo(CompactTableNodeComponent);
