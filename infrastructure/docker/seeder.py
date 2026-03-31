import asyncio
import asyncpg
import os
from datetime import datetime, timezone

# ── Configuracion ─────────────────────────────────────────────────────────────

DB_HOST     = os.getenv("DB_HOST", "localhost")
DB_PORT     = int(os.getenv("DB_PORT", "5432"))
DB_USER     = os.getenv("DB_USER", "avalanz_user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "changeme")

SUPER_ADMIN_EMAIL    = os.getenv("SUPER_ADMIN_EMAIL", "admin@avalanz.com")
SUPER_ADMIN_NAME     = os.getenv("SUPER_ADMIN_NAME", "Super Administrador")
SUPER_ADMIN_PASSWORD = os.getenv("SUPER_ADMIN_PASSWORD", "Admin@2026!")


# ── Datos maestros ────────────────────────────────────────────────────────────

GROUPS = [
    ("Grupo Avalanz", "grupo-avalanz"),
    ("Zignia",        "zignia"),
]

# (nombre_comercial, nombre_completo, slug, rfc, grupo_slug, is_active)
COMPANIES = [
    # ── ZIGNIA ────────────────────────────────────────────────────────────────
    ("INTERESPECTACULOS",  "INTERESPECTACULOS SA DE CV",                                        "interespectaculos",  "INT030515PV3", "zignia", False),
    ("SUPER ESPECTACULOS", "SUPER ESPECTACULOS SA DE CV",                                       "super-espectaculos", "SES031029HV9", "zignia", False),
    ("MAX CONSTRUCCION",   "MAX CONSTRUCCION DE ARENAS Y PARQUES SA DE CV",                     "max-construccion",   "MCA020717KD1", "zignia", False),
    ("GPO SUPERESPECTACULOS","GRUPO SUPER ESPECTACULOS SA DE CV",                               "gpo-superespectaculos","GSE0112123J2","zignia", False),
    ("SUPERPUBLICIDAD",    "SUPER PUBLICIDAD SA DE CV",                                         "superpublicidad",    "SPU0310296B9", "zignia", False),
    ("SUPERBOLETOS",       "SUPERBOLETOS MONTERREY SA DE CV",                                   "superboletos",       "SMO040421CI0", "zignia", False),
    ("SUPERCOMERCIOS",     "SUPER COMERCIOS Y DEPORTES SA DE CV",                               "supercomercios",     "SCD031029LXA", "zignia", False),
    ("CONTROLEQUIPOSD",    "CONTROLADORA DE EQUIPOS DEPORTIVOS SA DE CV",                       "controlequiposd",    "CED0612068MA", "zignia", False),
    ("PROMOTORAEVENTO",    "COMPANIA PROMOTORA DE EVENTOS INTERNACIONALES SAPI DE CV",          "promotoraevento",    "PEI0803284X0", "zignia", False),
    ("CONTROLADORA",       "CONTROLADORA AMTY SA DE CV",                                        "controladora-amty",  "CAM1006017L0", "zignia", False),
    ("DOME",               "PROMOTORA DOME SA DE CV",                                           "dome",               "PDO080520252", "zignia", False),
    ("EXPOTAMP",           "OPERADORA DE EVENTOS EXPOTAMPICO SA DE CV",                         "expotamp",           "OEE091217V62", "zignia", False),
    ("TICKETING",          "TICKETING AS A SERVICE MEXICO",                                     "ticketing",          "OED100716778", "zignia", False),
    ("NON PLUS",           "CERVECERIA NON PLUS",                                               "non-plus",           "MAX100923RF3", "zignia", False),
    ("SUITESACMX",         "SUITES ARENA CIUDAD DE MEXICO SA DE CV",                            "suitesacmx",         "SAC1004227K6", "zignia", False),

    # ── AVALANZ ───────────────────────────────────────────────────────────────
    ("AGIMTY",             "ASESORES GLOBALES INTEGRALES DE MONTERREY SA DE CV",                "agimty",             "AGI0906221A5", "grupo-avalanz", True),
    ("SPPEL SERVICIOS",    "SPPEL SERVICIOS SA DE CV",                                          "sppel-servicios",    "SSE2111293R3", "grupo-avalanz", True),
    ("AGIM",               "ASESORES GLOBALES INTEGRALES DE MEXICO SA DE CV",                   "agim",               "AGI060913DT2", "grupo-avalanz", True),
    ("SPPEL",              "SEGURIDAD PRIVADA DE PROTECCION Y ESTUDIOS LOGISTICOS SPPEL",       "sppel",              "SPP111024DH9", "grupo-avalanz", True),
    ("AVALANZ",            "AVALANZ SA DE CV",                                                  "avalanz",            "AVA0802203FA", "grupo-avalanz", True),
    ("DESARROLLADORA",     "DESARROLLADORA DE CAMINOS Y ASFALTOS SUS",                          "desarrolladora",     "DDC0911307A3", "grupo-avalanz", True),
    ("DIAGNOSIS",          "DIAGNOSIS Y CONSULTORIA ENERGETICA SA DE CV",                       "diagnosis",          "DCE100226632", "grupo-avalanz", True),
    ("BURO REGIONAL",      "BURO REGIONAL DE BIENES Y ACTIVOS SA DE CV",                        "buro-regional",      "BRB100217C52", "grupo-avalanz", True),
    ("SOLTEC",             "SOLUCIONES GENERALES TECNOLOGICAS SA DE CV",                        "soltec",             "SGT0905209N6", "grupo-avalanz", False),
    ("GPO. ASESORES",      "GPO. ASESORES GLOBALES INTEGRALES DE MEX",                          "gpo-asesores",       "GAG100601BH8", "grupo-avalanz", False),
    ("CAM AVALANZ",        "CAM AVALANZ",                                                       "cam-avalanz",        "CAV1507159D8", "grupo-avalanz", False),
    ("CNCI",               "UNIVERSIDAD CNCI DE MEXICO SC",                                     "cnci",               "UCM960906C20", "grupo-avalanz", True),
    ("CNCI SAB",           "UNIVERSIDAD CNCI SAB DE CV",                                        "cnci-sab",           "UCN940412DTA", "grupo-avalanz", True),
    ("AGI",                "ASESORES GLOBALES INTEGRALES SA DE CV",                             "agi",                "AGI990226239", "grupo-avalanz", True),
    ("ASCI",               "ASESORIA CORPORATIVA EN INFORMATICA SA DE CV",                      "asci",               "ACI9509083B4", "grupo-avalanz", True),
    ("CNCI MTY",           "UNIVERSIDAD CNCI DE MONTERREY SC",                                  "cnci-mty",           "UCM091014D17", "grupo-avalanz", True),
    ("EDUFRANQ",           "EDUFRANQUICIAS SA DE CV",                                           "edufranq",           "EDU020813943", "grupo-avalanz", False),
    ("FUND CNCI",          "FUNDACION UNIVERSIDAD CNCI AC",                                     "fund-cnci",          "FUC070212EY5", "grupo-avalanz", False),
    ("CENTROS CNCI",       "CENTROS DE EDUCACION SUPERIOR CNCI SC",                             "centros-cnci",       "CES050216M47", "grupo-avalanz", True),
    ("FOMENTO RECR",       "FOMENTO A LA RECREACION AC",                                        "fomento-recr",       "FRE020906HS8", "grupo-avalanz", False),
    ("PUBLIMAX",           "PUBLIMAX SA DE CV",                                                 "publimax",           "PUB9404255F7", "grupo-avalanz", True),
    ("GPOAVALANZ",         "GRUPO AVALANZ SA DE CV",                                            "gpoavalanz",         "GAV960712IV9", "grupo-avalanz", True),
    ("PUBAEREOS",          "PUBLISERVICIOS AEREOS SA DE CV",                                    "pubaereos",          "PSA020628PG3", "grupo-avalanz", True),
    ("SHSERV",             "SH SERVICIOS SC",                                                   "shserv",             "SSE030317FW0", "grupo-avalanz", False),
    ("EXCELAND",           "EXELAND DE MEXICO SA DE CV",                                        "exceland",           "EME98022841A", "grupo-avalanz", False),
    ("MEGASHOWS",          "MEGA SHOWS SA DE CV",                                               "megashows",          "MSH070605LH0", "grupo-avalanz", False),
    ("SPTRAMITES",         "SUPER TRAMITES Y SERVICIOS INTEGRALES SC",                          "sptramites",         "STS0310295R9", "grupo-avalanz", False),
    ("SPSERVAEREOS",       "SP SERVICIOS AEREOS SA DE CV",                                      "spservaereos",       "SSA021209664", "grupo-avalanz", False),
    ("ORGEVENTOS",         "ORGANIZADORA DE EVENTOS Y ESPECTACULOS SA DE CV",                   "orgeventos",         "OEE0207177P4", "grupo-avalanz", False),
    ("ORGSIGXXI",          "ORGANIZADORA DE EVENTOS ESPECTACULOS DEP",                          "orgsigxxi",          "OEE0312021U8", "grupo-avalanz", False),
    ("CTRREGNTE",          "CONTROLADORA E INTEGRADORA REGIONAL DEL NORTE SA DE CV",            "ctrregnte",          "CIR1006012B8", "grupo-avalanz", False),
    ("REGIOFERIA",         "REGIOFERIA SA DE CV",                                               "regioferia",         "REG100202723", "grupo-avalanz", False),
    ("HORIZONTE",          "EL HORIZONTE MULTIMEDIA SA DE CV",                                  "horizonte",          "HMU120801KZ6", "grupo-avalanz", True),
    ("LA FILMADERA",       "LA FILMADERA SA DE CV",                                             "la-filmadera",       "PST121113TJ0", "grupo-avalanz", True),
    ("ESM HORIZONTE",      "ESM HORIZONTE SA DE CV",                                            "esm-horizonte",      "EHO1302184Y4", "grupo-avalanz", False),
    ("AVA BIENES RAICES",  "AVA BIENES RAICES",                                                 "ava-bienes-raices",  "SAC1004227K7", "grupo-avalanz", False),
    ("AVZ DIGITAL MEDIA",  "AVZ DIGITAL MEDIA SA DE CV",                                        "avz-digital-media",  "ADM200505IV5", "grupo-avalanz", True),
    ("EDITORA HTE",        "EDITORA EL HORIZONTE SA DE CV",                                     "editora-hte",        "EHO201130DH5", "grupo-avalanz", True),
    ("TODITO CARD",        "TODITO CARD SA DE CV",                                              "todito-card",        "TCA050929BM8", "grupo-avalanz", True),
    ("TODITO PAGOS",       "TODITO PAGOS SA DE CV",                                             "todito-pagos",       "TPA1004217A5", "grupo-avalanz", True),
    ("TCW",                "TCW SA DE CV",                                                      "tcw",                "TCW0512193I4", "grupo-avalanz", True),
    ("DTM",                "DISTRIBUIDORA DE TARJETAS MULTISERVICIOS SA DE CV",                 "dtm",                "DTM051219V54", "grupo-avalanz", False),
    ("GRUPO TODITO CARD",  "GRUPO TODITO CARD SA DE CV",                                        "grupo-todito-card",  "GTC1006019B0", "grupo-avalanz", False),
    ("CTRTPA",             "CONTROLADORA TPA SA DE CV",                                         "ctrtpa",             "CTP120119SL3", "grupo-avalanz", False),
    ("TODITO INTERFACE",   "TODITO INTERFACES E INTEGRACIONES ROD",                             "todito-interface",   "TPA1004217A3", "grupo-avalanz", True),
    ("TODITO WALLETS",     "TODITO WALLETS SA DE CV",                                           "todito-wallets",     "TWA1909129Z0", "grupo-avalanz", True),
    ("TODITO MONEDERO",    "TODITO MONEDEROS SA DE CV",                                         "todito-monedero",    "TMO2106115G1", "grupo-avalanz", True),
    ("REGIO DEPORTES",     "REGIODEPORTES SA DE CV",                                            "regio-deportes",     "REG9910064C1", "grupo-avalanz", False),
    ("PARQUE ECOLOGICO",   "PARQUE ECOLOGICO SIGLO XXI SA DE CV",                               "parque-ecologico",   "PES030123GJ0", "grupo-avalanz", False),
    ("FOMENTO DEPORTIVO",  "FOMENTO DE LA PROMOCION DEPORTIVA Y RECR",                          "fomento-deportivo",  "FPD030903U13", "grupo-avalanz", False),
    ("GPO. PARQUE RIO",    "GRUPO PARQUE RIO SA DE CV",                                         "gpo-parque-rio",     "GPR100601QZ0", "grupo-avalanz", False),
    ("BIENES TANGIBLE",    "BIENES TANGIBLES ESTRATEGICOS SA DE CV",                            "bienes-tangible",    "BTE110414C90", "grupo-avalanz", False),
    ("CAPITAL ACCIONA",    "CAPITAL ACCIONARIO SA DE CV",                                       "capital-acciona",    "CAC101209T54", "grupo-avalanz", False),
    ("VIABILIDAD EST",     "VIABILIDAD PARA ESTRUCTURAS SA DE CV",                              "viabilidad-est",     "VES101209CF2", "grupo-avalanz", False),
    ("CROSSPLAIN",         "INMUEBLES Y ACTIVOS CROSSPLAIN SA DE CV",                           "crossplain",         "IAC091210CI5", "grupo-avalanz", False),
    ("CAALANSO",           "CAALANSO SA DE CV",                                                 "caalanso",           "CAA160120PV6", "grupo-avalanz", True),
    ("NEPTUNIUM",          "NEPTUNIUM SA DE CV",                                                "neptunium",          "NEP1603154R3", "grupo-avalanz", False),
    ("BIENES INMUEBLE",    "BIENES INMUEBLES REGIONALES DEL NORTE",                             "bienes-inmueble",    "BIR1710242S1", "grupo-avalanz", True),
    ("AEREOS AVZ",         "SERVICIOS AEREOS AVZ",                                              "aereos-avz",         "SAA2309051E2", "grupo-avalanz", False),
    ("CONDOMINIO TORRE",   "CONDOMINIO TORRE DATAFLUX",                                         "condominio-torre",   "CTD000602LG8", "grupo-avalanz", True),
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def now():
    return datetime.now(timezone.utc)


async def connect(db: str) -> asyncpg.Connection:
    return await asyncpg.connect(
        host=DB_HOST, port=DB_PORT,
        user=DB_USER, password=DB_PASSWORD,
        database=db,
    )


# ── Seeder admin ──────────────────────────────────────────────────────────────

async def seed_admin():
    conn = await connect("avalanz_admin")
    print("[admin] Conectado a avalanz_admin")

    # Grupos
    group_ids = {}
    for name, slug in GROUPS:
        existing = await conn.fetchrow("SELECT id FROM groups WHERE slug = $1", slug)
        if existing:
            group_ids[slug] = str(existing["id"])
            print(f"[admin] Grupo ya existe: {name}")
            continue
        row = await conn.fetchrow(
            """
            INSERT INTO groups (id, name, slug, is_active, created_at, updated_at, is_deleted)
            VALUES (gen_random_uuid(), $1, $2, true, $3, $3, false)
            RETURNING id
            """,
            name, slug, now(),
        )
        group_ids[slug] = str(row["id"])
        print(f"[admin] Grupo creado: {name}")

    # Empresas
    company_ids = {}
    for nombre_comercial, name, slug, rfc, group_slug, is_active in COMPANIES:
        existing = await conn.fetchrow("SELECT id FROM companies WHERE slug = $1", slug)
        if existing:
            company_ids[slug] = str(existing["id"])
            print(f"[admin] Empresa ya existe: {nombre_comercial}")
            continue
        row = await conn.fetchrow(
            """
            INSERT INTO companies (id, group_id, nombre_comercial, name, slug, rfc, is_active, created_at, updated_at, is_deleted)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $7, false)
            RETURNING id
            """,
            group_ids[group_slug], nombre_comercial, name, slug, rfc, is_active, now(),
        )
        company_ids[slug] = str(row["id"])
        print(f"[admin] Empresa creada: {nombre_comercial}")

    # Roles globales base
    global_roles = [
        ("Super Administrador", "super_admin",  "Acceso total a toda la plataforma"),
        ("Admin Empresa",       "admin_empresa", "Gestion de usuarios dentro de su empresa"),
    ]
    global_role_ids = {}
    for name, slug, desc in global_roles:
        existing = await conn.fetchrow("SELECT id FROM global_roles WHERE slug = $1", slug)
        if existing:
            global_role_ids[slug] = str(existing["id"])
            print(f"[admin] Rol global ya existe: {name}")
            continue
        row = await conn.fetchrow(
            """
            INSERT INTO global_roles (id, name, slug, description, is_active, created_at, updated_at, is_deleted)
            VALUES (gen_random_uuid(), $1, $2, $3, true, $4, $4, false)
            RETURNING id
            """,
            name, slug, desc, now(),
        )
        global_role_ids[slug] = str(row["id"])
        print(f"[admin] Rol global creado: {name}")

    # Permisos globales base
    global_permissions = [
        ("Gestionar usuarios",  "users:manage",       "Crear, editar y eliminar usuarios",   "usuarios"),
        ("Ver usuarios",        "users:read",          "Ver listado y detalle de usuarios",    "usuarios"),
        ("Gestionar modulos",   "modules:manage",      "Crear, editar y eliminar modulos",     "modulos"),
        ("Ver modulos",         "modules:read",        "Ver listado y detalle de modulos",     "modulos"),
        ("Gestionar roles",     "roles:manage",        "Crear, editar y eliminar roles",       "roles"),
        ("Gestionar permisos",  "permissions:manage",  "Crear y asignar permisos",             "permisos"),
    ]
    for name, slug, desc, category in global_permissions:
        existing = await conn.fetchrow("SELECT id FROM global_permissions WHERE slug = $1", slug)
        if existing:
            print(f"[admin] Permiso global ya existe: {name}")
            continue
        await conn.execute(
            """
            INSERT INTO global_permissions (id, name, slug, description, category, created_at, updated_at, is_deleted)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $5, false)
            """,
            name, slug, desc, category, now(),
        )
        print(f"[admin] Permiso global creado: {name}")

    # Super admin usuario — asignado a AVALANZ SA DE CV
    existing = await conn.fetchrow("SELECT id FROM users WHERE email = $1", SUPER_ADMIN_EMAIL)
    super_admin_id = None
    if existing:
        super_admin_id = str(existing["id"])
        print(f"[admin] Super admin ya existe: {SUPER_ADMIN_EMAIL}")
    else:
        row = await conn.fetchrow(
            """
            INSERT INTO users (id, company_id, email, full_name, is_active, is_super_admin, created_at, updated_at, is_deleted)
            VALUES (gen_random_uuid(), $1, $2, $3, true, true, $4, $4, false)
            RETURNING id
            """,
            company_ids["avalanz"], SUPER_ADMIN_EMAIL, SUPER_ADMIN_NAME, now(),
        )
        super_admin_id = str(row["id"])
        print(f"[admin] Super admin creado: {SUPER_ADMIN_EMAIL}")

    # Asignar rol global super_admin
    if super_admin_id and "super_admin" in global_role_ids:
        existing = await conn.fetchrow(
            "SELECT id FROM user_global_roles WHERE user_id = $1 AND role_id = $2",
            super_admin_id, global_role_ids["super_admin"],
        )
        if not existing:
            await conn.execute(
                """
                INSERT INTO user_global_roles (id, user_id, role_id, created_at, updated_at)
                VALUES (gen_random_uuid(), $1, $2, $3, $3)
                """,
                super_admin_id, global_role_ids["super_admin"], now(),
            )
            print(f"[admin] Rol super_admin asignado a {SUPER_ADMIN_EMAIL}")

    await conn.close()
    print("[admin] Seeder admin completado")
    return super_admin_id


# ── Seeder auth ───────────────────────────────────────────────────────────────

async def seed_auth(super_admin_id: str):
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    conn = await connect("avalanz_auth")
    print("[auth] Conectado a avalanz_auth")

    existing = await conn.fetchrow("SELECT id FROM users WHERE email = $1", SUPER_ADMIN_EMAIL)
    if existing:
        print(f"[auth] Usuario ya existe en auth: {SUPER_ADMIN_EMAIL}")
        await conn.close()
        return

    hashed = pwd_context.hash(SUPER_ADMIN_PASSWORD)
    await conn.execute(
        """
        INSERT INTO users (
            id, email, full_name, hashed_password,
            is_active, is_temp_password, is_2fa_configured,
            failed_attempts, is_locked, created_at, updated_at, is_deleted
        )
        VALUES ($1, $2, $3, $4, true, false, false, 0, false, $5, $5, false)
        """,
        super_admin_id, SUPER_ADMIN_EMAIL, SUPER_ADMIN_NAME, hashed, now(),
    )
    print(f"[auth] Credenciales del super admin creadas: {SUPER_ADMIN_EMAIL}")
    await conn.close()
    print("[auth] Seeder auth completado")


# ── Main ──────────────────────────────────────────────────────────────────────

async def main():
    print("Iniciando seeder Avalanz...")
    print(f"Host: {DB_HOST}:{DB_PORT}")
    print(f"Super Admin: {SUPER_ADMIN_EMAIL}")
    print(f"Total empresas: {len(COMPANIES)}")
    print("")

    super_admin_id = await seed_admin()
    if super_admin_id:
        await seed_auth(super_admin_id)

    print("")
    print("Seeder completado exitosamente.")
    print(f"Acceso: {SUPER_ADMIN_EMAIL} / {SUPER_ADMIN_PASSWORD}")
    print("Recuerda cambiar la contrasena del super admin despues del primer login.")


if __name__ == "__main__":
    asyncio.run(main())