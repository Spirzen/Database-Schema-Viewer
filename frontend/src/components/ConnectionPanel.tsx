import type { ConnectionRequest, DbType } from "../types";

const DB_LABELS: Record<DbType, string> = {
  sqlite: "SQLite",
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  mssql: "MS SQL Server",
  oracle: "Oracle",
};

interface Props {
  conn: ConnectionRequest;
  ports: Record<string, number | null>;
  databases: string[];
  loading: boolean;
  connected: boolean;
  status: string;
  connectLabel: string;
  onChange: (patch: Partial<ConnectionRequest>) => void;
  onTest: () => void;
  onRefreshDbs: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onLoadSample: () => void;
  onDiscoverServers: () => void;
}

export function ConnectionPanel({
  conn,
  ports,
  databases,
  loading,
  connected,
  status,
  connectLabel,
  onChange,
  onTest,
  onRefreshDbs,
  onConnect,
  onDisconnect,
  onLoadSample,
  onDiscoverServers,
}: Props) {
  const isSqlite = conn.db_type === "sqlite";
  const isOracle = conn.db_type === "oracle";
  const isMssql = conn.db_type === "mssql";
  const defaultPort = ports[conn.db_type];

  return (
    <aside className="panel connection-panel">
      <div className="brand">
        <span className="brand-glow">Database Schema Viewer</span>
        <p className="brand-sub">Схема связей — красиво и наглядно</p>
      </div>

      <label className="field">
        <span>Тип СУБД</span>
        <select
          value={conn.db_type}
          onChange={(e) =>
            onChange({
              db_type: e.target.value as DbType,
              port: ports[e.target.value as DbType] ?? null,
            })
          }
        >
          {(Object.keys(DB_LABELS) as DbType[]).map((t) => (
            <option key={t} value={t}>
              {DB_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      {isSqlite ? (
        <label className="field">
          <span>Файл базы (.db)</span>
          <input
            type="text"
            value={conn.file_path}
            placeholder="K:\path\to\database.db"
            onChange={(e) => onChange({ file_path: e.target.value })}
          />
        </label>
      ) : (
        <>
          <label className="field">
            <span>Хост {isMssql ? "(имя ПК\\экземпляр)" : ""}</span>
            <input
              type="text"
              value={conn.host}
              placeholder={isMssql ? "SPIRZEN\\SQLEXPRESS" : "localhost"}
              onChange={(e) => onChange({ host: e.target.value })}
            />
            {isMssql && (
              <span className="field-hint">
                Для именованного экземпляра укажите ПК\SQLEXPRESS — порт не нужен
              </span>
            )}
          </label>
          {!isMssql || !conn.host.includes("\\") ? (
            <label className="field field-short">
              <span>Порт</span>
              <input
                type="number"
                value={conn.port ?? defaultPort ?? ""}
                onChange={(e) =>
                  onChange({
                    port: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </label>
          ) : null}
          <label className="field">
            <span>Пользователь</span>
            <input
              type="text"
              value={conn.username}
              autoComplete="username"
              onChange={(e) => onChange({ username: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Пароль</span>
            <input
              type="password"
              value={conn.password}
              autoComplete="current-password"
              onChange={(e) => onChange({ password: e.target.value })}
            />
          </label>
          {isOracle ? (
            <label className="field">
              <span>Service / SID</span>
              <input
                type="text"
                value={conn.database}
                placeholder="ORCL"
                onChange={(e) => onChange({ database: e.target.value })}
              />
            </label>
          ) : null}
          <label className="field">
            <span>База данных</span>
            <div className="field-row">
              <select
                value={conn.database}
                onChange={(e) => onChange({ database: e.target.value })}
              >
                <option value="">— выберите или введите —</option>
                {databases.map((db) => (
                  <option key={db} value={db}>
                    {db}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-icon"
                title="Обновить список"
                onClick={onRefreshDbs}
                disabled={loading}
              >
                ↻
              </button>
            </div>
            <input
              className="mt-sm"
              type="text"
              placeholder="Или введите имя вручную"
              value={conn.database}
              onChange={(e) => onChange({ database: e.target.value })}
            />
          </label>
          {(conn.db_type === "postgresql" || conn.db_type === "mssql") && (
            <label className="field">
              <span>Схема</span>
              <input
                type="text"
                value={conn.schema}
                placeholder={conn.db_type === "postgresql" ? "public" : "dbo"}
                onChange={(e) => onChange({ schema: e.target.value })}
              />
            </label>
          )}
          {isOracle && (
            <label className="field">
              <span>Схема (owner)</span>
              <input
                type="text"
                value={conn.schema}
                placeholder="Имя пользователя"
                onChange={(e) => onChange({ schema: e.target.value })}
              />
            </label>
          )}
        </>
      )}

      {!isSqlite && (
        <button
          type="button"
          className="btn discover"
          onClick={onDiscoverServers}
          disabled={loading}
        >
          Получить сервера
        </button>
      )}

      <div className="btn-group">
        <button type="button" className="btn ghost" onClick={onTest} disabled={loading}>
          Проверить
        </button>
        <button type="button" className="btn primary" onClick={onConnect} disabled={loading}>
          {connectLabel}
        </button>
      </div>

      {connected && (
        <button
          type="button"
          className="btn disconnect"
          onClick={onDisconnect}
          disabled={loading}
        >
          Отключиться
        </button>
      )}

      <button type="button" className="btn sample" onClick={onLoadSample} disabled={loading}>
        Демо SQLite
      </button>

      {status && (
        <p className={`status ${status.startsWith("✓") || status === "Отключено" ? "ok" : "err"}`}>
          {status}
        </p>
      )}
    </aside>
  );
}
