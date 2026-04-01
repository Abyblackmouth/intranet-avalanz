import bcrypt as _bcrypt
import hashlib
import hmac
import secrets
import base64
from typing import Optional
from cryptography.fernet import Fernet


# ── Hashing de contrasenas ────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return _bcrypt.checkpw(plain_password.encode(), hashed_password.encode())


# ── Tokens seguros aleatorios ─────────────────────────────────────────────────

def generate_secure_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)


def generate_numeric_code(digits: int = 6) -> str:
    return str(secrets.randbelow(10 ** digits)).zfill(digits)


# ── HMAC para verificacion de integridad ──────────────────────────────────────

def generate_hmac(data: str, secret_key: str) -> str:
    return hmac.new(
        secret_key.encode(),
        data.encode(),
        hashlib.sha256,
    ).hexdigest()


def verify_hmac(data: str, secret_key: str, signature: str) -> bool:
    expected = generate_hmac(data, secret_key)
    return hmac.compare_digest(expected, signature)


# ── Cifrado simetrico con Fernet ──────────────────────────────────────────────

def generate_fernet_key() -> str:
    return Fernet.generate_key().decode()


def encrypt_data(data: str, fernet_key: str) -> str:
    f = Fernet(fernet_key.encode())
    return f.encrypt(data.encode()).decode()


def decrypt_data(encrypted_data: str, fernet_key: str) -> Optional[str]:
    try:
        f = Fernet(fernet_key.encode())
        return f.decrypt(encrypted_data.encode()).decode()
    except Exception:
        return None


# ── Hashing general (no contrasenas) ─────────────────────────────────────────

def hash_sha256(data: str) -> str:
    return hashlib.sha256(data.encode()).hexdigest()


def hash_md5(data: str) -> str:
    return hashlib.md5(data.encode()).hexdigest()


# ── Encoding base64 ───────────────────────────────────────────────────────────

def encode_base64(data: str) -> str:
    return base64.urlsafe_b64encode(data.encode()).decode()


def decode_base64(data: str) -> Optional[str]:
    try:
        return base64.urlsafe_b64decode(data.encode()).decode()
    except Exception:
        return None