import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Allow running from backend/ directory
sys.path.insert(0, str(Path(__file__).parent))

from connectors import get_connector
from discovery import discover_servers
from models import (
    ConnectionRequest,
    ConnectionTestResponse,
    DatabaseListResponse,
    DbType,
    DEFAULT_PORTS,
    SchemaResponse,
)

app = FastAPI(title="Database Schema Viewer API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/defaults")
def get_defaults():
    return {
        "host": "localhost",
        "ports": {k.value: v for k, v in DEFAULT_PORTS.items()},
        "db_types": [t.value for t in DbType],
    }


@app.get("/api/discover-servers")
def api_discover_servers():
    """Scan localhost for PostgreSQL, MySQL, MS SQL Server instances."""
    try:
        servers = discover_servers()
        return {
            "servers": [
                {
                    "db_type": s.db_type,
                    "host": s.host,
                    "port": s.port,
                    "label": s.label,
                    "source": s.source,
                }
                for s in servers
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/api/sample-path")
def sample_path():
    root = Path(__file__).parent.parent
    sample = root / "sample" / "demo.db"
    return {"path": str(sample.resolve()) if sample.exists() else ""}


@app.post("/api/test", response_model=ConnectionTestResponse)
def test_connection(conn: ConnectionRequest):
    try:
        get_connector(conn).test_connection()
        return ConnectionTestResponse(ok=True, message="Подключение успешно")
    except Exception as e:
        return ConnectionTestResponse(ok=False, message=str(e))


@app.post("/api/databases", response_model=DatabaseListResponse)
def list_databases(conn: ConnectionRequest):
    try:
        if conn.db_type == DbType.sqlite:
            path = conn.file_path or conn.database
            return DatabaseListResponse(databases=[Path(path).name if path else ""])
        dbs = get_connector(conn).list_databases()
        return DatabaseListResponse(databases=dbs)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/api/schema", response_model=SchemaResponse)
def fetch_schema(conn: ConnectionRequest):
    try:
        if conn.db_type != DbType.sqlite and not (conn.database or "").strip():
            raise ValueError("Выберите базу данных перед подключением")
        connector = get_connector(conn)
        tables, fks = connector.fetch_schema()
        label = conn.database or conn.file_path or conn.db_schema or conn.db_type.value
        return SchemaResponse(tables=tables, foreign_keys=fks, db_label=label)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


def _server_port() -> int:
    import os

    return int(os.environ.get("DSV_PORT", "18765"))


if __name__ == "__main__":
    import os
    import uvicorn

    port = _server_port()
    reload = os.environ.get("DSV_RELOAD", "").lower() in ("1", "true", "yes")
    uvicorn.run("main:app", host="127.0.0.1", port=port, reload=reload)
