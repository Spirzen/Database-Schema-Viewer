import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import {
  discoverServers,
  fetchDefaults,
  fetchSamplePath,
  fetchSchema,
  listDatabases,
  sanitizeHostInput,
  testConnection,
} from "./api";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { DetailsPanel } from "./components/DetailsPanel";
import { SchemaGraph } from "./components/SchemaGraph";
import { ServerDiscovery } from "./components/ServerDiscovery";
import { TableFilter } from "./components/TableFilter";
import { Toolbar } from "./components/Toolbar";
import { computeInitialVisible, PERF } from "./graphConfig";
import { getRelatedTableNames, getTablesForFk } from "./relations";
import { useDebouncedValue } from "./hooks/useDebouncedValue";
import { applyTheme, loadTheme, saveTheme, type Theme } from "./theme";
import type {
  ConnectionRequest,
  DiscoveredServer,
  ForeignKeyInfo,
  SchemaResponse,
  TableInfo,
} from "./types";

const emptyConn = (): ConnectionRequest => ({
  db_type: "postgresql",
  host: "localhost",
  port: 5432,
  username: "",
  password: "",
  database: "",
  file_path: "",
  schema: "",
});

export default function App() {
  const [conn, setConn] = useState<ConnectionRequest>(emptyConn);
  const [ports, setPorts] = useState<Record<string, number | null>>({});
  const [databases, setDatabases] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingHint, setLoadingHint] = useState("");
  const [status, setStatus] = useState("");
  const [connected, setConnected] = useState(false);
  const [schema, setSchema] = useState<SchemaResponse | null>(null);
  const [visibleTables, setVisibleTables] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 280);
  const [filterOpen, setFilterOpen] = useState(false);
  const [showEdges, setShowEdges] = useState(true);
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null);
  const [selectedFk, setSelectedFk] = useState<ForeignKeyInfo | null>(null);
  const [highlightColumn, setHighlightColumn] = useState<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const [layoutKey, setLayoutKey] = useState(0);
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredServer[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const flowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    fetchDefaults().then((d) => {
      setPorts(d.ports);
      setConn((c) => ({
        ...c,
        host: d.host,
        port: d.ports[c.db_type] ?? null,
      }));
    });
  }, []);

  const tablesByName = useMemo(() => {
    const m = new Map<string, TableInfo>();
    for (const t of schema?.tables ?? []) {
      m.set(t.name, t);
    }
    return m;
  }, [schema]);

  const relatedTables = useMemo(() => {
    if (!schema) return new Set<string>();
    if (selectedFk) {
      const s = new Set(getTablesForFk(selectedFk));
      return s;
    }
    if (selectedTable) {
      return getRelatedTableNames(selectedTable.name, schema.foreign_keys);
    }
    return new Set<string>();
  }, [schema, selectedTable, selectedFk]);

  const graphHighlight = useMemo(
    () => ({
      selectedTable: selectedTable?.name ?? null,
      selectedFkId: selectedFk?.id ?? null,
      relatedTables,
      highlightColumn:
        selectedTable && highlightColumn
          ? { table: selectedTable.name, column: highlightColumn }
          : null,
    }),
    [selectedTable, selectedFk, relatedTables, highlightColumn]
  );

  const ensureTablesVisible = useCallback((names: string[]) => {
    setVisibleTables((prev) => {
      const next = new Set(prev);
      for (const n of names) next.add(n);
      return next;
    });
  }, []);

  const handleNavigateToFk = useCallback(
    (fk: ForeignKeyInfo) => {
      ensureTablesVisible([fk.from_table, fk.to_table]);
      setSelectedFk(fk);
      setSelectedTable(null);
      setHighlightColumn(null);
      setFocusTick((t) => t + 1);
    },
    [ensureTablesVisible]
  );

  const handleNavigateToTable = useCallback(
    (tableName: string, columnName?: string) => {
      ensureTablesVisible([tableName]);
      const t = tablesByName.get(tableName);
      if (t) {
        setSelectedTable(t);
        setSelectedFk(null);
        setHighlightColumn(columnName ?? null);
        setFocusTick((t) => t + 1);
      }
    },
    [ensureTablesVisible, tablesByName]
  );

  const patchConn = useCallback((patch: Partial<ConnectionRequest>) => {
    setConn((c) => {
      const next = { ...c, ...patch };
      if (patch.host !== undefined) {
        next.host = sanitizeHostInput(patch.host);
      }
      return next;
    });
  }, []);

  const applySchema = useCallback((data: SchemaResponse) => {
    const initial = computeInitialVisible(
      data.tables.map((t) => t.name),
      data.foreign_keys
    );
    setSchema(data);
    setConnected(true);
    setVisibleTables(initial);
    setShowEdges(data.foreign_keys.length < 2000);
    setFilterOpen(data.tables.length > PERF.COMPACT_TABLES);
    setSelectedTable(null);
    setSelectedFk(null);
    setHighlightColumn(null);
    setLayoutKey((k) => k + 1);

    const mode =
      data.tables.length > PERF.HUGE_SCHEMA
        ? " — компактный режим, отображено связанных/первых таблиц"
        : data.tables.length > PERF.COMPACT_TABLES
          ? ` — на диаграмме ${initial.size} из ${data.tables.length} таблиц`
          : "";

    setStatus(
      `✓ Схема: ${data.tables.length} таблиц, ${data.foreign_keys.length} связей${mode}`
    );
  }, []);

  const handleDisconnect = useCallback(() => {
    setSchema(null);
    setConnected(false);
    setVisibleTables(new Set());
    setSearch("");
    setFilterOpen(false);
    setSelectedTable(null);
    setSelectedFk(null);
    setHighlightColumn(null);
    setStatus("Отключено");
  }, []);

  const handleConnect = useCallback(async () => {
    if (conn.db_type !== "sqlite" && !conn.database.trim()) {
      setStatus("✗ Выберите базу данных");
      return;
    }
    setLoading(true);
    setLoadingHint("Чтение метаданных…");
    setStatus("");
    try {
      const data = await fetchSchema(conn);
      setLoadingHint("Построение диаграммы…");
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      applySchema(data);
    } catch (e) {
      setStatus(`✗ ${e instanceof Error ? e.message : "Ошибка"}`);
    } finally {
      setLoading(false);
      setLoadingHint("");
    }
  }, [conn, applySchema]);

  const handleDiscoverServers = useCallback(async () => {
    setDiscoveryOpen(true);
    setDiscovering(true);
    setDiscovered([]);
    try {
      const list = await discoverServers();
      setDiscovered(list);
      if (list.length === 0) {
        setStatus("Серверы не найдены на этом ПК");
      }
    } catch (e) {
      setStatus(`✗ ${e instanceof Error ? e.message : "Ошибка поиска"}`);
      setDiscoveryOpen(false);
    } finally {
      setDiscovering(false);
    }
  }, []);

  const handlePickServer = useCallback(
    (s: DiscoveredServer) => {
      patchConn({
        db_type: s.db_type,
        host: s.host,
        port: s.port ?? ports[s.db_type] ?? null,
      });
      setDiscoveryOpen(false);
      setStatus(`✓ ${s.label}`);
    },
    [patchConn, ports]
  );

  const selectLinkedTables = useCallback(() => {
    if (!schema) return;
    const linked = new Set<string>();
    for (const fk of schema.foreign_keys) {
      linked.add(fk.from_table);
      linked.add(fk.to_table);
    }
    setVisibleTables(linked);
    setLayoutKey((k) => k + 1);
  }, [schema]);

  const handleTest = useCallback(async () => {
    setLoading(true);
    try {
      const r = await testConnection(conn);
      setStatus(r.ok ? "✓ " + r.message : "✗ " + r.message);
    } finally {
      setLoading(false);
    }
  }, [conn]);

  const handleRefreshDbs = useCallback(async () => {
    setLoading(true);
    try {
      const dbs = await listDatabases(conn);
      setDatabases(dbs);
      setStatus(`✓ Найдено баз: ${dbs.length}`);
    } catch (e) {
      setStatus(`✗ ${e instanceof Error ? e.message : "Ошибка"}`);
    } finally {
      setLoading(false);
    }
  }, [conn]);

  const handleLoadSample = useCallback(async () => {
    const path = await fetchSamplePath();
    if (!path) {
      setStatus("✗ Демо БД не найдена. Запустите sample/create_demo_db.py");
      return;
    }
    const sampleConn: ConnectionRequest = {
      ...emptyConn(),
      db_type: "sqlite",
      file_path: path,
      database: path,
    };
    setConn(sampleConn);
    setLoading(true);
    setLoadingHint("Демо SQLite…");
    try {
      const data = await fetchSchema(sampleConn);
      applySchema(data);
    } catch (e) {
      setStatus(`✗ ${e instanceof Error ? e.message : "Ошибка"}`);
    } finally {
      setLoading(false);
      setLoadingHint("");
    }
  }, [applySchema]);

  const toggleTable = useCallback((name: string) => {
    setVisibleTables((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    setLayoutKey((k) => k + 1);
  }, []);

  const exportPng = useCallback(async () => {
    const el = flowRef.current?.querySelector(".react-flow") as HTMLElement | null;
    if (!el) return;
    const bg =
      theme === "light"
        ? getComputedStyle(document.documentElement).getPropertyValue("--bg-deep").trim() ||
          "#f4f0fa"
        : "#141024";
    try {
      const dataUrl = await toPng(el, {
        backgroundColor: bg,
        pixelRatio: 2,
        filter: (node) => {
          const c = (node as HTMLElement).classList;
          if (c?.contains("react-flow__minimap")) return false;
          if (c?.contains("react-flow__controls")) return false;
          if (c?.contains("perf-banner")) return false;
          return true;
        },
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `schema-${schema?.db_label ?? "export"}.png`;
      a.click();
    } catch {
      setStatus("✗ Не удалось экспортировать PNG");
    }
  }, [schema, theme]);

  const tableNames = schema?.tables.map((t) => t.name) ?? [];
  const visibleCount = useMemo(() => {
    let n = 0;
    for (const name of tableNames) {
      if (visibleTables.has(name)) n++;
    }
    return n;
  }, [tableNames, visibleTables]);

  const connectLabel = loading ? loadingHint || "Загрузка…" : "Подключить";

  const selectAllTables = useCallback(() => {
    if (tableNames.length > PERF.MAX_RENDER_NODES) {
      setVisibleTables(new Set(tableNames.slice(0, PERF.MAX_RENDER_NODES)));
      setStatus(
        `Показаны первые ${PERF.MAX_RENDER_NODES} таблиц — для плавности. Уточните фильтром.`
      );
    } else {
      setVisibleTables(new Set(tableNames));
    }
    setLayoutKey((k) => k + 1);
  }, [tableNames]);

  return (
    <div className="app">
      <ConnectionPanel
        conn={conn}
        ports={ports}
        databases={databases}
        loading={loading}
        connected={connected}
        status={status}
        onChange={patchConn}
        onTest={handleTest}
        onRefreshDbs={handleRefreshDbs}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onLoadSample={handleLoadSample}
        onDiscoverServers={handleDiscoverServers}
        connectLabel={connectLabel}
      />
      <ServerDiscovery
        servers={discovered}
        loading={discovering}
        open={discoveryOpen}
        onClose={() => setDiscoveryOpen(false)}
        onPick={handlePickServer}
      />
      <main className="main">
        <Toolbar
          search={search}
          onSearchChange={setSearch}
          onExportPng={exportPng}
          onRelayout={() => setLayoutKey((k) => k + 1)}
          tableFilterOpen={filterOpen}
          onToggleFilter={() => setFilterOpen((o) => !o)}
          visibleCount={visibleCount}
          totalCount={tableNames.length}
          dbLabel={schema?.db_label ?? ""}
          disabled={!connected}
          theme={theme}
          onThemeToggle={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          showEdges={showEdges}
          onShowEdgesChange={setShowEdges}
        />
        <div className="workspace">
          {filterOpen && schema && (
            <TableFilter
              tables={tableNames}
              visible={visibleTables}
              onToggle={toggleTable}
              onSelectAll={selectAllTables}
              onSelectNone={() => {
                setVisibleTables(new Set());
                setLayoutKey((k) => k + 1);
              }}
              onSelectLinked={selectLinkedTables}
              hasForeignKeys={schema.foreign_keys.length > 0}
            />
          )}
          <SchemaGraph
            tables={schema?.tables ?? []}
            tablesByName={tablesByName}
            foreignKeys={schema?.foreign_keys ?? []}
            visibleTables={visibleTables}
            searchQuery={debouncedSearch}
            showEdges={showEdges}
            highlight={graphHighlight}
            focusTick={focusTick}
            onSelectTable={(t) => {
              setSelectedTable(t);
              setHighlightColumn(null);
            }}
            onSelectFk={(fk) => {
              setSelectedFk(fk);
              setHighlightColumn(null);
            }}
            flowRef={flowRef}
            layoutKey={layoutKey}
          />
          <DetailsPanel
            selectedTable={selectedTable}
            selectedFk={selectedFk}
            foreignKeys={schema?.foreign_keys ?? []}
            highlightColumn={highlightColumn}
            onClose={() => {
              setSelectedTable(null);
              setSelectedFk(null);
              setHighlightColumn(null);
            }}
            onNavigateToFk={handleNavigateToFk}
            onNavigateToTable={handleNavigateToTable}
          />
        </div>
      </main>
    </div>
  );
}
