"""
DocuSign Service — JWT Grant authentication + eSignature API
Proveedor: email_sim (activo) | docusign (este servicio)
"""
import time
import base64
import json
import httpx
from pathlib import Path
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.backends import default_backend


# ── Configuración ─────────────────────────────────────────────────────────────

def _get_config():
    """Lee configuración de DocuSign desde variables de entorno."""
    import os
    return {
        "integration_key": os.getenv("DOCUSIGN_INTEGRATION_KEY", ""),
        "user_id": os.getenv("DOCUSIGN_USER_ID", ""),
        "account_id": os.getenv("DOCUSIGN_ACCOUNT_ID", ""),
        "base_uri": os.getenv("DOCUSIGN_BASE_URI", "https://demo.docusign.net"),
        "auth_server": os.getenv("DOCUSIGN_AUTH_SERVER", "account-d.docusign.com"),
        "private_key_path": os.getenv("DOCUSIGN_PRIVATE_KEY_PATH", "/app/docusign_private.pem"),
    }


# ── Cache del access token ─────────────────────────────────────────────────────

_token_cache = {"access_token": None, "expires_at": 0}


def _load_private_key(path: str) -> bytes:
    """Carga la clave privada RSA desde archivo."""
    return Path(path).read_bytes()


def _generate_jwt(config: dict) -> str:
    """
    Genera un JSON Web Token firmado con RSA-SHA256.
    Válido por 1 hora (3600 segundos).
    """
    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT"}
    payload = {
        "iss": config["integration_key"],
        "sub": config["user_id"],
        "aud": config["auth_server"],
        "iat": now,
        "exp": now + 3600,
        "scope": "signature impersonation",
    }

    def b64url(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

    header_b64 = b64url(json.dumps(header, separators=(",", ":")).encode())
    payload_b64 = b64url(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{header_b64}.{payload_b64}".encode()

    private_key_bytes = _load_private_key(config["private_key_path"])
    private_key = serialization.load_pem_private_key(
        private_key_bytes, password=None, backend=default_backend()
    )
    signature = private_key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
    signature_b64 = b64url(signature)

    return f"{header_b64}.{payload_b64}.{signature_b64}"


async def get_access_token() -> str:
    """
    Obtiene un Bearer token de DocuSign via JWT Grant.
    Cachea el token y lo renueva cuando expira.
    """
    global _token_cache
    now = int(time.time())

    # Usar token cacheado si aún es válido (con 60s de margen)
    if _token_cache["access_token"] and _token_cache["expires_at"] > now + 60:
        return _token_cache["access_token"]

    config = _get_config()
    jwt_token = _generate_jwt(config)

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            f"https://{config['auth_server']}/oauth/token",
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": jwt_token,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        response.raise_for_status()
        data = response.json()

    _token_cache["access_token"] = data["access_token"]
    _token_cache["expires_at"] = now + data.get("expires_in", 3600)
    return _token_cache["access_token"]


# ── Crear y enviar sobre ──────────────────────────────────────────────────────

async def create_envelope(
    pdf_bytes: bytes,
    folio: str,
    contract_type_name: str,
    signers: list[dict],
) -> str:
    """
    Crea y envía un sobre en DocuSign.

    signers: lista de dicts con:
        - name: str
        - email: str
        - routing_order: int
        - sign_here_anchor: str  (ej. "*FIRMA1*")
        - full_name_anchor: str  (ej. "*NOMBRE1*")
        - date_signed_anchor: str (ej. "*FECHA_FIRMA1*")
        - role_in_document: str (opcional)

    Retorna: docusign_envelope_id (str)
    """
    config = _get_config()
    access_token = await get_access_token()

    # Documento en base64
    doc_b64 = base64.b64encode(pdf_bytes).decode()

    # Construir firmantes con tabs
    ds_signers = []
    for idx, signer in enumerate(signers, start=1):
        recipient_id = str(idx)
        tabs = {}

        if signer.get("sign_here_anchor"):
            tabs["signHereTabs"] = [{
                "tabLabel": f"FIRMA{idx}",
                "documentId": "1",
                "anchorString": signer["sign_here_anchor"],
                "anchorUnits": "pixels",
                "anchorXOffset": "0",
                "anchorYOffset": "0",
            }]

        if signer.get("full_name_anchor"):
            tabs["fullNameTabs"] = [{
                "tabLabel": f"NOMBRE{idx}",
                "documentId": "1",
                "anchorString": signer["full_name_anchor"],
                "anchorUnits": "pixels",
                "anchorXOffset": "0",
                "anchorYOffset": "0",
            }]

        if signer.get("date_signed_anchor"):
            tabs["dateSignedTabs"] = [{
                "tabLabel": f"FECHA{idx}",
                "documentId": "1",
                "anchorString": signer["date_signed_anchor"],
                "anchorUnits": "pixels",
                "anchorXOffset": "0",
                "anchorYOffset": "0",
            }]

        ds_signers.append({
            "recipientId": recipient_id,
            "routingOrder": str(signer.get("routing_order", idx)),
            "name": signer["name"],
            "email": signer["email"],
            "tabs": tabs,
        })

    envelope_payload = {
        "emailSubject": f"Solicitud de firma — {folio} — {contract_type_name}",
        "emailBlurb": f"Se te ha enviado el contrato {folio} para tu firma electrónica.",
        "status": "sent",
        "documents": [{
            "documentId": "1",
            "name": f"{folio}_contrato.pdf",
            "fileExtension": "pdf",
            "documentBase64": doc_b64,
        }],
        "customFields": {
            "textCustomFields": [{
                "name": "folio_avalanz",
                "value": folio,
                "required": "true",
            }]
        },
        "recipients": {
            "signers": ds_signers,
        },
    }

    url = f"{config['base_uri']}/restapi/v2.1/accounts/{config['account_id']}/envelopes"
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            url,
            json=envelope_payload,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
        )
        response.raise_for_status()
        data = response.json()

    return data["envelopeId"]


# ── Obtener estado del sobre ──────────────────────────────────────────────────

async def get_envelope_status(docusign_envelope_id: str) -> dict:
    """Retorna el estado actual del sobre en DocuSign."""
    config = _get_config()
    access_token = await get_access_token()

    url = f"{config['base_uri']}/restapi/v2.1/accounts/{config['account_id']}/envelopes/{docusign_envelope_id}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            url,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        response.raise_for_status()
        return response.json()


# ── Descargar documento firmado ───────────────────────────────────────────────

async def download_signed_document(docusign_envelope_id: str) -> bytes:
    """
    Descarga el PDF firmado del sobre.
    Retorna los bytes del PDF firmado.
    """
    config = _get_config()
    access_token = await get_access_token()

    # Primero obtenemos los documentos del sobre
    docs_url = f"{config['base_uri']}/restapi/v2.1/accounts/{config['account_id']}/envelopes/{docusign_envelope_id}/documents"
    async with httpx.AsyncClient(timeout=15.0) as client:
        docs_response = await client.get(
            docs_url,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        docs_response.raise_for_status()
        docs_data = docs_response.json()

    # Encontrar el documento principal (type: content)
    doc_id = None
    for doc in docs_data.get("envelopeDocuments", []):
        if doc.get("type") == "content":
            doc_id = doc["documentIdGuid"]
            break

    if not doc_id:
        raise ValueError(f"No se encontró documento firmado en sobre {docusign_envelope_id}")

    # Descargar el documento
    download_url = f"{config['base_uri']}/restapi/v2.1/accounts/{config['account_id']}/envelopes/{docusign_envelope_id}/documents/{doc_id}"
    async with httpx.AsyncClient(timeout=60.0) as client:
        download_response = await client.get(
            download_url,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        download_response.raise_for_status()
        return download_response.content


# ── Verificar webhook de DocuSign Connect ─────────────────────────────────────

def verify_webhook_payload(payload: dict) -> bool:
    """
    Verifica que el webhook viene de DocuSign.
    En producción usar HMAC signature verification.
    Por ahora valida que tenga los campos esperados.
    """
    return bool(
        payload.get("envelopeId") and
        payload.get("status")
    )
