#!/usr/bin/env python3
"""
Limpieza de datos de prueba del Modulo Legal - Intranet Avalanz

Deja el submodulo de Solicitud de Contratos "en cero" para arrancar produccion:
  - Borra todos los sobres y su rastro de trazabilidad en avalanz_legal.
  - Resetea el contador de folios para que el proximo sea ENV-<anio>-0001.
  - Borra los archivos asociados (contratos y anexos) en MinIO.

NO toca los catalogos: tipos de contrato, campos, definiciones de anexos,
asignaciones de abogados ni la configuracion del proveedor de firma.

IMPORTANTE sobre DocuSign: los sobres en DocuSign no se pueden borrar (son
registros inmutables). Al pasar a produccion se usa una cuenta distinta a la de
sandbox, asi que produccion arranca vacia por si sola. Este script solo limpia
tu base de datos y MinIO.

Ejecutar en el SERVIDOR, donde viven los contenedores.

  # Simulacion (NO borra nada, solo muestra que haria) — es el modo por defecto
  python3 limpieza-datos-prueba.py

  # Borrado real (pide confirmacion escribiendo una frase)
  python3 limpieza-datos-prueba.py --execute
"""

import argparse
import subprocess
import sys
from datetime import datetime

PG_CONTAINER = "avalanz-postgres"
UPLOAD_CONTAINER = "avalanz-upload"
PG_USER = "avalanz_user"
LEGAL_DB = "avalanz_legal"
CONFIRM_PHRASE = "BORRAR DATOS DE PRUEBA"

# Tablas de sobres y trazabilidad que se vacian (en este orden por las FK).
ENVELOPE_TABLES = [
    "envelope_attachment_logs",
    "envelope_activity_logs",
    "envelope_status_logs",
    "envelope_time_tracking",
    "envelope_comments",
    "envelope_form_snapshots",
    "envelope_signing_tokens",
    "envelope_signers",
    "envelope_attachments",
    "envelopes",
]

CMD_TIMEOUT = 120


def run(cmd, stdin_text=None):
    try:
        p = subprocess.run(cmd, capture_output=True, text=True,
                           timeout=CMD_TIMEOUT, input=stdin_text)
        return p.returncode, p.stdout, p.stderr
    except FileNotFoundError:
        return 127, "", f"comando no encontrado: {cmd[0]}"
    except subprocess.TimeoutExpired:
        return 124, "", "timeout"
    except Exception as e:  # noqa: BLE001
        return 1, "", str(e)


def psql(query, db=LEGAL_DB):
    cmd = ["docker", "exec", PG_CONTAINER, "psql", "-U", PG_USER, "-d", db,
           "-t", "-A", "-F", "|", "-c", query]
    rc, out, err = run(cmd)
    if rc != 0:
        return None, err.strip()
    rows = [ln.strip() for ln in out.splitlines() if ln.strip()]
    return rows, None


def docker_ok():
    rc, _, _ = run(["docker", "version", "--format", "{{.Server.Version}}"])
    return rc == 0


def count(table):
    rows, err = psql(f"SELECT count(*) FROM {table};")
    if rows is None:
        return None
    try:
        return int(rows[0])
    except (ValueError, IndexError):
        return None


def get_attachment_keys():
    """Devuelve lista de tuplas (bucket, object_key) de todos los adjuntos."""
    rows, err = psql(
        "SELECT bucket || '|' || object_key FROM envelope_attachments "
        "WHERE object_key IS NOT NULL AND object_key <> '';"
    )
    if rows is None:
        return None, err
    keys = []
    for r in rows:
        if "|" in r:
            b, k = r.split("|", 1)
            keys.append((b.strip(), k.strip()))
    return keys, None


