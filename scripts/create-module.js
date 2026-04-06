#!/usr/bin/env node

/**
 * Script generador de módulos y submódulos para Intranet Avalanz
 *
 * Uso:
 *   node scripts/create-module.js <modulo>                    → crea estructura de módulo
 *   node scripts/create-module.js <modulo> <submodulo>        → crea estructura de submódulo
 *
 * Ejemplos:
 *   node scripts/create-module.js legal
 *   node scripts/create-module.js legal expedientes
 */

const fs   = require('fs')
const path = require('path')

// ── Helpers ───────────────────────────────────────────────────────────────────

const toPascal = (str) =>
  str.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')

const toTitle = (str) =>
  str.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

const write = (filePath, content) => {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  if (fs.existsSync(filePath)) {
    console.log(`  ! Ya existe: ${filePath}`)
    return
  }
  fs.writeFileSync(filePath, content, 'utf8')
  console.log(`  + ${filePath}`)
}

const ROOT = path.resolve(__dirname, '..')

// ── Templates frontend ────────────────────────────────────────────────────────

const moduleLayoutTsx = (slug) => `'use client'

import { useAuthStore } from '@/store/authStore'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import * as LucideIcons from 'lucide-react'

function SubIcon({ icon }: { icon?: string | null }) {
  if (!icon) return <LucideIcons.Box size={15} />
  const name = icon.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
  const Icon = (LucideIcons as any)[name]
  return Icon ? <Icon size={15} /> : <LucideIcons.Box size={15} />
}

export default function ${toPascal(slug)}Layout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  const pathname = usePathname()
  const mod = (user?.modules ?? []).find((m: any) => m.slug === '${slug}')
  const submodules: any[] = mod?.submodules ?? []

  return (
    <div className="flex h-full">
      {submodules.length > 0 && (
        <aside className="w-52 shrink-0 bg-white border-r border-slate-200 flex flex-col py-4 px-2 gap-0.5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-2 mb-2">
            ${toTitle(slug)}
          </p>
          {submodules.map((sub: any) => {
            const href = \`/app/${slug}/\${sub.slug}\`
            const active = pathname.startsWith(href)
            return (
              <Link
                key={sub.slug}
                href={href}
                className={\`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors \${
                  active
                    ? 'bg-[#1a4fa0] text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }\`}
              >
                <SubIcon icon={sub.icon} />
                {sub.name}
              </Link>
            )
          })}
        </aside>
      )}
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  )
}
`

const modulePageTsx = (slug) => `'use client'

import { Construction } from 'lucide-react'

export default function ${toPascal(slug)}Page() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-32 text-center px-6">
      <div className="p-5 bg-blue-50 rounded-2xl mb-6">
        <Construction size={40} className="text-[#1a4fa0]" />
      </div>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Módulo ${toTitle(slug)}</h1>
      <p className="text-slate-400 text-sm max-w-sm">
        Selecciona un submódulo del menú lateral para comenzar.
      </p>
    </div>
  )
}
`

const submodulePageTsx = (moduleSlug, subSlug) => `'use client'

import PageWrapper from '@/components/layout/PageWrapper'

export default function ${toPascal(subSlug)}Page() {
  return (
    <PageWrapper
      title="${toTitle(subSlug)}"
      description="Módulo ${toTitle(moduleSlug)} — ${toTitle(subSlug)}"
      actions={null}
    >
      <div className="flex items-center justify-center py-32 text-slate-400 text-sm">
        Contenido de ${toTitle(subSlug)} en construcción
      </div>
    </PageWrapper>
  )
}
`

const submoduleTableTsx = (moduleSlug, subSlug) => `'use client'

// ${toPascal(subSlug)}Table — tabla principal del submódulo ${toTitle(subSlug)}

export default function ${toPascal(subSlug)}Table() {
  return (
    <div className="text-slate-400 text-sm">Tabla de ${toTitle(subSlug)}</div>
  )
}
`

const submoduleFormTsx = (moduleSlug, subSlug) => `'use client'

// ${toPascal(subSlug)}Form — formulario del submódulo ${toTitle(subSlug)}

export default function ${toPascal(subSlug)}Form({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  return (
    <div className="text-slate-400 text-sm">Formulario de ${toTitle(subSlug)}</div>
  )
}
`

