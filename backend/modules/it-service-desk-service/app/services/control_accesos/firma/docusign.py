"""Firma con DocuSign para el Control de accesos.

Misma cuenta y misma llave que Legal (contract_requests/docusign_service.py), con lo
que pide el formato de accesos: firmantes en orden, campos de texto obligatorios
(usuario asignado de TI), aviso de eventos dirigido al IT Service Desk en el propio
sobre y marca de origen para que el webhook de Legal lo ignore."""
import base64
import json
import os
import time
from pathlib import Path

import httpx
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

ORIGEN = "it-service-desk"
_token = {"valor": None, "vence": 0}


def _config() -> dict:
    return {
        "integration_key": os.getenv("DOCUSIGN_INTEGRATION_KEY", ""),
        "user_id": os.getenv("DOCUSIGN_USER_ID", ""),
        "account_id": os.getenv("DOCUSIGN_ACCOUNT_ID", ""),
        "base_uri": os.getenv("DOCUSIGN_BASE_URI", "https://demo.docusign.net"),
        "auth_server": os.getenv("DOCUSIGN_AUTH_SERVER", "account-d.docusign.com"),
        "private_key_path": os.getenv("DOCUSIGN_PRIVATE_KEY_PATH", "/app/docusign_private.pem"),
    }


def configurado() -> bool:
    c = _config()
    return bool(c["integration_key"] and c["user_id"] and c["account_id"] and Path(c["private_key_path"]).exists())


def _jwt(c: dict) -> str:
    ahora = int(time.time())
    b64 = lambda d: base64.urlsafe_b64encode(d).rstrip(b"=").decode()
    cab = b64(json.dumps({"alg": "RS256", "typ": "JWT"}, separators=(",", ":")).encode())
    cuerpo = b64(json.dumps({"iss": c["integration_key"], "sub": c["user_id"], "aud": c["auth_server"],
                             "iat": ahora, "exp": ahora + 3600, "scope": "signature impersonation"},
                            separators=(",", ":")).encode())
    llave = serialization.load_pem_private_key(Path(c["private_key_path"]).read_bytes(), password=None, backend=default_backend())
    firma = llave.sign(f"{cab}.{cuerpo}".encode(), padding.PKCS1v15(), hashes.SHA256())
    return f"{cab}.{cuerpo}.{b64(firma)}"


async def token() -> str:
    ahora = int(time.time())
    if _token["valor"] and _token["vence"] > ahora + 60:
        return _token["valor"]
    c = _config()
    async with httpx.AsyncClient(timeout=15.0) as cli:
        r = await cli.post(f"https://{c['auth_server']}/oauth/token",
                           data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": _jwt(c)},
                           headers={"Content-Type": "application/x-www-form-urlencoded"})
        r.raise_for_status()
        d = r.json()
    _token.update(valor=d["access_token"], vence=ahora + d.get("expires_in", 3600))
    return _token["valor"]


def _url(ruta: str) -> str:
    c = _config()
    return f"{c['base_uri']}/restapi/v2.1/accounts/{c['account_id']}{ruta}"


def _ancla(etiqueta: str, ancla: str, extra: dict | None = None) -> dict:
    t = {"tabLabel": etiqueta, "documentId": "1", "anchorString": ancla, "anchorUnits": "pixels",
         "anchorXOffset": "0", "anchorYOffset": "0", "anchorIgnoreIfNotPresent": "false"}
    t.update(extra or {})
    return t


async def crear_sobre(pdf: bytes, folio: str, asunto: str, mensaje: str, firmantes: list[dict], webhook_url: str) -> str:
    """firmantes: [{name, email, routing_order, firma_ancla, textos: [{etiqueta, ancla, obligatorio, ancho}]}].
    Regresa el id del sobre."""
    ds = []
    for n, f in enumerate(firmantes, start=1):
        tabs = {"signHereTabs": [_ancla(f"FIRMA{n}", f["firma_ancla"])]}
        if f.get("textos"):
            tabs["textTabs"] = [_ancla(t["etiqueta"], t["ancla"], {"required": "true" if t.get("obligatorio") else "false",
                                                                   "width": str(t.get("ancho", 160)), "font": "helvetica",
                                                                   "fontSize": "size9"}) for t in f["textos"]]
        if f.get("fecha_ancla"):
            tabs["dateSignedTabs"] = [_ancla(f"FECHA{n}", f["fecha_ancla"], {"font": "helvetica", "fontSize": "size9"})]
        ds.append({"recipientId": str(n), "routingOrder": str(f.get("routing_order", n)),
                   "name": f["name"], "email": f["email"], "tabs": tabs})
    cuerpo = {
        "emailSubject": asunto[:100], "emailBlurb": mensaje, "status": "sent",
        "documents": [{"documentId": "1", "name": f"{folio}.pdf", "fileExtension": "pdf",
                       "documentBase64": base64.b64encode(pdf).decode()}],
        "customFields": {"textCustomFields": [{"name": "folio_avalanz", "value": folio, "required": "true"},
                                              {"name": "origen", "value": ORIGEN, "required": "true"}]},
        "recipients": {"signers": ds},
        # Los eventos de este sobre van al IT Service Desk (los de la cuenta siguen yendo a Legal, que los ignora)
        "eventNotification": {"url": webhook_url, "loggingEnabled": "true", "requireAcknowledgment": "true",
                              "includeDocuments": "false", "eventData": {"version": "restv2.1", "format": "json"},
                              "envelopeEvents": [{"envelopeEventStatusCode": s} for s in ("sent", "completed", "declined", "voided")],
                              "recipientEvents": [{"recipientEventStatusCode": s} for s in ("Completed", "Declined")]},
    }
    async with httpx.AsyncClient(timeout=30.0) as cli:
        r = await cli.post(_url("/envelopes"), json=cuerpo, headers={"Authorization": f"Bearer {await token()}"})
        r.raise_for_status()
        return r.json()["envelopeId"]


async def estado(envelope_id: str) -> dict:
    async with httpx.AsyncClient(timeout=15.0) as cli:
        r = await cli.get(_url(f"/envelopes/{envelope_id}"), headers={"Authorization": f"Bearer {await token()}"})
        r.raise_for_status()
        return r.json()


async def valores_de_texto(envelope_id: str) -> dict:
    """{etiqueta: valor} de los campos de texto llenados por los firmantes (ej. el usuario asignado de TI)."""
    async with httpx.AsyncClient(timeout=15.0) as cli:
        r = await cli.get(_url(f"/envelopes/{envelope_id}/recipients"), params={"include_tabs": "true"},
                          headers={"Authorization": f"Bearer {await token()}"})
        r.raise_for_status()
        d = r.json()
    valores = {}
    for s in d.get("signers", []):
        for t in (s.get("tabs") or {}).get("textTabs", []):
            valores[t.get("tabLabel")] = t.get("value", "")
    return valores


async def descargar_firmado(envelope_id: str) -> bytes:
    """El documento con todas las firmas (combinado)."""
    async with httpx.AsyncClient(timeout=60.0) as cli:
        r = await cli.get(_url(f"/envelopes/{envelope_id}/documents/combined"), headers={"Authorization": f"Bearer {await token()}"})
        r.raise_for_status()
        return r.content
