import type { Theme } from "../theme";

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  onExportPng: () => void;
  onRelayout: () => void;
  tableFilterOpen: boolean;
  onToggleFilter: () => void;
  visibleCount: number;
  totalCount: number;
  dbLabel: string;
  disabled?: boolean;
  theme: Theme;
  onThemeToggle: () => void;
  showEdges: boolean;
  onShowEdgesChange: (v: boolean) => void;
}

export function Toolbar({
  search,
  onSearchChange,
  onExportPng,
  onRelayout,
  tableFilterOpen,
  onToggleFilter,
  visibleCount,
  totalCount,
  dbLabel,
  disabled = false,
  theme,
  onThemeToggle,
  showEdges,
  onShowEdgesChange,
}: Props) {
  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <span className="db-badge">{dbLabel || "Не подключено"}</span>
        <span className="table-count">
          {visibleCount} / {totalCount} таблиц
        </span>
      </div>
      <div className="toolbar-center">
        <input
          className="search-input"
          type="search"
          placeholder="Поиск таблицы или столбца…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          disabled={disabled}
        />
      </div>
      <div className="toolbar-right">
        <label className="toolbar-check" title="Показать связи FK">
          <input
            type="checkbox"
            checked={showEdges}
            onChange={(e) => onShowEdgesChange(e.target.checked)}
            disabled={disabled}
          />
          Связи
        </label>
        <button
          type="button"
          className="btn ghost theme-toggle"
          onClick={onThemeToggle}
          title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
        >
          {theme === "dark" ? "☀" : "☽"}
        </button>
        <button
          type="button"
          className={`btn ghost ${tableFilterOpen ? "active" : ""}`}
          onClick={onToggleFilter}
          disabled={disabled}
        >
          Фильтр
        </button>
        <button type="button" className="btn ghost" onClick={onRelayout} disabled={disabled}>
          Переложить
        </button>
        <button type="button" className="btn primary" onClick={onExportPng} disabled={disabled}>
          PNG
        </button>
      </div>
    </header>
  );
}
