import type {
  ConnectionRequest,
  DefaultsResponse,
  DiscoveredServer,
  SchemaResponse,
} from "./types";

interface TestResponse {
  ok: boolean;
  message: string;
}

interface DatabaseListResponse {
  databases: string[];
}

const API_TIMEOUT_MS = 180_000;

async function apiFetch(
  url: string,
  init?: RequestInit,
  timeoutMs = API_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(
        "Превышено время ожидания. Большая схема может грузиться долго — проверьте backend в консоли."
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export function sanitizeHostInput(host: string): string {
  let h = host.trim();
  for (const p of ["http://", "https://"]) {
    if (h.toLowerCase().startsWith(p)) h = h.slice(p.length);
  }
  if (!h.includes("\\")) {
    h = h.split("/")[0];
  }
  return h.trim();
}

export async function fetchDefaults(): Promise<DefaultsResponse> {
  const r = await apiFetch("/api/defaults", undefined, 15_000);
  if (!r.ok) throw new Error("Не удалось загрузить настройки");
  return r.json();
}

export async function fetchSamplePath(): Promise<string> {
  const r = await apiFetch("/api/sample-path", undefined, 15_000);
  if (!r.ok) return "";
  const data = await r.json();
  return data.path ?? "";
}

export async function testConnection(
  conn: ConnectionRequest
): Promise<TestResponse> {
  const r = await apiFetch("/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(conn),
  });
  return r.json();
}

export async function listDatabases(
  conn: ConnectionRequest
): Promise<string[]> {
  const r = await apiFetch("/api/databases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(conn),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail ?? "Ошибка получения списка БД");
  }
  const data: DatabaseListResponse = await r.json();
  return data.databases;
}

export async function discoverServers(): Promise<DiscoveredServer[]> {
  const r = await apiFetch("/api/discover-servers", undefined, 30_000);
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail ?? "Ошибка поиска серверов");
  }
  const data = await r.json();
  return data.servers ?? [];
}

export async function fetchSchema(
  conn: ConnectionRequest
): Promise<SchemaResponse> {
  const r = await apiFetch("/api/schema", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(conn),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail ?? "Ошибка загрузки схемы");
  }
  return r.json();
}
