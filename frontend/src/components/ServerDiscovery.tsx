import type { DiscoveredServer } from "../types";

interface Props {
  servers: DiscoveredServer[];
  loading: boolean;
  open: boolean;
  onClose: () => void;
  onPick: (server: DiscoveredServer) => void;
}

export function ServerDiscovery({
  servers,
  loading,
  open,
  onClose,
  onPick,
}: Props) {
  if (!open) return null;

  const grouped = {
    postgresql: servers.filter((s) => s.db_type === "postgresql"),
    mysql: servers.filter((s) => s.db_type === "mysql"),
    mssql: servers.filter((s) => s.db_type === "mssql"),
  };

  return (
    <div className="discovery-overlay" onClick={onClose}>
      <div className="discovery-modal" onClick={(e) => e.stopPropagation()}>
        <div className="discovery-header">
          <h3>Найденные серверы</h3>
          <button type="button" className="btn-close" onClick={onClose}>
            ×
          </button>
        </div>
        {loading ? (
          <p className="discovery-status">Сканирование портов и служб…</p>
        ) : servers.length === 0 ? (
          <p className="discovery-status">
            Серверы не найдены. Убедитесь, что СУБД запущена на этом компьютере.
          </p>
        ) : (
          <div className="discovery-list">
            {(["postgresql", "mysql", "mssql"] as const).map((type) => {
              const list = grouped[type];
              if (list.length === 0) return null;
              const title =
                type === "postgresql"
                  ? "PostgreSQL"
                  : type === "mysql"
                    ? "MySQL"
                    : "MS SQL Server";
              return (
                <section key={type}>
                  <h4>{title}</h4>
                  <ul>
                    {list.map((s, i) => (
                      <li key={`${s.host}-${s.port}-${i}`}>
                        <button type="button" onClick={() => onPick(s)}>
                          <span className="discovery-label">{s.label}</span>
                          <span className="discovery-src">{s.source}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