// ── Templates backend ─────────────────────────────────────────────────────────

const backendMain = (slug) => `from fastapi import FastAPI
from app.config import config
from app.database import engine
from app.routes import ${slug.replace(/-/g,'_')}

app = FastAPI(title="${toTitle(slug)} Service", version="1.0.0")

app.include_router(${slug.replace(/-/g,'_')}.router)

@app.get("/health")
async def health():
    return {"service": "${slug}-service", "status": "ok"}
`

const backendConfig = (slug) => `from pydantic_settings import BaseSettings

class Config(BaseSettings):
    SERVICE_NAME: str = "${slug}-service"
    SERVICE_VERSION: str = "1.0.0"
    DATABASE_URL: str = "postgresql+asyncpg://avalanz_user:password@postgres:5432/avalanz_${slug.replace(/-/g,'_')}"
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"

    class Config:
        env_file = ".env"

config = Config()
`

const backendDatabase = () => `from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.config import config

engine = create_async_engine(config.DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
`

const backendRoute = (slug) => `from fastapi import APIRouter

router = APIRouter(prefix="/${slug.replace(/-/g,'-')}", tags=["${toTitle(slug)}"])

@router.get("/")
async def list_items():
    return {"data": [], "message": "Listado de ${toTitle(slug)}"}
`

const backendService = (slug) => `# ${toTitle(slug)} service — lógica de negocio
`

const backendModels = (slug) => `from sqlalchemy import Column, String, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase
import uuid
from datetime import datetime, timezone

class Base(DeclarativeBase):
    pass

# Agrega tus modelos aquí
# class ${toPascal(slug)}(Base):
#     __tablename__ = "${slug.replace(/-/g,'_')}s"
#     id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
#     ...
`

const backendDockerfile = (slug) => `FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
`

const backendRequirements = () => `fastapi==0.115.0
uvicorn==0.30.6
sqlalchemy==2.0.35
asyncpg==0.29.0
pydantic-settings==2.5.2
alembic==1.13.3
httpx==0.27.2
python-jose==3.3.0
`

const backendEnvExample = (slug) => `SERVICE_NAME=${slug}-service
DATABASE_URL=postgresql+asyncpg://avalanz_user:password@postgres:5432/avalanz_${slug.replace(/-/g,'_')}
JWT_SECRET_KEY=your_jwt_secret_here
JWT_ALGORITHM=HS256
`

const backendSubRoute = (moduleSlug, subSlug) => `from fastapi import APIRouter

router = APIRouter(prefix="/${subSlug.replace(/-/g,'-')}", tags=["${toTitle(subSlug)}"])

@router.get("/")
async def list_${subSlug.replace(/-/g,'_')}():
    return {"data": [], "message": "Listado de ${toTitle(subSlug)}"}
`

const backendSubRouteInit = (moduleSlug, subSlug) => `from app.routes.${subSlug.replace(/-/g,'_')} import ${subSlug.replace(/-/g,'_')}
`

const backendSubService = (moduleSlug, subSlug) => `# ${toTitle(subSlug)} service — lógica de negocio del submódulo
`

const backendSubServiceInit = () => ``

// ── Crear módulo ──────────────────────────────────────────────────────────────

