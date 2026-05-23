from connectors.base import BaseConnector
from connectors.mssql_connector import MssqlConnector
from connectors.mysql_connector import MysqlConnector
from connectors.oracle_connector import OracleConnector
from connectors.postgres_connector import PostgresConnector
from connectors.sqlite_connector import SqliteConnector
from models import ConnectionRequest, DbType


def get_connector(conn: ConnectionRequest) -> BaseConnector:
    mapping: dict[DbType, type[BaseConnector]] = {
        DbType.sqlite: SqliteConnector,
        DbType.postgresql: PostgresConnector,
        DbType.mysql: MysqlConnector,
        DbType.mssql: MssqlConnector,
        DbType.oracle: OracleConnector,
    }
    cls = mapping.get(conn.db_type)
    if not cls:
        raise ValueError(f"Неподдерживаемый тип БД: {conn.db_type}")
    return cls(conn)
