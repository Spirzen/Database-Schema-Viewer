import sqlite3
from pathlib import Path

from connectors.base import BaseConnector
from models import ColumnInfo, ConnectionRequest, ForeignKeyInfo, TableInfo


class SqliteConnector(BaseConnector):
    def _path(self) -> str:
        p = self.conn.file_path or self.conn.database
        if not p:
            raise ValueError("Укажите путь к файлу SQLite")
        return str(Path(p).expanduser().resolve())

    def test_connection(self) -> None:
        with sqlite3.connect(self._path()) as c:
            c.execute("SELECT 1")

    def list_databases(self) -> list[str]:
        return [Path(self._path()).name]

    def fetch_schema(self) -> tuple[list[TableInfo], list[ForeignKeyInfo]]:
        path = self._path()
        tables: list[TableInfo] = []
        fks: list[ForeignKeyInfo] = []

        with sqlite3.connect(path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(
                """
                SELECT name FROM sqlite_master
                WHERE type='table' AND name NOT LIKE 'sqlite_%'
                ORDER BY name
                """
            )
            table_names = [r["name"] for r in cur.fetchall()]

            for tname in table_names:
                cur.execute(f'PRAGMA table_info("{tname}")')
                cols_raw = cur.fetchall()
                pk_cols = [r["name"] for r in cols_raw if r["pk"]]

                columns: list[ColumnInfo] = []
                for r in cols_raw:
                    columns.append(
                        ColumnInfo(
                            name=r["name"],
                            data_type=r["type"] or "TEXT",
                            nullable=not r["notnull"],
                            is_primary_key=bool(r["pk"]),
                            default_value=str(r["dflt_value"]) if r["dflt_value"] is not None else None,
                        )
                    )

                tables.append(
                    TableInfo(name=tname, table_schema=None, columns=columns, primary_key=pk_cols)
                )

                cur.execute(f'PRAGMA foreign_key_list("{tname}")')
                for i, fk in enumerate(cur.fetchall()):
                    fk_id = f"sqlite_{tname}_{i}"
                    from_cols = [fk["from"]]
                    to_cols = [fk["to"]]
                    for c in columns:
                        if c.name == fk["from"]:
                            c.is_foreign_key = True
                    fks.append(
                        ForeignKeyInfo(
                            id=fk_id,
                            name=fk_id,
                            from_table=tname,
                            from_columns=from_cols,
                            to_table=fk["table"],
                            to_columns=to_cols,
                            on_delete=fk["on_delete"],
                            on_update=fk["on_update"],
                        )
                    )

        return tables, fks
