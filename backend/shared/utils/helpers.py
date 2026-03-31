import ipaddress
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from math import ceil


# ── Red y deteccion de IP corporativa ────────────────────────────────────────

def is_corporate_ip(client_ip: str, corporate_ranges: List[str]) -> bool:
    try:
        ip = ipaddress.ip_address(client_ip)
        for cidr in corporate_ranges:
            if ip in ipaddress.ip_network(cidr, strict=False):
                return True
        return False
    except ValueError:
        return False


def get_client_ip(headers: Dict[str, str], remote_addr: str) -> str:
    # Respeta cabeceras de proxy en orden de prioridad
    for header in ["x-forwarded-for", "x-real-ip", "cf-connecting-ip"]:
        ip = headers.get(header)
        if ip:
            # x-forwarded-for puede traer multiples IPs separadas por coma
            return ip.split(",")[0].strip()
    return remote_addr


# ── Paginacion ────────────────────────────────────────────────────────────────

def paginate(total: int, page: int, per_page: int) -> Dict[str, Any]:
    total_pages = ceil(total / per_page) if per_page > 0 else 0
    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages,
        "has_next": page < total_pages,
        "has_prev": page > 1,
    }


def get_offset(page: int, per_page: int) -> int:
    return (page - 1) * per_page


# ── UUIDs ─────────────────────────────────────────────────────────────────────

def generate_uuid() -> str:
    return str(uuid.uuid4())


def is_valid_uuid(value: str) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except ValueError:
        return False


# ── Fechas ────────────────────────────────────────────────────────────────────

def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def format_datetime(dt: datetime, fmt: str = "%Y-%m-%d %H:%M:%S") -> str:
    return dt.strftime(fmt)


def is_expired(expiration: datetime) -> bool:
    return now_utc() > expiration.replace(tzinfo=timezone.utc)


# ── Strings ───────────────────────────────────────────────────────────────────

def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"[^\w-]", "", text)
    text = re.sub(r"-+", "-", text)
    return text


def truncate(text: str, max_length: int = 100, suffix: str = "...") -> str:
    if len(text) <= max_length:
        return text
    return text[:max_length - len(suffix)] + suffix


def sanitize_string(text: str) -> str:
    return re.sub(r"[<>\"'%;()&+]", "", text).strip()


# ── Diccionarios ──────────────────────────────────────────────────────────────

def remove_none_values(d: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in d.items() if v is not None}


def flatten_dict(d: Dict[str, Any], parent_key: str = "", sep: str = ".") -> Dict[str, Any]:
    items = {}
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.update(flatten_dict(v, new_key, sep=sep))
        else:
            items[new_key] = v
    return items


# ── Validaciones ──────────────────────────────────────────────────────────────

def is_valid_email(email: str) -> bool:
    pattern = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
    return bool(re.match(pattern, email))


def is_strong_password(password: str) -> bool:
    # Minimo 8 caracteres, una mayuscula, una minuscula, un numero y un caracter especial
    if len(password) < 8:
        return False
    if not re.search(r"[A-Z]", password):
        return False
    if not re.search(r"[a-z]", password):
        return False
    if not re.search(r"\d", password):
        return False
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return False
    return True