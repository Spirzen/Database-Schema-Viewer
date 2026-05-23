import { useEffect, useState } from "react";
import type { ForeignKeyInfo, TableInfo } from "../types";
import {
  describeFk,
  getColumnRelations,
  type ColumnRelation,
} from "../relations";

type TableTab = "fields" | "relations";

interface Props {
  selectedTable: TableInfo | null;
  selectedFk: ForeignKeyInfo | null;
  foreignKeys: ForeignKeyInfo[];
  highlightColumn: string | null;
  onClose: () => void;
  onNavigateToFk: (fk: ForeignKeyInfo) => void;
  onNavigateToTable: (tableName: string, columnName?: string) => void;
}

function RelationCard({
  relation,
  onNavigateToFk,
  onNavigateToTable,
}: {
  relation: ColumnRelation;
  onNavigateToFk: (fk: ForeignKeyInfo) => void;
  onNavigateToTable: (tableName: string, columnName?: string) => void;
}) {
  return (
    <li className="relation-card">
      <p className="relation-text">{describeFk(relation.fk)}</p>
      <div className="relation-actions">
        <button type="button" className="btn-chip" onClick={() => onNavigateToFk(relation.fk)}>
          Диаграмма
        </button>
        <button
          type="button"
          className="btn-chip primary"
          onClick={() => onNavigateToTable(relation.remoteTable, relation.remoteColumn)}
        >
          {relation.direction === "outgoing" ? "→" : "←"} {relation.remoteTable}
        </button>
      </div>
    </li>
  );
}

