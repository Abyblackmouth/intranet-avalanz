#!/usr/bin/env python3
"""
Limpieza de datos de prueba del IT Service Desk - Intranet Avalanz

Deja en cero los tickets para arrancar producción:
  - Incidentes, Controles de Cambio y Solicitudes de acceso, con todo lo ligado
    (bitácoras, evidencias, enlaces de atención, etapas del CDC, firmas).
  - Las cuentas de prueba del Control de accesos y los contadores de folio.
  - Los archivos de esos tickets en MinIO (NO la firma de TI).
  - Los formatos firmados de prueba en el expediente del empleado (admin-service).
  - Las notificaciones de la campana del módulo.

NO toca: sistemas, módulos, severidades, especialistas, ajustes, formatos de
acceso (con empresas, módulos, perfiles, rutinas y firma de TI), usuarios ni empresas.

  python3 scripts/limpieza-it-service-desk.py            # simulación (no borra nada)
  python3 scripts/limpieza-it-service-desk.py --execute  # borrado real, pide confirmación
"""
import argparse
import subprocess
import sys

PG, USR, DB, ADMIN_DB = "avalanz-postgres", "avalanz_user", "avalanz_it_service_desk", "avalanz_admin"
ITSD = "avalanz-it-service-desk"
FRASE = "BORRAR TICKETS DE PRUEBA"
# Orden por llaves foráneas: primero lo que depende de los tickets
TABLAS = ["acc_solicitudes", "acc_cuentas", "control_cambios_avances", "control_cambios_documentos",
          "control_cambios_etapas", "control_cambios_detalle", "incident_attachments", "incident_activity_log",
          "incident_resolution_tokens", "incidents", "folio_counters"]
FIRMAS_TI = "control-de-accesos/firmas/"


def sql(db, consulta, entrada=None):
    p = subprocess.run(["docker", "exec", "-i", PG, "psql", "-U", USR, "-d", db, "-At", "-v", "ON_ERROR_STOP=1", "-c", consulta],
                       capture_output=True, text=True, input=entrada)
    if p.returncode:
        raise RuntimeError(p.stderr.strip())
    return p.stdout.strip()


def llaves_minio():
    existentes = sql(DB, "SELECT tablename FROM pg_tables WHERE schemaname='public'").split("\n")
    tablas = [t for t in TABLAS if t in existentes]
    cols = sql(DB, "SELECT table_name || '.' || column_name FROM information_schema.columns WHERE table_schema='public' "
                   f"AND table_name IN ({','.join(repr(t) for t in tablas)}) AND column_name LIKE '%object_key%'").split("\n")
    keys = set()
    for tc in filter(None, cols):
        t, c = tc.split(".")
        keys |= set(filter(None, sql(DB, f'SELECT "{c}" FROM "{t}" WHERE "{c}" IS NOT NULL').split("\n")))
    keys |= set(filter(None, sql(DB, "SELECT datos->'escaneo'->>'key' FROM acc_solicitudes WHERE datos->'escaneo' IS NOT NULL").split("\n")))
    return sorted(k for k in keys if not k.startswith(FIRMAS_TI)), cols


def bd_notificaciones():
    for db in sql("postgres", "SELECT datname FROM pg_database WHERE datname LIKE 'avalanz_%'").split("\n"):
        try:
            if sql(db, "SELECT count(*) FROM information_schema.columns WHERE table_name='notifications' AND column_name='module_slug'") == "1":
                return db
        except RuntimeError:
            pass
    return None


EXPEDIENTE = "FROM user_files WHERE original_name ~ '^(ALTA|MOD)_' AND description LIKE '% de usuario · %' AND NOT is_deleted"


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--execute", action="store_true"); a = ap.parse_args()
    existentes = sql(DB, "SELECT tablename FROM pg_tables WHERE schemaname='public'").split("\n")
    tablas = [t for t in TABLAS if t in existentes]
    print("══ IT Service Desk: renglones que se borran")
    for t in tablas:
        print(f"  {t:32} {sql(DB, f'SELECT count(*) FROM {t}')}")
    print("\n══ Contadores de folio actuales (se reinician)")
    print("  " + (sql(DB, "SELECT row_to_json(f)::text FROM folio_counters f").replace("\n", "\n  ") or "(vacío)"))
    keys, cols = llaves_minio()
    print(f"\n══ Archivos en MinIO que se borran: {len(keys)}  (columnas revisadas: {', '.join(filter(None, cols))})")
    for k in keys[:8]:
        print("  ", k)
    if len(keys) > 8:
        print(f"   … y {len(keys) - 8} más")
    print(f"  (la firma de TI, en '{FIRMAS_TI}', se conserva)")
    n_exp = sql(ADMIN_DB, f"SELECT count(*) {EXPEDIENTE}")
    print(f"\n══ Expediente: formatos firmados de prueba que se quitan: {n_exp}")
    ndb = bd_notificaciones()
    n_not = sql(ndb, "SELECT count(*) FROM notifications WHERE module_slug='it-service-desk'") if ndb else "0"
    print(f"══ Notificaciones del módulo ({ndb or 'no se encontró la base'}): {n_not}")

    if not a.execute:
        print("\nSIMULACIÓN: no se borró nada. Para borrar: --execute")
        return
    if input(f'\nEscribe exactamente "{FRASE}" para borrar: ').strip() != FRASE:
        sys.exit("Cancelado: no se borró nada.")
    # 1. Base del IT Service Desk, todo o nada
    sql(DB, "BEGIN; " + " ".join(f"DELETE FROM {t};" for t in tablas) + " COMMIT;")
    print("✔ Tablas del IT Service Desk vaciadas")
    # 2. MinIO (desde el contenedor, que tiene boto3 y las credenciales)
    if keys:
        codigo = ("import sys\nfrom app.services.control_accesos.firma.almacen import _cliente, BUCKET\n"
                  "ks=[l.strip() for l in sys.stdin if l.strip()]\ns3=_cliente()\n"
                  "for i in range(0,len(ks),500):\n    s3.delete_objects(Bucket=BUCKET,Delete={'Objects':[{'Key':k} for k in ks[i:i+500]]})\n"
                  "print(len(ks))")
        p = subprocess.run(["docker", "exec", "-i", ITSD, "python", "-c", codigo], capture_output=True, text=True, input="\n".join(keys))
        print(f"✔ Archivos borrados de MinIO: {p.stdout.strip()}" if p.returncode == 0 else f"⚠ MinIO: {p.stderr.strip()[-300:]}")
    # 3. Expediente del empleado
    sql(ADMIN_DB, f"BEGIN; DELETE FROM user_file_audit_log WHERE file_id IN (SELECT id {EXPEDIENTE}); DELETE {EXPEDIENTE}; COMMIT;")
    print("✔ Expediente limpio")
    # 4. Notificaciones del módulo
    if ndb:
        sql(ndb, "DELETE FROM notifications WHERE module_slug='it-service-desk'")
        print("✔ Notificaciones del módulo borradas")
    print("\nListo. El siguiente ticket será el 000001 de su tipo y familia.")


if __name__ == "__main__":
    main()
