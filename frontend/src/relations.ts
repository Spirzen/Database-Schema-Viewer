import type { ForeignKeyInfo } from "./types";

export function describeFk(fk: ForeignKeyInfo): string {
  const parts: string[] = [];
  for (let i = 0; i < fk.from_columns.length; i++) {
    const fromCol = fk.from_columns[i];
    const toCol = fk.to_columns[i] ?? fk.to_columns[0];
    parts.push(
      `Поле «${fromCol}» таблицы «${fk.from_table}» связано с полем «${toCol}» таблицы «${fk.to_table}»`
    );
  }
  return parts.join(fk.from_columns.length > 1 ? "; " : "");
}

export function describeFkShort(fk: ForeignKeyInfo): string {
  const from = fk.from_columns.join(", ");
  const to = fk.to_columns.join(", ");
  return `${fk.from_table}.${from} → ${fk.to_table}.${to}`;
}

export function getRelatedTableNames(
  tableName: string,
  foreignKeys: ForeignKeyInfo[]
): Set<string> {
  const related = new Set<string>();
  for (const fk of foreignKeys) {
    if (fk.from_table === tableName) related.add(fk.to_table);
    if (fk.to_table === tableName) related.add(fk.from_table);
  }
  return related;
}

export function getTablesForFk(fk: ForeignKeyInfo): string[] {
  return [fk.from_table, fk.to_table];
}

export interface ColumnRelation {
  fk: ForeignKeyInfo;
  direction: "outgoing" | "incoming";
  localColumn: string;
  remoteTable: string;
  remoteColumn: string;
}

export function getColumnRelations(
  tableName: string,
  foreignKeys: ForeignKeyInfo[]
): ColumnRelation[] {
  const result: ColumnRelation[] = [];

  for (const fk of foreignKeys) {
    if (fk.from_table === tableName) {
      for (let i = 0; i < fk.from_columns.length; i++) {
        result.push({
          fk,
          direction: "outgoing",
          localColumn: fk.from_columns[i],
          remoteTable: fk.to_table,
          remoteColumn: fk.to_columns[i] ?? fk.to_columns[0],
        });
      }
    }
    if (fk.to_table === tableName) {
      for (let i = 0; i < fk.to_columns.length; i++) {
        result.push({
          fk,
          direction: "incoming",
          localColumn: fk.to_columns[i],
          remoteTable: fk.from_table,
          remoteColumn: fk.from_columns[i] ?? fk.from_columns[0],
        });
      }
    }
  }

  return result;
}

export function relationsForColumn(
  tableName: string,
  columnName: string,
  foreignKeys: ForeignKeyInfo[]
): ColumnRelation[] {
  return getColumnRelations(tableName, foreignKeys).filter(
    (r) => r.localColumn === columnName
  );
}