function TableDetails({
  table,
  foreignKeys,
  highlightColumn,
  onClose,
  onNavigateToFk,
  onNavigateToTable,
}: {
  table: TableInfo;
  foreignKeys: ForeignKeyInfo[];
  highlightColumn: string | null;
  onClose: () => void;
  onNavigateToFk: (fk: ForeignKeyInfo) => void;
  onNavigateToTable: (tableName: string, columnName?: string) => void;
}) {
  const allRelations = getColumnRelations(table.name, foreignKeys);
  const outgoing = allRelations.filter((r) => r.direction === "outgoing");
  const incoming = allRelations.filter((r) => r.direction === "incoming");
  const [tab, setTab] = useState<TableTab>("fields");

  useEffect(() => {
    setTab("fields");
  }, [table.name]);

  useEffect(() => {
    if (highlightColumn) {
      setTab("fields");
      const el = document.getElementById(`col-${table.name}-${highlightColumn}`);
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [highlightColumn, table.name]);

  return (
    <>
      <div className="details-header">
        <div className="details-title-block">
          <h3 className="details-title">{table.name}</h3>
          {table.schema && <span className="schema-pill">{table.schema}</span>}
        </div>
        <button type="button" className="btn-close" onClick={onClose} aria-label="Закрыть">
          ×
        </button>
      </div>

      {table.primary_key.length > 0 && (
        <div className="meta-row">
          <span className="meta-label">PK</span>
          <code>{table.primary_key.join(", ")}</code>
        </div>
      )}

      <div className="details-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "fields"}
          className={`details-tab ${tab === "fields" ? "active" : ""}`}
          onClick={() => setTab("fields")}
        >
          Поля
          <span className="tab-badge">{table.columns.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "relations"}
          className={`details-tab ${tab === "relations" ? "active" : ""}`}
          onClick={() => setTab("relations")}
        >
          Связи
          <span className="tab-badge">{allRelations.length}</span>
        </button>
      </div>

      <div className="details-body">
        {tab === "fields" && (
          <div className="fields-list" role="tabpanel">
            {table.columns.map((c) => {
              const isHighlight = highlightColumn === c.name;
              return (
                <div
                  key={c.name}
                  id={isHighlight ? `col-${table.name}-${c.name}` : undefined}
                  className={`field-row ${isHighlight ? "highlight" : ""}`}
                >
                  <div className="field-row-main">
                    <span className="field-name">{c.name}</span>
                    <span className="field-type">{c.data_type}</span>
                  </div>
                  <div className="field-flags">
                    {c.is_primary_key && <span className="tag pk">PK</span>}
                    {c.is_foreign_key && <span className="tag fk">FK</span>}
                    {!c.nullable && <span className="tag nn">NN</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "relations" && (
          <div className="relations-panel" role="tabpanel">
            {allRelations.length === 0 ? (
              <p className="empty-tab">У этой таблицы нет внешних ключей.</p>
            ) : (
              <>
                {outgoing.length > 0 && (
                  <section className="rel-section">
                    <h4 className="rel-section-title">Исходящие</h4>
                    <ul className="relation-cards">
                      {outgoing.map((r, i) => (
                        <RelationCard
                          key={`out-${r.fk.id}-${i}`}
                          relation={r}
                          onNavigateToFk={onNavigateToFk}
                          onNavigateToTable={onNavigateToTable}
                        />
                      ))}
                    </ul>
                  </section>
                )}
                {incoming.length > 0 && (
                  <section className="rel-section">
                    <h4 className="rel-section-title">Входящие</h4>
                    <ul className="relation-cards">
                      {incoming.map((r, i) => (
                        <RelationCard
                          key={`in-${r.fk.id}-${i}`}
                          relation={r}
                          onNavigateToFk={onNavigateToFk}
                          onNavigateToTable={onNavigateToTable}
                        />
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function FkDetails({
  fk,
  onClose,
  onNavigateToFk,
  onNavigateToTable,
}: {
  fk: ForeignKeyInfo;
  onClose: () => void;
  onNavigateToFk: (fk: ForeignKeyInfo) => void;
  onNavigateToTable: (tableName: string, columnName?: string) => void;
}) {
  return (
    <>
      <div className="details-header">
        <h3 className="details-title">Связь</h3>
        <button type="button" className="btn-close" onClick={onClose} aria-label="Закрыть">
          ×
        </button>
      </div>
      <p className="fk-description">{describeFk(fk)}</p>
      <p className="fk-name-muted">{fk.name}</p>
      <div className="fk-compact-flow">
        <button
          type="button"
          className="fk-endpoint"
          onClick={() => onNavigateToTable(fk.from_table, fk.from_columns[0])}
        >
          <span className="fk-end-label">Откуда</span>
          <strong>{fk.from_table}</strong>
          <code>{fk.from_columns.join(", ")}</code>
        </button>
        <span className="fk-arrow-inline">→</span>
        <button
          type="button"
          className="fk-endpoint"
          onClick={() => onNavigateToTable(fk.to_table, fk.to_columns[0])}
        >
          <span className="fk-end-label">Куда</span>
          <strong>{fk.to_table}</strong>
          <code>{fk.to_columns.join(", ")}</code>
        </button>
      </div>
      {(fk.on_delete || fk.on_update) && (
        <div className="meta-chips">
          {fk.on_delete && (
            <span className="meta-chip">
              DEL <strong>{fk.on_delete}</strong>
            </span>
          )}
          {fk.on_update && (
            <span className="meta-chip">
              UPD <strong>{fk.on_update}</strong>
            </span>
          )}
        </div>
      )}
      <button type="button" className="btn ghost full" onClick={() => onNavigateToFk(fk)}>
        На диаграмме
      </button>
    </>
  );
}

export function DetailsPanel({
  selectedTable,
  selectedFk,
  foreignKeys,
  highlightColumn,
  onClose,
  onNavigateToFk,
  onNavigateToTable,
}: Props) {
  const isOpen = Boolean(selectedTable || selectedFk);

  if (!isOpen) {
    return (
      <aside className="panel details-panel empty">
        <p className="hint-title">Карточка таблицы</p>
        <p className="hint-muted">Выберите таблицу или связь на диаграмме.</p>
      </aside>
    );
  }

  return (
    <>
      <div className="details-backdrop" onClick={onClose} aria-hidden />
      <aside className={`panel details-panel open`}>
        <div className="details-inner">
          {selectedFk ? (
            <FkDetails
              fk={selectedFk}
              onClose={onClose}
              onNavigateToFk={onNavigateToFk}
              onNavigateToTable={onNavigateToTable}
            />
          ) : selectedTable ? (
            <TableDetails
              table={selectedTable}
              foreignKeys={foreignKeys}
              highlightColumn={highlightColumn}
              onClose={onClose}
              onNavigateToFk={onNavigateToFk}
              onNavigateToTable={onNavigateToTable}
            />
          ) : null}
        </div>
      </aside>
    </>
  );
}
