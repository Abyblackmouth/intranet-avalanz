#!/usr/bin/env node
/**
 * Scaffold webhook server para Intranet Avalanz
 * Corre en el servidor host y escucha peticiones del admin-service
 * para generar estructuras de módulos y reconstruir el frontend
 *
 * Uso: node scripts/scaffold-server.js
 * Puerto: 3002
 */

const http     = require('http')
const { exec } = require('child_process')
const path     = require('path')

const PORT   = 3002
const ROOT   = path.resolve(__dirname, '..')
const SCRIPT = path.join(__dirname, 'create-module.js')

function runCommand(cmd, cwd) {
  return new Promise((resolve, reject) => {
    console.log(`[scaffold] Ejecutando: ${cmd}`)
    exec(cmd, { cwd: cwd || ROOT }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[scaffold] Error: ${error.message}`)
        reject({ error: error.message, stderr })
        return
      }
      console.log(`[scaffold] OK:\n${stdout}`)
      resolve({ stdout, stderr })
    })
  })
}

async function runScaffold(args) {
  const cmd = `node "${SCRIPT}" ${args.map(a => `"${a}"`).join(' ')}`
  return runCommand(cmd, ROOT)
}

async function rebuildFrontend() {
  const frontendDir = path.join(ROOT, 'frontend')
  console.log(`[scaffold] Reconstruyendo frontend...`)
  await runCommand('npm run build', frontendDir)
  console.log(`[scaffold] Reiniciando PM2...`)
  await runCommand('pm2 restart intranet-frontend')
  console.log(`[scaffold] Frontend actualizado.`)
}


async function gitCommit(slug, isSubmodule = false, moduleSlug = null) {
  try {
    console.log('[scaffold] Commiteando archivos generados...')
    const msg = isSubmodule
      ? 'feat(' + moduleSlug + '): add ' + slug + ' submodule scaffold'
      : 'feat(' + slug + '): add ' + slug + ' module scaffold'
    await runCommand('git add -A', ROOT)
    await runCommand('git commit -m "' + msg + '"', ROOT)
    await runCommand('git push origin develop', ROOT)
    console.log('[scaffold] Commit y push exitosos.')
  } catch (err) {
    console.error('[scaffold] Git commit falló (no crítico):', err.error)
  }
}
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => { body += chunk.toString() })
    req.on('end', () => {
      try { resolve(JSON.parse(body)) }
      catch { resolve({}) }
    })
    req.on('error', reject)
  })
}

function respond(res, status, data) {
  res.writeHead(status)
  res.end(JSON.stringify(data))
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    respond(res, 200, { ok: true, service: 'scaffold-server', port: PORT })
    return
  }

  if (req.method !== 'POST') {
    respond(res, 405, { error: 'Method not allowed' })
    return
  }

  const body = await parseBody(req)

  if (req.url === '/scaffold/module') {
    const { slug } = body
    if (!slug) {
      respond(res, 400, { error: 'slug requerido' })
      return
    }
    try {
      const result = await runScaffold([slug])
      respond(res, 200, { ok: true, slug, output: result.stdout })
      rebuildFrontend().then(() => gitCommit(slug)).catch(err => console.error(`[scaffold] Rebuild falló: ${err.error}`))
    } catch (err) {
      const alreadyExists = err.error && err.error.includes('ya existe')
      respond(res, alreadyExists ? 409 : 500, { ok: false, error: err.error, already_exists: !!alreadyExists })
    }
    return
  }

  if (req.url === '/scaffold/submodule') {
    const { moduleSlug, subSlug } = body
    if (!moduleSlug || !subSlug) {
      respond(res, 400, { error: 'moduleSlug y subSlug requeridos' })
      return
    }
    try {
      const result = await runScaffold([moduleSlug, subSlug])
      respond(res, 200, { ok: true, moduleSlug, subSlug, output: result.stdout })
      rebuildFrontend().then(() => gitCommit(subSlug, true, moduleSlug)).catch(err => console.error(`[scaffold] Rebuild falló: ${err.error}`))
    } catch (err) {
      const alreadyExists = err.error && err.error.includes('ya existe')
      respond(res, alreadyExists ? 409 : 500, { ok: false, error: err.error, already_exists: !!alreadyExists })
    }
    return
  }

  respond(res, 404, { error: 'Ruta no encontrada' })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[scaffold] Servidor corriendo en http://0.0.0.0:${PORT}`)
  console.log(`[scaffold] Endpoints:`)
  console.log(`  GET  /health`)
  console.log(`  POST /scaffold/module     { slug }`)
  console.log(`  POST /scaffold/submodule  { moduleSlug, subSlug }`)
})
