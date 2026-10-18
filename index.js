/**
 * @sunt2049/dsh-mcp-manager — Host half.
 *
 * Two write paths, deliberately different:
 *
 *  - `ctx.configEditor.edit` for an existing row's config. It persists and
 *    reconciles through the Loader, and the MCP client reloads that server's
 *    connection in place, so this one is live.
 *  - the profile `cordis.patch.yml` document for adding, removing or parking a
 *    row. Nothing watches that file, so these changes are persisted only and
 *    the panel reports `pendingRestart` until the host restarts.
 *
 * Routes (same-origin, JSON):
 *   GET  /mcp-manager/overview   servers, live tool inventory, parked servers
 *   GET  /mcp-manager/schema     one tool's full JSON Schema, by wire name
 *   GET  /mcp-manager/export     raw configs as JSON
 *   POST /mcp-manager/save       patch one server's config via configEditor
 *   POST /mcp-manager/rows       add / remove / disable / enable a patch row
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { dirname, resolve } from 'node:path'
import {
  appendRow,
  buildRowLines,
  describeRow,
  insertRow,
  parsePatch,
  removeRow,
  rowIds,
  serializePatch,
} from './patch-doc.js'

const MCP_PLUGIN = '@deepseek-ai/dsh-mcp-client'
const SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/

/** Config keys this console is willing to write back through configEditor. */
const EDITABLE = new Set([
  'serverName',
  'transport',
  'url',
  'command',
  'args',
  'env',
  'cwd',
  'headers',
  'toolCallTimeoutMs',
  'failOnStartupError',
  'maxInstructionBytes',
])

/** Set once this process writes a patch row; a restart clears it. */
let rowsTouchedAt = null

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function text(value) {
  return typeof value === 'string' ? value : ''
}

function clip(value, limit) {
  const body = text(value).replace(/\s+/g, ' ').trim()
  return body.length > limit ? `${body.slice(0, limit - 1)}…` : body
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(payload))
}

function readBody(request) {
  return new Promise((done) => {
    let data = ''
    request.on('data', (chunk) => {
      data += String(chunk)
      if (data.length > 2_000_000) request.destroy()
    })
    request.on('end', () => {
      try {
        done(JSON.parse(data))
      } catch {
        done({})
      }
    })
    request.on('error', () => done({}))
  })
}

/** Reject cross-site writes; compare host:port exactly when Origin is present. */
function trustedOrigin(request) {
  const origin = request.headers.origin
  const host = request.headers.host
  if (typeof origin !== 'string') return true
  if (typeof host !== 'string') return false
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase()
  } catch {
    return false
  }
}

function entryName(entry) {
  if (!entry) return ''
  return text(entry.name) || text(entry.options && entry.options.name) || ''
}

function isMcpRow(entry, config) {
  if (entryName(entry) === MCP_PLUGIN) return true
  const shape = asObject(config)
  return Boolean(shape.serverName) && Boolean(shape.transport)
}

/** `include:mcp-x` → `mcp-x`: the id this file's `- id:` lines carry. */
function patchIdOf(entryId) {
  const raw = text(entryId)
  const cut = raw.lastIndexOf(':')
  return cut === -1 ? raw : raw.slice(cut + 1)
}

function parkedPath(patchPath) {
  // Per profile: `profiles/<name>/mcp-manager/disabled.json`. Sharing one store
  // across profiles made a row parked in one profile vanish in every other one.
  return resolve(dirname(patchPath), 'mcp-manager', 'disabled.json')
}

function readParked(patchPath) {
  try {
    const file = parkedPath(patchPath)
    if (!existsSync(file)) return {}
    return asObject(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return {}
  }
}

function writeParked(patchPath, parked) {
  const file = parkedPath(patchPath)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(parked, null, 2), 'utf8')
}

function readDocument(patchPath) {
  const source = readFileSync(patchPath, 'utf8')
  const blocks = parsePatch(source)
  return { blocks, lossless: serializePatch(blocks) === source }
}

