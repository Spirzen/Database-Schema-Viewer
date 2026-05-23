import { useMemo, useState } from "react";

interface Props {
  tables: string[];
  visible: Set<string>;
  onToggle: (name: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onSelectLinked?: () => void;
  hasForeignKeys?: boolean;
}

const ROW_HEIGHT = 28;
const VIEWPORT_ROWS = 24;

export function TableFilter({
  tables,
  visible,
  onToggle,
  onSelectAll,
  onSelectNone,
  onSelectLinked,
  hasForeignKeys,
}: Props) {
  const [filter, setFilter] = useState("");
  const [scrollTop, setScrollTop] = useState(0);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tables;
    return tables.filter((n) => n.toLowerCase().includes(q));
  }, [tables, filter]);

  const totalHeight = filtered.length * ROW_HEIGHT;
  const startIdx = Math.floor(scrollTop / ROW_HEIGHT);
  const endIdx = Math.min(filtered.length, startIdx + VIEWPORT_ROWS + 4);
  const slice = filtered.slice(startIdx, endIdx);
  const offsetY = startIdx * ROW_HEIGHT;

  return (
    <div className="table-filter">
      <div className="filter-actions">
        <button type="button" onClick={onSelectAll}>
          Все
        </button>
        <button type="button" onClick={onSelectNone}>
          Снять
        </button>
        {hasForeignKeys && onSelectLinked && (
          <button type="button" onClick={onSelectLinked} title="Только таблицы со связями">
            Связанные
          </button>
        )}
      </div>
      <input
        className="filter-search"
        type="search"
        placeholder="Фильтр списка…"
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value);
          setScrollTop(0);
        }}
      />
      <p className="filter-count">
        {visible.size} / {tables.length}
        {filter ? ` · найдено ${filtered.length}` : ""}
      </p>
      <div
        className="filter-scroll"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          <ul
            className="filter-list"
            style={{ transform: `translateY(${offsetY}px)` }}
          >
            {slice.map((name) => (
              <li key={name} style={{ height: ROW_HEIGHT }}>
                <label>
                  <input
                    type="checkbox"
                    checked={visible.has(name)}
                    onChange={() => onToggle(name)}
                  />
                  <span className="filter-name">{name}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
