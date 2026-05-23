import pymysql
from pymysql.cursors import DictCursor

from connectors.base import BaseConnector
from models import ColumnInfo, ForeignKeyInfo, TableInfo


class MysqlConnector(BaseConnector):
    def _connect(self, database: str | None = None):
        from util import sanitize_host

        return pymysql.connect(
            host=sanitize_host(self.conn.host),
            port=self.effective_port() or 3306,
            user=self.conn.username or None,
            password=self.conn.password or None,
            database=database or self.conn.database or None,
            connect_timeout=10,
            cursorclass=DictCursor,
        )

    def test_connection(self) -> None:
        with self._connect():
            pass

    def list_databases(self) -> list[str]:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SHOW DATABASES")
                return [r["Database"] for r in cur.fetchall()]

    def fetch_schema(self) -> tuple[list[TableInfo], list[ForeignKeyInfo]]:
        db = self.conn.database
        if not db:
            raise ValueError("Выберите базу данных")
        tables: list[TableInfo] = []
        fks: list[ForeignKeyInfo] = []

        with self._connect(db) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT,
                           COLUMN_KEY
                    FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = %s
                    ORDER BY TABLE_NAME, ORDINAL_POSITION
                    """,
                    (db,),
                )
                rows = cur.fetchall()
                by_table: dict[str, list] = {}
                pk_map: dict[str, list[str]] = {}
                for r in rows:
                    tname = r["TABLE_NAME"]
                    by_table.setdefault(tname, []).append(r)
                    if r["COLUMN_KEY"] == "PRI":
                        pk_map.setdefault(tname, []).append(r["COLUMN_NAME"])

                cur.execute(
                    """
                    SELECT
                        k.CONSTRAINT_NAME,
                        k.TABLE_NAME AS from_table,
                        k.COLUMN_NAME AS from_column,
                        k.REFERENCED_TABLE_NAME AS to_table,
                        k.REFERENCED_COLUMN_NAME AS to_column,
                        rc.DELETE_RULE,
                        rc.UPDATE_RULE
                    FROM information_schema.KEY_COLUMN_USAGE k
                    JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
                      ON k.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
                     AND k.TABLE_SCHEMA = rc.CONSTRAINT_SCHEMA
                    WHERE k.TABLE_SCHEMA = %s
                      AND k.REFERENCED_TABLE_NAME IS NOT NULL
                    ORDER BY k.CONSTRAINT_NAME, k.ORDINAL_POSITION
                    """,
                    (db,),
                )
                fk_groups: dict[str, dict] = {}
                for r in cur.fetchall():
                    key = r["CONSTRAINT_NAME"]
                    if key not in fk_groups:
                        fk_groups[key] = {
                            "name": key,
                            "from_table": r["from_table"],
                            "from_columns": [],
                            "to_table": r["to_table"],
                            "to_columns": [],
                            "on_delete": r["DELETE_RULE"],
                            "on_update": r["UPDATE_RULE"],
                        }
                    fk_groups[key]["from_columns"].append(r["from_column"])
                    fk_groups[key]["to_columns"].append(r["to_column"])

                for tname, cols in by_table.items():
                    columns = [
                        ColumnInfo(
                            name=r["COLUMN_NAME"],
                            data_type=r["DATA_TYPE"],
                            nullable=r["IS_NULLABLE"] == "YES",
                            is_primary_key=r["COLUMN_KEY"] == "PRI",
                            default_value=str(r["COLUMN_DEFAULT"]) if r["COLUMN_DEFAULT"] is not None else None,
                        )
                        for r in cols
                    ]
                    tables.append(
                        TableInfo(
                            name=tname,
                            table_schema=db,
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
