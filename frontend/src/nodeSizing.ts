import type { TableInfo } from "./types";

const MIN_FULL = 140;
const MAX_FULL = 480;
const MIN_COMPACT = 100;
const MAX_COMPACT = 320;
const HEADER_EXTRA = 52;
const COL_BADGES = 36;

/** Примерная ширина строки в px (JetBrains Mono / Outfit). */
function textWidth(chars: number, pxPerChar: number): number {
  return chars * pxPerChar;
}

export function computeFullNodeWidth(table: TableInfo): number {
  let w = textWidth(table.name.length, 8.2) + HEADER_EXTRA;
  if (table.schema) {
    w = Math.max(w, textWidth(table.schema.length, 6.5) + HEADER_EXTRA);
  }

  for (const col of table.columns) {
    const badges = (col.is_primary_key ? 3 : 0) + (col.is_foreign_key ? 3 : 0) + 2;
    const row =
      textWidth(col.name.length, 7.2) +
      textWidth(col.data_type.length, 6) +
      COL_BADGES +
      badges * 14;
    w = Math.max(w, row);
  }

  return Math.round(Math.min(MAX_FULL, Math.max(MIN_FULL, w)));
}

export function computeCompactNodeWidth(
  tableName: string,
  minimal: boolean
): number {
  const base = textWidth(tableName.length, minimal ? 7.5 : 8) + (minimal ? 36 : 56);
  return Math.round(
    Math.min(MAX_COMPACT, Math.max(minimal ? 80 : MIN_COMPACT, base))
  );
}

export function tableNodeHeight(columnCount: number): number {
  const HEADER = 44;
  const ROW_HEIGHT = 22;
  return HEADER + columnCount * ROW_HEIGHT + 12;
}
