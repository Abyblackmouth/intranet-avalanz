#!/usr/bin/env node

/**
 * Scaffold webhook server para Intranet Avalanz
 * Corre en WSL2 y escucha peticiones del frontend para generar estructuras de módulos
 *
 * Uso: node scripts/scaffold-server.js
 * Puerto: 3001
 */

const http     = require('http')
const { exec } = require('child_process')
const path     = require('path')

const PORT    = 3002
const ROOT    = path.resolve(__dirname, '..')
const SCRIPT  = path.join(__dirname, 'create-module.js')

function runScript(args) {
  return new Promise((resolve, reject) => {
    const cmd = `node "${SCRIPT}" ${args.join(' ')}`
    console.log(`[scaffold] Ejecutando: ${cmd}`)
    exec(cmd, { cwd: ROOT }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[scaffold] Error: ${error.message}`)
        reject({ error: error.message, stderr })
        return
      }
      console.log(`[scaffold] Salida:\n${stdout}`)
      resolve({ stdout, stderr })
    })
  })
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

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.writeHead(405)
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const body = await parseBody(req)

  // POST /scaffold/module { slug }
  if (req.url === '/scaffold/module') {
    const { slug } = body
    if (!slug) {
      res.writeHead(400)
      res.end(JSON.stringify({ error: 'slug requerido' }))
      return
    }
    try {
      const result = await runScript([slug])
      res.writeHead(200)
      res.end(JSON.stringify({ ok: true, slug, output: result.stdout }))
    } catch (err) {
      res.writeHead(500)
      res.end(JSON.stringify({ ok: false, error: err.error }))
    }
    return
  }

  // POST /scaffold/submodule { moduleSlug, subSlug }
  if (req.url === '/scaffold/submodule') {
    const { moduleSlug, subSlug } = body
    if (!moduleSlug || !subSlug) {
      res.writeHead(400)
      res.end(JSON.stringify({ error: 'moduleSlug y subSlug requeridos' }))
      return
    }
    try {
      const result = await runScript([moduleSlug, subSlug])
      res.writeHead(200)
      res.end(JSON.stringify({ ok: true, moduleSlug, subSlug, output: result.stdout }))
    } catch (err) {
      res.writeHead(500)
      res.end(JSON.stringify({ ok: false, error: err.error }))
    }
    return
  }

  res.writeHead(404)
  res.end(JSON.stringify({ error: 'Ruta no encontrada' }))
})

server.listen(PORT, () => {
  console.log(`[scaffold] Servidor corriendo en http://localhost:${PORT}`)
  console.log(`[scaffold] Endpoints:`)
  console.log(`  POST /scaffold/module     { slug }`)
  console.log(`  POST /scaffold/submodule  { moduleSlug, subSlug }`)
})
