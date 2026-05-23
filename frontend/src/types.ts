export type DbType = "sqlite" | "postgresql" | "mysql" | "mssql" | "oracle";

export interface ConnectionRequest {
  db_type: DbType;
  host: string;
  port: number | null;
  username: string;
  password: string;
  database: string;
  file_path: string;
  schema: string;
}

export interface ColumnInfo {
  name: string;
  data_type: string;
  nullable: boolean;
  is_primary_key: boolean;
  is_foreign_key: boolean;
  default_value: string | null;
}

export interface ForeignKeyInfo {
  id: string;
  name: string;
  from_table: string;
  from_columns: string[];
  to_table: string;
  to_columns: string[];
  on_delete: string | null;
  on_update: string | null;
}

export interface TableInfo {
  name: string;
  schema: string | null;
  columns: ColumnInfo[];
  primary_key: string[];
}

export interface SchemaResponse {
  tables: TableInfo[];
  foreign_keys: ForeignKeyInfo[];
  db_label: string;
}

export interface DefaultsResponse {
  host: string;
  ports: Record<DbType, number | null>;
  db_types: DbType[];
}

export interface DiscoveredServer {
  db_type: DbType;
  host: string;
  port: number | null;
  label: string;
  source: string;
}