def delete_minio_objects(keys):
    """Borra los objetos en MinIO reutilizando el storage_service del upload-service."""
    if not keys:
        print("  No hay objetos en MinIO que borrar.")
        return True
    keys_literal = repr(keys)
    code = (
        "import asyncio\n"
        "from app.services.storage_service import delete_file\n"
        f"KEYS = {keys_literal}\n"
        "async def main():\n"
        "    ok = 0; err = 0\n"
        "    for b, k in KEYS:\n"
        "        try:\n"
        "            await delete_file(k, b); ok += 1\n"
        "        except Exception as e:\n"
        "            err += 1; print('  ERROR al borrar', k, '->', e)\n"
        "    print(f'  Objetos borrados: {ok} | errores: {err}')\n"
        "asyncio.run(main())\n"
    )
    rc, out, err = run(["docker", "exec", "-i", UPLOAD_CONTAINER, "python3", "-"],
                       stdin_text=code)
    if out:
        print(out.rstrip())
    if rc != 0:
        print("  Fallo el borrado en MinIO:", err.strip())
        return False
    return True


def truncate_tables():
    tables = ", ".join(ENVELOPE_TABLES)
    q = f"TRUNCATE {tables} RESTART IDENTITY CASCADE; DELETE FROM folio_sequences;"
    rc, out, err = run(["docker", "exec", PG_CONTAINER, "psql", "-U", PG_USER,
                        "-d", LEGAL_DB, "-c", q])
    if rc != 0:
        print("  Fallo el TRUNCATE:", err.strip())
        return False
    print("  Tablas de sobres vaciadas y folio reseteado.")
    return True


def report():
    print("\n  Estado actual de avalanz_legal:")
    n_env = count("envelopes")
    n_att = count("envelope_attachments")
    print(f"    Sobres:  {n_env if n_env is not None else '?'}")
    print(f"    Anexos:  {n_att if n_att is not None else '?'}")
    keys, err = get_attachment_keys()
    n_keys = len(keys) if keys is not None else "?"
    print(f"    Archivos en MinIO referenciados: {n_keys}")
    print("\n  NO se tocan: tipos de contrato, campos, anexos-definiciones, "
          "abogados asignados, config de firma.")
    return n_env, keys


def main():
    parser = argparse.ArgumentParser(
        description="Limpieza de datos de prueba del Modulo Legal")
    parser.add_argument("--execute", action="store_true",
                        help="Ejecuta el borrado real (por defecto es simulacion)")
    args = parser.parse_args()

    print("=" * 64)
    print("  LIMPIEZA DE DATOS DE PRUEBA - MODULO LEGAL")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Modo: {'BORRADO REAL' if args.execute else 'SIMULACION (no borra nada)'}")
    print("=" * 64)

    if not docker_ok():
        print("\n  Docker no disponible. Ejecuta este script en el servidor.")
        sys.exit(2)

    n_env, keys = report()

    if not args.execute:
        print("\n  Esto es una SIMULACION. Para borrar de verdad vuelve a correr con:")
        print("    python3 limpieza-datos-prueba.py --execute")
        sys.exit(0)

    if not n_env:
        print("\n  No hay sobres que borrar. Nada que hacer.")
        sys.exit(0)

    print("\n" + "!" * 64)
    print("  ADVERTENCIA: vas a BORRAR de forma PERMANENTE todos los sobres,")
    print("  su trazabilidad y sus archivos en MinIO. Esto NO se puede deshacer.")
    print("!" * 64)
    answer = input(f'\n  Para confirmar, escribe exactamente: {CONFIRM_PHRASE}\n  > ')
    if answer.strip() != CONFIRM_PHRASE:
        print("\n  Confirmacion incorrecta. Se cancela sin borrar nada.")
        sys.exit(1)

    print("\n  [1/2] Borrando archivos en MinIO...")
    if keys is None:
        print("  No se pudo obtener la lista de archivos. Se aborta antes de tocar la BD.")
        sys.exit(2)
    if not delete_minio_objects(keys):
        print("  Hubo un problema con MinIO. Se aborta antes de tocar la BD.")
        sys.exit(2)

    print("\n  [2/2] Vaciando tablas y reseteando folio...")
    if not truncate_tables():
        sys.exit(2)

    print("\n  Verificacion final:")
    report()
    print("\n  Listo. El proximo sobre creado sera ENV-<anio>-0001.")


if __name__ == "__main__":
    main()