/**
 * Write the document **in place**. The Loader's HMR watcher holds the file's
 * handle: writing a temp file and renaming it over the original replaces that
 * handle, so the watcher never fires and the change silently waits for a
 * restart. Writing through the same path keeps the watcher alive and the new
 * composition is applied within a few seconds.
 */
function writeDocument(patchPath, blocks) {
  const body = serializePatch(blocks)
  const tmp = `${patchPath}.mcp-manager.tmp`
  writeFileSync(tmp, body, 'utf8')
  writeFileSync(patchPath, body, 'utf8')
  try {
    unlinkSync(tmp)
  } catch {
    /* the temp file is only a crash breadcrumb */
  }
}

/** Profile rows whose plugin is the official MCP client. */
function readServers(ctx, patchIds) {
  const out = { patchPath: '', servers: [], error: null }

  try {
    out.patchPath = ctx.configEditor.documentPath || ''
  } catch (error) {
    out.error = `configEditor.documentPath: ${String((error && error.message) || error)}`
  }

  let configurations = []
  try {
    configurations = ctx.configEditor.configuration() || []
  } catch (error) {
    out.error = `configEditor.configuration: ${String((error && error.message) || error)}`
    return out
  }

  for (const row of configurations) {
    const entry = row && row.entry
    if (!entry) continue

    // A Loader entry keeps its applied config on `options`; `inherited`/`override`
    // carry the layer values (bundle defaults vs. the profile patch).
    const options = asObject(entry.options)
    const applied = asObject(options.config)
    const entryConfig = asObject(entry.config)
    const inherited = asObject(row.inherited)
    const override = asObject(row.override)
    const resolved = Object.keys(applied).length
      ? applied
      : Object.keys(entryConfig).length
        ? entryConfig
        : Object.keys(override).length
          ? { ...inherited, ...override }
          : inherited

    if (!isMcpRow(entry, resolved)) continue

    const env = asObject(resolved.env)
    const shortId = patchIdOf(entry.id)

    out.servers.push({
      id: text(entry.id),
      patchId: shortId,
      serverName: text(resolved.serverName),
      transport: text(resolved.transport),
      url: text(resolved.url),
      command: text(resolved.command),
      args: Array.isArray(resolved.args) ? resolved.args.map((item) => String(item)) : [],
      cwd: text(resolved.cwd),
      envKeys: Object.keys(env),
      headerKeys: Object.keys(asObject(resolved.headers)),
      toolCallTimeoutMs: typeof resolved.toolCallTimeoutMs === 'number' ? resolved.toolCallTimeoutMs : null,
      failOnStartupError: resolved.failOnStartupError === true,
      disabled: options.disabled === true,
      /** True when this row is a `- id:` line of the profile patch document. */
      inPatch: patchIds.has(shortId),
      editable: resolved,
    })
  }

  out.servers.sort((a, b) => a.serverName.localeCompare(b.serverName))
  return out
}

/**
 * Every server the panel shows: the mounted rows, plus the document's MCP rows
 * that the Loader has not applied yet. `configuration()` lags a write by a
 * moment, so the two views disagree briefly after add/enable; every consumer
 * (list, probe) must read this one.
 */
