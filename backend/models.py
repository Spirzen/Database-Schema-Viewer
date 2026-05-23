from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class DbType(str, Enum):
    sqlite = "sqlite"
    postgresql = "postgresql"
    mysql = "mysql"
    mssql = "mssql"
    oracle = "oracle"


DEFAULT_PORTS: dict[DbType, int | None] = {
    DbType.sqlite: None,
    DbType.postgresql: 5432,
    DbType.mysql: 3306,
    DbType.mssql: 1433,
    DbType.oracle: 1521,
}


class ConnectionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    db_type: DbType
    host: str = "localhost"
    port: int | None = None
    username: str = ""
    password: str = ""
    database: str = ""
    file_path: str = ""
    db_schema: str = Field(default="", alias="schema")


class ConnectionTestResponse(BaseModel):
    ok: bool
    message: str = ""


class DatabaseListResponse(BaseModel):
    databases: list[str]


class ColumnInfo(BaseModel):
    name: str
    data_type: str
    nullable: bool = True
    is_primary_key: bool = False
    is_foreign_key: bool = False
    default_value: str | None = None


class ForeignKeyInfo(BaseModel):
    id: str
    name: str
    from_table: str
    from_columns: list[str]
    to_table: str
    to_columns: list[str]
    on_delete: str | None = None
    on_update: str | None = None


class TableInfo(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    table_schema: str | None = Field(default=None, alias="schema")
    columns: list[ColumnInfo]
    primary_key: list[str] = Field(default_factory=list)


class SchemaResponse(BaseModel):
    tables: list[TableInfo]
    foreign_keys: list[ForeignKeyInfo]
    db_label: str = ""


class ConnectPayload(BaseModel):
    connection: ConnectionRequest
    extra: dict[str, Any] = Field(default_factory=dict)
