import re


def sanitize_host(host: str) -> str:
    """Strip URL junk from host field (e.g. http://127.0.0.1/)."""
    h = (host or "").strip()
    for prefix in ("http://", "https://"):
        if h.lower().startswith(prefix):
            h = h[len(prefix) :]
    h = h.split("/")[0].split(":")[0] if "\\" not in h else h.split("/")[0]
    return h.strip() or "localhost"


def pg_statement_timeout_options(timeout_ms: int = 120_000) -> str:
    return f"-c statement_timeout={timeout_ms}"