function readAllServers(ctx, patchPath) {
  let patchRows = []
  try {
    for (const block of parsePatch(readFileSync(patchPath, 'utf8'))) {
      if (block.kind === 'text') continue
      for (const row of block.rows) if (row.id) patchRows.push(row)
    }
  } catch {
    patchRows = []
  }

  const patchIds = new Set(patchRows.map((row) => row.id))
  const { servers, error } = readServers(ctx, patchIds)
  const mountedById = new Map(servers.map((server) => [server.patchId, server]))
  const merged = []
  const placed = new Set()

  for (const row of patchRows) {
    const live = mountedById.get(row.id)
    if (live) {
      placed.add(row.id)
      merged.push({ ...live, mounted: true })
      continue
    }
    const info = describeRow(row.lines)
    // The profile patch also holds every other plugin's row; only the MCP
    // client's rows are servers.
    if (info.name !== MCP_PLUGIN && !info.serverName) continue
    placed.add(row.id)
    merged.push({
      id: row.id,
      patchId: row.id,
      serverName: info.serverName,
      transport: info.transport,
      url: info.url,
      command: info.command,
      args: [],
      cwd: '',
      envKeys: [],
      headerKeys: [],
      toolCallTimeoutMs: null,
      failOnStartupError: false,
      disabled: false,
      inPatch: true,
      /** In the document, not loaded by this process yet. */
      mounted: false,
      editable: {},
    })
  }

  for (const server of servers) {
    if (!placed.has(server.patchId)) merged.push({ ...server, mounted: true })
  }

  return { merged, servers, error }
}

/** `mcp__<server>__<tool>` grouped by server, with descriptions only. */
function readToolGroups(ctx) {
  let schemas = []
  try {
    schemas = ctx.tools.schemas() || []
  } catch {
    return new Map()
  }

  const groups = new Map()
  for (const schema of schemas) {
    const name = text(schema && schema.name)
    if (!name.startsWith('mcp__')) continue
    const body = name.slice('mcp__'.length)
    const cut = body.indexOf('__')
    if (cut <= 0) continue
    const server = body.slice(0, cut)
    if (!groups.has(server)) groups.set(server, [])
    groups.get(server).push({
      name,
      wire: body.slice(cut + 2),
      description: clip(schema.description, 240),
    })
  }

  for (const list of groups.values()) list.sort((a, b) => a.wire.localeCompare(b.wire))
  return groups
}

function sanitizePatch(input) {
  const clean = {}
  for (const key of Object.keys(asObject(input))) {
    if (!EDITABLE.has(key)) continue
    const value = input[key]
    if (key === 'args' && Array.isArray(value)) {
      clean.args = value.map((item) => String(item))
      continue
    }
    if ((key === 'env' || key === 'headers') && value && typeof value === 'object') {
      const map = {}
      for (const entry of Object.entries(value)) {
        if (typeof entry[1] === 'string') map[entry[0]] = entry[1]
      }
      clean[key] = map
      continue
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      clean[key] = value
    }
  }
  return clean
}

/** Validate a new server before it reaches the document. */
function readNewServer(input) {
  const config = asObject(input)
  const serverName = text(config.serverName).trim()
  const transport = text(config.transport).trim()
  const out = { error: null, config: null }

  if (!SERVER_NAME.test(serverName)) {
    out.error = 'serverName 只能包含字母、数字、下划线和短横线，长度 1–32'
    return out
  }
  if (transport !== 'stdio' && transport !== 'streamable-http') {
    out.error = 'transport 只能是 stdio 或 streamable-http'
    return out
  }

  const next = { serverName, transport }
  if (transport === 'streamable-http') {
    const url = text(config.url).trim()
    if (!url) {
      out.error = 'streamable-http 需要 url'
      return out
    }
    next.url = url
  } else {
    const command = text(config.command).trim()
    if (!command) {
      out.error = 'stdio 需要 command'
      return out
    }
    next.command = command
    next.args = Array.isArray(config.args) ? config.args.map((item) => String(item)).filter(Boolean) : []
    const env = asObject(config.env)
    const keys = Object.keys(env)
    if (keys.length > 0) {
      next.env = {}
      for (const key of keys) if (typeof env[key] === 'string') next.env[key] = env[key]
    }
  }

  const timeout = config.toolCallTimeoutMs
  if (timeout !== undefined && timeout !== null && timeout !== '') {
    const ms = Number(timeout)
    if (!Number.isFinite(ms) || ms <= 0) {
      out.error = 'toolCallTimeoutMs 必须是正数毫秒'
      return out
    }
    next.toolCallTimeoutMs = ms
  }
  if (config.failOnStartupError === true) next.failOnStartupError = true

  out.config = next
  return out
}