function createModule(slug) {
  console.log(`\nCreando módulo: ${slug}\n`)

  // Frontend
  const feBase = path.join(ROOT, 'frontend/app/(private)/app', slug)
  write(path.join(feBase, 'layout.tsx'), moduleLayoutTsx(slug))
  write(path.join(feBase, 'page.tsx'), modulePageTsx(slug))

  // Frontend components
  const compBase = path.join(ROOT, 'frontend/components/app', slug)
  if (!fs.existsSync(compBase)) {
    fs.mkdirSync(compBase, { recursive: true })
    fs.writeFileSync(path.join(compBase, '.gitkeep'), '')
    console.log(`  + frontend/components/app/${slug}/.gitkeep`)
  }

  // Backend service
  const beBase = path.join(ROOT, `backend/modules/${slug}-service`)
  write(path.join(beBase, 'app/main.py'), backendMain(slug))
  write(path.join(beBase, 'app/config.py'), backendConfig(slug))
  write(path.join(beBase, 'app/database.py'), backendDatabase())
  write(path.join(beBase, 'app/models/__init__.py'), backendModels(slug))
  write(path.join(beBase, 'app/routes/__init__.py'), '')
  write(path.join(beBase, `app/routes/${slug.replace(/-/g,'_')}.py`), backendRoute(slug))
  write(path.join(beBase, 'app/services/__init__.py'), '')
  write(path.join(beBase, `app/services/${slug.replace(/-/g,'_')}_service.py`), backendService(slug))
  write(path.join(beBase, 'Dockerfile'), backendDockerfile(slug))
  write(path.join(beBase, 'requirements.txt'), backendRequirements())
  write(path.join(beBase, '.env.example'), backendEnvExample(slug))

  console.log(`\nOK: Módulo "${slug}" creado exitosamente.`)
  console.log(`\nPróximos pasos:`)
  console.log(`   1. Da de alta el módulo en el admin: /admin/modules`)
  console.log(`   2. Agrega el servicio al docker-compose (apunta a backend/modules/${slug}-service)`)
  console.log(`   3. Crea los submódulos: node scripts/create-module.js ${slug} <submodulo>`)
}

// ── Crear submódulo ───────────────────────────────────────────────────────────

function createSubmodule(moduleSlug, subSlug) {
  console.log(`\nCreando submódulo: ${subSlug} en módulo: ${moduleSlug}\n`)

  // Verificar que el módulo existe
  const moduleBase = path.join(ROOT, 'frontend/app/(private)/app', moduleSlug)
  if (!fs.existsSync(moduleBase)) {
    console.error(`  ERROR: El módulo "${moduleSlug}" no existe. Créalo primero:`)
    console.error(`     node scripts/create-module.js ${moduleSlug}`)
    process.exit(1)
  }

  // Frontend página
  const feBase = path.join(moduleBase, subSlug)
  write(path.join(feBase, 'page.tsx'), submodulePageTsx(moduleSlug, subSlug))

  // Frontend componentes
  const compBase = path.join(ROOT, 'frontend/components/app', moduleSlug, subSlug)
  write(path.join(compBase, `${toPascal(subSlug)}Table.tsx`), submoduleTableTsx(moduleSlug, subSlug))
  write(path.join(compBase, `${toPascal(subSlug)}Form.tsx`), submoduleFormTsx(moduleSlug, subSlug))

  // Backend route y service
  const beBase = path.join(ROOT, `backend/modules/${moduleSlug}-service`)
  if (!fs.existsSync(beBase)) {
    console.warn(`  ! El backend "${moduleSlug}-service" no existe — solo se creó el frontend.`)
  } else {
    const subSlugClean = subSlug.replace(/-/g,'_')
    write(path.join(beBase, `app/routes/${subSlugClean}/__init__.py`), backendSubRouteInit(moduleSlug, subSlug))
    write(path.join(beBase, `app/routes/${subSlugClean}/${subSlugClean}.py`), backendSubRoute(moduleSlug, subSlug))
    write(path.join(beBase, `app/services/${subSlugClean}/__init__.py`), backendSubServiceInit())
    write(path.join(beBase, `app/services/${subSlugClean}/${subSlugClean}_service.py`), backendSubService(moduleSlug, subSlug))
  }

  console.log(`\nOK: Submódulo "${subSlug}" creado en "${moduleSlug}" exitosamente.`)
  console.log(`\nPróximos pasos:`)
  console.log(`   1. Da de alta el submódulo en el admin: /admin/modules`)
  console.log(`   2. Importa el router en backend/modules/${moduleSlug}-service/app/main.py`)
  console.log(`   3. Desarrolla la lógica en los archivos generados`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

if (args.length === 0) {
  console.log('Uso:')
  console.log('  node scripts/create-module.js <modulo>')
  console.log('  node scripts/create-module.js <modulo> <submodulo>')
  process.exit(0)
}

if (args.length === 1) {
  createModule(args[0].toLowerCase())
} else {
  createSubmodule(args[0].toLowerCase(), args[1].toLowerCase())
}
