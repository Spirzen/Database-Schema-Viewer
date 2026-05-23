import pyodbc

from connectors.base import BaseConnector
from models import ColumnInfo, ForeignKeyInfo, TableInfo


class MssqlConnector(BaseConnector):
    def _server_spec(self) -> str:
        from util import sanitize_host

        host = sanitize_host(self.conn.host)
        # Named instance: SPIRZEN\SQLEXPRESS — do not append port
        if "\\" in host:
            return host
        port = self.effective_port() or 1433
        return f"{host},{port}"

    def _conn_str(self, database: str | None = None) -> str:
        db = database or self.conn.database or "master"
        driver = "{ODBC Driver 18 for SQL Server}"
        try:
            pyodbc.drivers().index("ODBC Driver 18 for SQL Server")
        except ValueError:
            driver = "{ODBC Driver 17 for SQL Server}"
        parts = [
            f"DRIVER={driver}",
            f"SERVER={self._server_spec()}",
            f"DATABASE={db}",
            "TrustServerCertificate=yes",
        ]
        if self.conn.username:
            parts.append(f"UID={self.conn.username}")
            parts.append(f"PWD={self.conn.password}")
        else:
            parts.append("Trusted_Connection=yes")
        return ";".join(parts)

    def _connect(self, database: str | None = None):
        return pyodbc.connect(self._conn_str(database), timeout=10)

    def test_connection(self) -> None:
        with self._connect():
            pass

    def list_databases(self) -> list[str]:
        with self._connect("master") as conn:
            cur = conn.cursor()
            cur.execute("SELECT name FROM sys.databases WHERE database_id > 4 ORDER BY name")
            return [r[0] for r in cur.fetchall()]

    def fetch_schema(self) -> tuple[list[TableInfo], list[ForeignKeyInfo]]:
        schema = self.conn.db_schema or "dbo"
        db = self.conn.database
        if not db:
            raise ValueError("Выберите базу данных")

        tables: list[TableInfo] = []
        fks: list[ForeignKeyInfo] = []

        with self._connect(db) as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT t.name AS table_name, c.name AS column_name,
                       ty.name AS data_type, c.is_nullable, dc.definition AS column_default,
                       CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_pk
                FROM sys.tables t
                JOIN sys.columns c ON c.object_id = t.object_id
                JOIN sys.types ty ON ty.user_type_id = c.user_type_id
                LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = c.object_id
                    AND dc.parent_column_id = c.column_id
                LEFT JOIN (
                    SELECT ic.object_id, ic.column_id
                    FROM sys.indexes i
                    JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
                    WHERE i.is_primary_key = 1
                ) pk ON pk.object_id = c.object_id AND pk.column_id = c.column_id
                JOIN sys.schemas s ON s.schema_id = t.schema_id
                WHERE s.name = ? AND t.is_ms_shipped = 0
                ORDER BY t.name, c.column_id
                """,
                (schema,),
            )
            cols = cur.fetchall()
            by_table: dict[str, list] = {}
            pk_map: dict[str, list[str]] = {}
            for r in cols:
                tname = r.table_name
                by_table.setdefault(tname, []).append(r)
                if r.is_pk:
                    pk_map.setdefault(tname, []).append(r.column_name)

            cur.execute(
                """
                SELECT
                    fk.name AS constraint_name,
                    tp.name AS from_table,
                    cp.name AS from_column,
                    tr.name AS to_table,
                    cr.name AS to_column,
                    delete_referential_action_desc,
                    update_referential_action_desc
                FROM sys.foreign_keys fk
                INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
                INNER JOIN sys.tables tp ON fkc.parent_object_id = tp.object_id
                INNER JOIN sys.tables tr ON fkc.referenced_object_id = tr.object_id
                INNER JOIN sys.columns cp ON fkc.parent_object_id = cp.object_id
                    AND fkc.parent_column_id = cp.column_id
                INNER JOIN sys.columns cr ON fkc.referenced_object_id = cr.object_id
                    AND fkc.referenced_column_id = cr.column_id
                INNER JOIN sys.schemas sp ON sp.schema_id = tp.schema_id
                WHERE sp.name = ?
                ORDER BY fk.name, fkc.constraint_column_id
                """,
                (schema,),
            )
            fk_groups: dict[str, dict] = {}
            for r in cur.fetchall():
                key = r.constraint_name
                if key not in fk_groups:
                    fk_groups[key] = {
                        "name": key,
                        "from_table": r.from_table,
                        "from_columns": [],
                        "to_table": r.to_table,
                        "to_columns": [],
                        "on_delete": r.delete_referential_action_desc,
                        "on_update": r.update_referential_action_desc,
                    }
                fk_groups[key]["from_columns"].append(r.from_column)
                fk_groups[key]["to_columns"].append(r.to_column)

            for tname, col_rows in by_table.items():
                columns = [
                    ColumnInfo(
                        name=r.column_name,
                        data_type=r.data_type,
                        nullable=bool(r.is_nullable),
                        is_primary_key=bool(r.is_pk),
                        default_value=str(r.column_default) if r.column_default else None,
                    )
                    for r in col_rows
                ]
                tables.append(
                    TableInfo(
                        name=tname,
                        table_schema=schema,
                        columns=columns,
                        primary_key=pk_map.get(tname, []),
                    )
                )

            for key, g in fk_groups.items():
                table = next((t for t in tables if t.name == g["from_table"]), None)
                if table:
                    for col in table.columns:
                        if col.name in g["from_columns"]:
                            col.is_foreign_key = True
                fks.append(
                    ForeignKeyInfo(
                        id=key,
                        name=g["name"],
                        from_table=g["from_table"],
                        from_columns=g["from_columns"],
                        to_table=g["to_table"],
                        to_columns=g["to_columns"],
                        on_delete=g["on_delete"],
                        on_update=g["on_update"],
                    )
                )

        return tables, fks
