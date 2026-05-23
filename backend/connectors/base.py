from abc import ABC, abstractmethod

from models import ConnectionRequest, ForeignKeyInfo, TableInfo


class BaseConnector(ABC):
    def __init__(self, conn: ConnectionRequest):
        self.conn = conn

    @abstractmethod
    def test_connection(self) -> None:
        """Raise on failure."""

    @abstractmethod
    def list_databases(self) -> list[str]:
        pass

    @abstractmethod
    def fetch_schema(self) -> tuple[list[TableInfo], list[ForeignKeyInfo]]:
        pass

    def effective_port(self) -> int | None:
        from models import DEFAULT_PORTS, DbType

        if self.conn.port is not None:
            return self.conn.port
        return DEFAULT_PORTS.get(self.conn.db_type)
