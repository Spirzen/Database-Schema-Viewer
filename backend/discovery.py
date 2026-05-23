"""Discover local database servers (ports, Windows services, SQL instances)."""
from __future__ import annotations

import platform
import socket
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

from models import DbType


@dataclass
class DiscoveredServer:
    db_type: str
    host: str
    port: int | None
    label: str
    source: str


def _try_port(host: str, port: int, timeout: float = 0.35) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _scan_ports(host: str, ports: list[int]) -> list[int]:
    if not ports:
        return []
    open_ports: list[int] = []
    with ThreadPoolExecutor(max_workers=min(16, len(ports))) as pool:
        futures = {pool.submit(_try_port, host, p): p for p in ports}
        for fut in as_completed(futures):
            if fut.result():
                open_ports.append(futures[fut])
    return sorted(open_ports)


def _hostname() -> str:
    try:
        return socket.gethostname().split(".")[0]
    except OSError:
        return "localhost"


def _discover_postgres(hosts: list[str]) -> list[DiscoveredServer]:
    found: list[DiscoveredServer] = []
    ports = list(range(5432, 5442))
    for host in hosts:
        for port in _scan_ports(host, ports):
            found.append(
                DiscoveredServer(
                    db_type=DbType.postgresql.value,
                    host=host,
                    port=port,
                    label=f"PostgreSQL — {host}:{port}",
                    source="port_scan",
                )
            )
    return found


def _discover_mysql(hosts: list[str]) -> list[DiscoveredServer]:
    found: list[DiscoveredServer] = []
    ports = [3306, 3307, 33060]
    for host in hosts:
        for port in _scan_ports(host, ports):
            found.append(
                DiscoveredServer(
                    db_type=DbType.mysql.value,
                    host=host,
                    port=port,
                    label=f"MySQL — {host}:{port}",
                    source="port_scan",
                )
            )
    return found


def _discover_mssql_port(hosts: list[str]) -> list[DiscoveredServer]:
    found: list[DiscoveredServer] = []
    for host in hosts:
        if _try_port(host, 1433):
            found.append(
                DiscoveredServer(
                    db_type=DbType.mssql.value,
                    host=host,
                    port=1433,
                    label=f"SQL Server — {host},1433",
                    source="port_scan",
                )
            )
    return found


def _mssql_registry_instances() -> list[DiscoveredServer]:
    if platform.system() != "Windows":
        return []
    found: list[DiscoveredServer] = []
    computer = _hostname()
    try:
        import winreg

        key_path = r"SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL"
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as key:
            i = 0
            while True:
                try:
                    inst_name, _, _ = winreg.EnumValue(key, i)
                    i += 1
                    if inst_name.upper() == "MSSQLSERVER":
                        host = computer
                        label = f"SQL Server — {computer} (default)"
                    else:
                        host = f"{computer}\\{inst_name}"
                        label = f"SQL Server — {host}"
                    found.append(
                        DiscoveredServer(
                            db_type=DbType.mssql.value,
                            host=host,
                            port=None,
                            label=label,
                            source="registry",
                        )
                    )
                except OSError:
                    break
    except OSError:
        pass
    return found


def _parse_sql_browser_payload(data: bytes, src_host: str) -> list[DiscoveredServer]:
    found: list[DiscoveredServer] = []
    try:
        text = data[3:].decode("utf-16le", errors="ignore")
    except Exception:
        return found
    chunks = [c for c in text.split(";") if c]
    server_name = _hostname()
    i = 0
    while i < len(chunks) - 1:
        if chunks[i] == "ServerName":
            server_name = chunks[i + 1]
            i += 2
            continue
        if chunks[i] == "InstanceName":
            inst = chunks[i + 1]
            host = server_name if inst.upper() == "MSSQLSERVER" else f"{server_name}\\{inst}"
            found.append(
                DiscoveredServer(
                    db_type=DbType.mssql.value,
                    host=host,
                    port=None,
                    label=f"SQL Server — {host}",
                    source="sql_browser",
                )
            )
            i += 2
            continue
        i += 1
    if src_host not in ("127.0.0.1", "0.0.0.0") and _try_port(src_host, 1433):
        found.append(
            DiscoveredServer(
                db_type=DbType.mssql.value,
                host=src_host,
                port=1433,
                label=f"SQL Server — {src_host}:1433",
                source="sql_browser",
            )
        )
    return found


def _mssql_sql_browser(timeout: float = 1.2) -> list[DiscoveredServer]:
    found: list[DiscoveredServer] = []
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(timeout)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        msg = b"\x02"
        sock.sendto(msg, ("<broadcast>", 1434))
        sock.sendto(msg, ("127.0.0.1", 1434))
        try:
            while True:
                data, addr = sock.recvfrom(4096)
                found.extend(_parse_sql_browser_payload(data, addr[0]))
        except socket.timeout:
            pass
        sock.close()
    except OSError:
        pass
    return found


def _windows_services() -> list[DiscoveredServer]:
    if platform.system() != "Windows":
        return []
    found: list[DiscoveredServer] = []
    computer = _hostname()
    try:
        result = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                "Get-Service | Where-Object {$_.Status -eq 'Running'} | "
                "Select-Object -ExpandProperty Name",
            ],
            capture_output=True,
            text=True,
            timeout=8,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        for line in result.stdout.splitlines():
            n = line.strip()
            low = n.lower()
            if not n:
                continue
            if "postgresql" in low:
                found.append(
                    DiscoveredServer(
                        db_type=DbType.postgresql.value,
                        host="localhost",
                        port=5432,
                        label=f"PostgreSQL (служба {n}) — localhost:5432",
                        source="service",
                    )
                )
            elif "mysql" in low or "mariadb" in low:
                found.append(
                    DiscoveredServer(
                        db_type=DbType.mysql.value,
                        host="localhost",
                        port=3306,
                        label=f"MySQL (служба {n}) — localhost:3306",
                        source="service",
                    )
                )
            elif low == "mssqlserver" or low.startswith("mssql$"):
                inst = "MSSQLSERVER" if low == "mssqlserver" else n.split("$", 1)[-1]
                host = computer if inst.upper() == "MSSQLSERVER" else f"{computer}\\{inst}"
                found.append(
                    DiscoveredServer(
                        db_type=DbType.mssql.value,
                        host=host,
                        port=None,
                        label=f"SQL Server (служба {n}) — {host}",
                        source="service",
                    )
                )
    except (OSError, subprocess.SubprocessError):
        pass
    return found


def _dedupe(servers: list[DiscoveredServer]) -> list[DiscoveredServer]:
    seen: set[tuple[str, str, int | None]] = set()
    out: list[DiscoveredServer] = []
    for s in servers:
        key = (s.db_type, s.host.lower(), s.port)
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
    return sorted(out, key=lambda x: (x.db_type, x.host, x.port or 0))


def discover_servers() -> list[DiscoveredServer]:
    unique_hosts: list[str] = []
    for h in ("127.0.0.1", "localhost", _hostname()):
        if h not in unique_hosts:
            unique_hosts.append(h)

    results: list[DiscoveredServer] = []
    results.extend(_discover_postgres(unique_hosts))
    results.extend(_discover_mysql(unique_hosts))
    results.extend(_discover_mssql_port(unique_hosts))
    results.extend(_mssql_registry_instances())
    results.extend(_mssql_sql_browser())
    results.extend(_windows_services())
    return _dedupe(results)
