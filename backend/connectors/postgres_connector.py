import psycopg2
from psycopg2.extras import RealDictCursor

from connectors.base import BaseConnector
from models import ColumnInfo, ForeignKeyInfo, TableInfo
from util import pg_statement_timeout_options, sanitize_host


class PostgresConnector(BaseConnector):
    def _schema_name(self) -> str:
        return self.conn.db_schema or "public"

    def _connect(self, database: str | None = None, *, require_database: bool = False):
        db = database if database is not None else self.conn.database
        if not db:
            if require_database:
                raise ValueError("Выберите базу данных")
            db = "postgres"
        return psycopg2.connect(
            host=sanitize_host(self.conn.host),
            port=self.effective_port(),
            user=self.conn.username or None,
            password=self.conn.password or None,
            dbname=db,
            connect_timeout=10,
            options=pg_statement_timeout_options(120_000),
        )

    def test_connection(self) -> None:
        with self._connect(require_database=bool(self.conn.database)):
            pass

    def list_databases(self) -> list[str]:
        with self._connect("postgres") as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname"
                )
                return [r[0] for r in cur.fetchall()]

    def fetch_schema(self) -> tuple[list[TableInfo], list[ForeignKeyInfo]]:
        schema = self._schema_name()
        tables: list[TableInfo] = []
        fks: list[ForeignKeyInfo] = []

        with self._connect(require_database=True) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT
                        c.relname AS table_name,
                        a.attname AS column_name,
                        pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
                        NOT a.attnotnull AS nullable,
                        pg_get_expr(ad.adbin, ad.adrelid) AS column_default,
                        EXISTS (
                            SELECT 1 FROM pg_index i
                            WHERE i.indrelid = c.oid AND i.indisprimary
                              AND a.attnum = ANY(i.indkey)
                        ) AS is_pk
                    FROM pg_catalog.pg_class c
                    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
                    LEFT JOIN pg_catalog.pg_attrdef ad
                        ON ad.adrelid = c.oid AND ad.adnum = a.attnum
                    WHERE n.nspname = %s
                      AND c.relkind = 'r'
                      AND a.attnum > 0
                      AND NOT a.attisdropped
                    ORDER BY c.relname, a.attnum
                    """,
                    (schema,),
                )
                rows = cur.fetchall()
                by_table: dict[str, list] = {}
                pk_map: dict[str, list[str]] = {}
                for r in rows:
                    tname = r["table_name"]
                    by_table.setdefault(tname, []).append(r)
                    if r["is_pk"]:
                        pk_map.setdefault(tname, []).append(r["column_name"])

                cur.execute(
                    """
                    SELECT
                        con.conname AS constraint_name,
                        src.relname AS from_table,
                        sa.attname AS from_column,
                        tgt.relname AS to_table,
                        ta.attname AS to_column,
                        CASE con.confdeltype
                            WHEN 'a' THEN 'NO ACTION'
                            WHEN 'r' THEN 'RESTRICT'
                            WHEN 'c' THEN 'CASCADE'
                            WHEN 'n' THEN 'SET NULL'
                            WHEN 'd' THEN 'SET DEFAULT'
                            ELSE NULL
                        END AS delete_rule,
                        CASE con.confupdtype
                            WHEN 'a' THEN 'NO ACTION'
                            WHEN 'r' THEN 'RESTRICT'
                            WHEN 'c' THEN 'CASCADE'
                            WHEN 'n' THEN 'SET NULL'
                            WHEN 'd' THEN 'SET DEFAULT'
                            ELSE NULL
                        END AS update_rule
                    FROM pg_catalog.pg_constraint con
                    JOIN pg_catalog.pg_class src ON src.oid = con.conrelid
                    JOIN pg_catalog.pg_namespace n ON n.oid = src.relnamespace
                    JOIN pg_catalog.pg_class tgt ON tgt.oid = con.confrelid
                    CROSS JOIN LATERAL generate_subscripts(con.conkey, 1) AS gs(idx)
                    JOIN pg_catalog.pg_attribute sa
                        ON sa.attrelid = src.oid AND sa.attnum = con.conkey[gs.idx]
                    JOIN pg_catalog.pg_attribute ta
                        ON ta.attrelid = tgt.oid AND ta.attnum = con.confkey[gs.idx]
                    WHERE con.contype = 'f' AND n.nspname = %s
                    ORDER BY con.conname, gs.idx
                    """,
                    (schema,),
                )
                fk_groups: dict[str, dict] = {}
                for r in cur.fetchall():
                    key = r["constraint_name"]
                    if key not in fk_groups:
                        fk_groups[key] = {
                            "name": key,
                            "from_table": r["from_table"],
                            "from_columns": [],
                            "to_table": r["to_table"],
                            "to_columns": [],
                            "on_delete": r["delete_rule"],
                            "on_update": r["update_rule"],
                        }
                    fk_groups[key]["from_columns"].append(r["from_column"])
                    fk_groups[key]["to_columns"].append(r["to_column"])

                for tname, cols in by_table.items():
                    columns = [
                        ColumnInfo(
                            name=r["column_name"],
                            data_type=r["data_type"],
                            nullable=r["nullable"],
                            is_primary_key=r["is_pk"],
                            default_value=str(r["column_default"]) if r["column_default"] else None,
                        )
                        for r in cols
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
