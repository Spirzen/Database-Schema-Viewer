import oracledb

from connectors.base import BaseConnector
from models import ColumnInfo, ForeignKeyInfo, TableInfo


class OracleConnector(BaseConnector):
    def _dsn(self) -> str:
        port = self.effective_port() or 1521
        return f"{self.conn.host}:{port}/{self.conn.database}"

    def _connect(self):
        return oracledb.connect(
            user=self.conn.username,
            password=self.conn.password,
            dsn=self._dsn(),
        )

    def test_connection(self) -> None:
        with self._connect():
            pass

    def list_databases(self) -> list[str]:
        if self.conn.database:
            return [self.conn.database]
        with self._connect() as conn:
            cur = conn.cursor()
            cur.execute("SELECT name FROM v$database")
            row = cur.fetchone()
            return [row[0]] if row else []

    def fetch_schema(self) -> tuple[list[TableInfo], list[ForeignKeyInfo]]:
        schema = (self.conn.db_schema or self.conn.username or "").upper()
        if not schema:
            raise ValueError("Укажите схему (обычно имя пользователя)")

        tables: list[TableInfo] = []
        fks: list[ForeignKeyInfo] = []

        with self._connect() as conn:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT utc.table_name, utc.column_name, utc.data_type,
                       utc.nullable, utc.data_default,
                       CASE WHEN ucc.column_name IS NOT NULL THEN 1 ELSE 0 END AS is_pk
                FROM all_tab_columns utc
                JOIN all_tables at ON at.owner = utc.owner AND at.table_name = utc.table_name
                LEFT JOIN (
                    SELECT ucc.owner, ucc.table_name, ucc.column_name
                    FROM all_constraints ac
                    JOIN all_cons_columns ucc ON ac.owner = ucc.owner
                        AND ac.constraint_name = ucc.constraint_name
                    WHERE ac.constraint_type = 'P'
                ) ucc ON ucc.owner = utc.owner
                    AND ucc.table_name = utc.table_name
                    AND ucc.column_name = utc.column_name
                WHERE utc.owner = :owner
                ORDER BY utc.table_name, utc.column_id
                """,
                owner=schema,
            )
            rows = cur.fetchall()
            by_table: dict[str, list] = {}
            pk_map: dict[str, list[str]] = {}
            for r in rows:
                tname = r[0]
                by_table.setdefault(tname, []).append(r)
                if r[5]:
                    pk_map.setdefault(tname, []).append(r[1])

            cur.execute(
                """
                SELECT a.constraint_name,
                       a.table_name AS child_table,
                       ac.column_name AS child_column,
                       c.table_name AS parent_table,
                       cc.column_name AS parent_column,
                       a.delete_rule
                FROM all_constraints a
                JOIN all_cons_columns ac ON a.owner = ac.owner
                    AND a.constraint_name = ac.constraint_name
                JOIN all_constraints c_pk ON a.r_constraint_name = c_pk.constraint_name
                    AND a.r_owner = c_pk.owner
                JOIN all_cons_columns cc ON c_pk.owner = cc.owner
                    AND c_pk.constraint_name = cc.constraint_name
                    AND ac.position = cc.position
                JOIN all_tables c ON c_pk.owner = c.owner AND c_pk.table_name = c.table_name
                WHERE a.constraint_type = 'R' AND a.owner = :owner
                ORDER BY a.constraint_name, ac.position
                """,
                owner=schema,
            )
            fk_groups: dict[str, dict] = {}
            for r in cur.fetchall():
                key = r[0]
                if key not in fk_groups:
                    fk_groups[key] = {
                        "name": key,
                        "from_table": r[1],
                        "from_columns": [],
                        "to_table": r[3],
                        "to_columns": [],
                        "on_delete": r[5],
                        "on_update": None,
                    }
                fk_groups[key]["from_columns"].append(r[2])
                fk_groups[key]["to_columns"].append(r[4])

            for tname, col_rows in by_table.items():
                columns = [
                    ColumnInfo(
                        name=r[1],
                        data_type=r[2],
                        nullable=r[3] == "Y",
                        is_primary_key=bool(r[5]),
                        default_value=str(r[4]).strip() if r[4] else None,
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