function uniqueRowId(taken, serverName) {
  const base = `mcp-${serverName.replace(/[^A-Za-z0-9_-]/g, '-')}`
  if (!taken.has(base)) return base
  let index = 2
  while (taken.has(`${base}-${index}`)) index += 1
  return `${base}-${index}`
}

const PROBE_TIMEOUT_MS = 3000

/** TCP reachability of an http(s) endpoint; no protocol payload. */
function probeTcp(url, timeoutMs) {
  const started = Date.now()
  return new Promise((done) => {
    let target
    try {
      target = new URL(url)
    } catch {
      done({ reachable: false, detail: `url 不是合法地址：${url}`, ms: 0 })
      return
    }
    const port = Number(target.port || (target.protocol === 'https:' ? 443 : 80))
    const host = target.hostname
    const socket = createConnection({ host, port })
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      socket.destroy()
      done({ ...result, ms: Date.now() - started })
    }
    socket.setTimeout(timeoutMs, () => finish({ reachable: false, detail: `TCP ${host}:${port} 连接超时` }))
    socket.on('connect', () => finish({ reachable: true, detail: `TCP ${host}:${port} 可连接` }))
    socket.on('error', (error) => finish({ reachable: false, detail: `TCP ${host}:${port} 失败：${error.code || error.message}` }))
  })
}

/** One MCP `initialize` POST, enough to tell "port open" from "not an MCP endpoint". */
async function probeHttp(url, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: '@sunt2049/dsh-mcp-manager', version: '0.2.0' },
        },
      }),
      signal: controller.signal,
    })
    const type = response.headers.get('content-type') || ''
    const session = response.headers.get('mcp-session-id')
    return {
      reachable: true,
      status: response.status,
      contentType: type,
      detail: `HTTP ${response.status}${type ? ' · ' + type.split(';')[0] : ''}${session ? ' · 有 session-id' : ''}`,
      ms: Date.now() - started,
    }
  } catch (error) {
    return {
      reachable: false,
      detail: `initialize POST 失败：${String((error && error.message) || error)}`,
      ms: Date.now() - started,
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * A path the shell resolves itself; bare names (`cmd.exe`) come from PATH.
 * A single leading slash is a cmd switch (`/d`, `/c`), not a path.
 */
function isAbsolutePath(value) {
  if (/^[A-Za-z]:[\\/]/.test(value)) return true
  if (value.startsWith('\\\\') || value.startsWith('//')) return true
  if (value.startsWith('/')) return value.length > 3 && value.slice(1).includes('/')
  return false
}

/** Explain a stdio row without spawning it. */
function probeStdio(server) {
  if (!server.command) return { reachable: false, detail: '没有配置 command', ms: 0 }

  const findings = []
  let ok = true

  if (isAbsolutePath(server.command)) {
    if (existsSync(server.command)) {
      findings.push('command 存在')
    } else {
      ok = false
      findings.push(`command 不存在：${server.command}`)
    }
  } else {
    // `/d`, `/c`, `-y` and friends are switches, not files: only absolute
    // arguments are checked, and a bare command name is resolved by PATH.
    findings.push(`command 由 PATH 解析：${server.command}`)
  }

  const paths = (server.args || []).filter((arg) => isAbsolutePath(arg))
  for (const arg of paths) {
    if (!existsSync(arg)) {
      ok = false
      findings.push(`参数文件缺失：${arg}`)
    }
  }
  if (paths.length === 0) findings.push('参数里没有绝对路径文件')

  return { reachable: ok, detail: findings.join(' · '), ms: 0 }
}

export function apply(ctx) {
  ctx.inject(['webServer', 'tools', 'configEditor'], (hostCtx) => {
    const routes = []

    routes.push(hostCtx.webServer.register({
      kind: 'exact',
      path: '/mcp-manager/overview',
      handler: async (request, response) => {
        if (request.method !== 'GET') {
          response.writeHead(405, { allow: 'GET' })
          response.end()
          return
        }
        try {
          const patchPath = hostCtx.configEditor.documentPath || ''
          const { merged, servers, error } = readAllServers(hostCtx, patchPath)
          const groups = readToolGroups(hostCtx)
          const parked = readParked(patchPath)
          const parkedIds = new Set(Object.keys(parked))

          // A parked row is still mounted until the host restarts, but the user
          // already said "off": keep it out of the active list and let the parked
          // entry report that the running process still has it.
          const active = merged.filter((server) => !parkedIds.has(server.patchId))
          const withTools = active.map((server) => ({
            ...server,
            tools: groups.get(server.serverName) || [],
          }))
          const toolTotal = withTools.reduce((total, server) => total + server.tools.length, 0)

          const mounted = new Set(servers.map((server) => server.patchId))
          const parkedList = Object.entries(parked)
            .map(([id, record]) => ({
              id,
              ...describeRow(record && record.lines),
              savedAt: text(record && record.savedAt),
              /** Still loaded in this process; a restart is what actually drops it. */
              stillMounted: mounted.has(id),
            }))
            .sort((a, b) => a.id.localeCompare(b.id))

          sendJson(response, 200, {
            ok: true,
            patchPath,
            error,
            servers: withTools,
            parked: parkedList,
            toolTotal,
            serverTotal: withTools.length,
            /** True only while a document row has not been applied yet. */
            pendingRestart: withTools.some((server) => server.mounted === false),
            rowsTouchedAt,
            generatedAt: new Date().toISOString(),
          })
        } catch (error) {
          sendJson(response, 500, { ok: false, error: String((error && error.message) || error) })
        }
      },
    }))

    routes.push(hostCtx.webServer.register({
      kind: 'exact',
      path: '/mcp-manager/schema',
      handler: async (request, response) => {
        if (request.method !== 'GET') {
          response.writeHead(405, { allow: 'GET' })
          response.end()
          return
        }
        try {
          const url = new URL(request.url || '/', 'http://localhost')
          const wanted = text(url.searchParams.get('tool'))
          if (!wanted) {
            sendJson(response, 400, { ok: false, error: 'tool is required' })
            return
          }
          let schemas = []
          try {
            schemas = hostCtx.tools.schemas() || []
          } catch {
            schemas = []
          }
          const found = schemas.find((schema) => schema && schema.name === wanted)
          if (!found) {
            sendJson(response, 404, { ok: false, error: 'tool not found in the live registry' })
            return
          }
          sendJson(response, 200, {
            ok: true,
            name: found.name,
            description: found.description || '',
            parameters: found.parameters || {},
          })
        } catch (error) {
          sendJson(response, 500, { ok: false, error: String((error && error.message) || error) })
        }
      },
    }))

    routes.push(hostCtx.webServer.register({
      kind: 'exact',
      path: '/mcp-manager/export',
      handler: async (request, response) => {
        if (request.method !== 'GET') {
          response.writeHead(405, { allow: 'GET' })
          response.end()
          return
        }
        try {
          const patchPath = hostCtx.configEditor.documentPath || ''
          const { merged } = readAllServers(hostCtx, patchPath)
          sendJson(response, 200, {
            ok: true,
            patchPath,
            generatedAt: new Date().toISOString(),
            parked: readParked(patchPath),
            servers: merged.map((server) => ({
              id: server.id,
              mounted: server.mounted,
              inPatch: server.inPatch,
              config: server.editable,
            })),
          })
        } catch (error) {
          sendJson(response, 500, { ok: false, error: String((error && error.message) || error) })
        }
      },
    }))

    routes.push(hostCtx.webServer.register({
      kind: 'exact',
      path: '/mcp-manager/save',
      handler: async (request, response) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' })
          response.end()
          return
        }
        if (!trustedOrigin(request)) {
          sendJson(response, 403, { ok: false, error: 'untrusted origin' })
          return
        }
        try {
          const body = await readBody(request)
          const id = text(body && body.id)
          if (!id) {
            sendJson(response, 400, { ok: false, error: 'id is required' })
            return
          }
          const clean = sanitizePatch(body && body.patch)
          if (Object.keys(clean).length === 0) {
            sendJson(response, 400, { ok: false, error: 'patch carries no editable field' })
            return
          }
          const entry = (hostCtx.configEditor.entries() || []).find((row) => row && row.id === id)
          if (!entry) {
            sendJson(response, 404, { ok: false, error: `no active entry with id ${id}` })
            return
          }
          await hostCtx.configEditor.edit(entry, (current) => {
            const next = { ...asObject(current) }
            for (const key of Object.keys(clean)) next[key] = clean[key]
            return next
          })
          sendJson(response, 200, { ok: true, id, applied: Object.keys(clean), live: true })
        } catch (error) {
          sendJson(response, 500, { ok: false, error: String((error && error.message) || error) })
        }
      },
    }))

    routes.push(hostCtx.webServer.register({
      kind: 'exact',
      path: '/mcp-manager/rows',
      handler: async (request, response) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' })
          response.end()
          return
        }
        if (!trustedOrigin(request)) {
          sendJson(response, 403, { ok: false, error: 'untrusted origin' })
          return
        }
        try {
          const body = await readBody(request)
          const action = text(body && body.action)
          const patchPath = hostCtx.configEditor.documentPath || ''
          if (!patchPath) {
            sendJson(response, 500, { ok: false, error: 'profile patch path is unknown' })
            return
          }

          if (action === 'add') {
            const { error, config } = readNewServer(body && body.server)
            if (error) {
              sendJson(response, 400, { ok: false, error })
              return
            }
            const { blocks, lossless } = readDocument(patchPath)
            if (!lossless) {
              sendJson(response, 409, {
                ok: false,
                error: 'patch 文件无法被无损解析，为避免破坏注释已放弃写入',
              })
              return
            }
            const id = uniqueRowId(new Set(rowIds(blocks)), config.serverName)
            writeDocument(patchPath, appendRow(blocks, buildRowLines(id, config)))
            rowsTouchedAt = new Date().toISOString()
            sendJson(response, 200, { ok: true, action, id, patchPath, pendingRestart: true })
            return
          }

          const id = text(body && body.id)
          if (!id) {
            sendJson(response, 400, { ok: false, error: 'id is required' })
            return
          }

          const parked = readParked(patchPath)

          if (action === 'forget') {
            if (!parked[id]) {
              sendJson(response, 404, { ok: false, error: `没有找到已停用的 ${id}` })
              return
            }
            delete parked[id]
            writeParked(patchPath, parked)
            sendJson(response, 200, { ok: true, action, id, patchPath })
            return
          }

          if (action === 'enable') {
            const record = parked[id]
            if (!record || !Array.isArray(record.lines)) {
              sendJson(response, 404, { ok: false, error: `没有找到已停用的 ${id}` })
              return
            }
            const { blocks, lossless } = readDocument(patchPath)
            if (!lossless) {
              sendJson(response, 409, { ok: false, error: 'patch 文件无法被无损解析，已放弃写入' })
              return
            }
            if (rowIds(blocks).includes(id)) {
              delete parked[id]
              writeParked(patchPath, parked)
              sendJson(response, 409, { ok: false, error: `${id} 已经在 patch 里了` })
              return
            }
            writeDocument(
              patchPath,
              insertRow(blocks, record.lines, { beforeId: record.beforeId, afterId: record.afterId }),
            )
            delete parked[id]
            writeParked(patchPath, parked)
            rowsTouchedAt = new Date().toISOString()
            sendJson(response, 200, { ok: true, action, id, patchPath, pendingRestart: true })
            return
          }

          if (action === 'remove' || action === 'disable') {
            const { blocks, lossless } = readDocument(patchPath)
            if (!lossless) {
              sendJson(response, 409, { ok: false, error: 'patch 文件无法被无损解析，已放弃写入' })
              return
            }
            const { blocks: next, removed, beforeId, afterId } = removeRow(blocks, id)
            if (!removed) {
              sendJson(response, 404, {
                ok: false,
                error: `${id} 不在这份 patch 里（可能来自其它层），无法在此删除`,
              })
              return
            }
            writeDocument(patchPath, next)
            if (action === 'disable') {
              parked[id] = {
                lines: removed.split('\n'),
                savedAt: new Date().toISOString(),
                // Remember the neighbours so "启用" can put the row back where
                // it was instead of appending it to the end of the document.
                beforeId: beforeId || null,
                afterId: afterId || null,
              }
              writeParked(patchPath, parked)
            } else if (parked[id]) {
              delete parked[id]
              writeParked(patchPath, parked)
            }
            rowsTouchedAt = new Date().toISOString()
            sendJson(response, 200, { ok: true, action, id, patchPath, pendingRestart: true })
            return
          }

          sendJson(response, 400, { ok: false, error: `unknown action: ${action}` })
        } catch (error) {
          sendJson(response, 500, { ok: false, error: String((error && error.message) || error) })
        }
      },
    }))

    routes.push(hostCtx.webServer.register({
      kind: 'exact',
      path: '/mcp-manager/probe',
      handler: async (request, response) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' })
          response.end()
          return
        }
        if (!trustedOrigin(request)) {
          sendJson(response, 403, { ok: false, error: 'untrusted origin' })
          return
        }
        try {
          const body = await readBody(request)
          const id = text(body && body.id)
          const patchPath = hostCtx.configEditor.documentPath || ''
          // Same view the list uses: a row enabled a moment ago is in the
          // document but not yet reported by `configuration()`, and its id is
          // still the patch id rather than the loader entry id.
          const { merged } = readAllServers(hostCtx, patchPath)
          const server = merged.find(
            (row) => row.id === id || row.patchId === id || row.serverName === id,
          )
          if (!server) {
            sendJson(response, 404, { ok: false, error: `找不到服务器 ${id}` })
            return
          }
          const pendingNote = server.mounted === false ? '（尚未挂载，按 patch 里的配置判断） · ' : ''

          if (server.transport === 'streamable-http') {
            if (!server.url) {
              sendJson(response, 200, { ok: true, serverName: server.serverName, verdict: 'bad-config', detail: '没有配置 url', ms: 0 })
              return
            }
            const tcp = await probeTcp(server.url, PROBE_TIMEOUT_MS)
            if (!tcp.reachable) {
              sendJson(response, 200, {
                ok: true,
                serverName: server.serverName,
                verdict: 'port-closed',
                detail: pendingNote + tcp.detail,
                ms: tcp.ms,
              })
              return
            }
            const http = await probeHttp(server.url, PROBE_TIMEOUT_MS)
            sendJson(response, 200, {
              ok: true,
              serverName: server.serverName,
              verdict: http.reachable ? 'handshake-ok' : 'handshake-failed',
              detail: pendingNote + http.detail,
              status: http.status ?? null,
              contentType: http.contentType ?? null,
              tcp: tcp.detail,
              ms: tcp.ms + (http.ms || 0),
            })
            return
          }

          if (server.transport === 'stdio') {
            const stdio = probeStdio(server)
            sendJson(response, 200, {
              ok: true,
              serverName: server.serverName,
              verdict: stdio.reachable ? 'files-ok' : 'files-missing',
              detail: pendingNote + stdio.detail,
              ms: 0,
            })
            return
          }

          sendJson(response, 200, {
            ok: true,
            serverName: server.serverName,
            verdict: 'unknown',
            detail: `不支持的传输方式：${server.transport || '(空)'}`,
            ms: 0,
          })
        } catch (error) {
          sendJson(response, 500, { ok: false, error: String((error && error.message) || error) })
        }
      },
    }))

    return () => {
      for (const dispose of routes) {
        try {
          dispose()
        } catch {
          /* the carrier is already gone */
        }
      }
    }
  })
}
