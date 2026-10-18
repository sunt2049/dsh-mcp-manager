/**
 * Byte-preserving reader/writer for a profile `cordis.patch.yml`.
 *
 * The document is modelled as ordered blocks so that comments, blank lines and
 * unrelated entries are re-emitted verbatim; only the MCP rows this console
 * owns are ever rewritten. `serializePatch(parsePatch(text)) === text` is the
 * invariant the caller verifies before writing anything.
 */

const ROW_START = /^ {4}- /
const TOP_ITEM = /^- /
const INSERT_HEADER = /^- insert:\s*$/

function idOf(line) {
  const match = /^\s*-\s*id:\s*(.+?)\s*$/.exec(line)
  if (!match) return ''
  return match[1].replace(/^['"]|['"]$/g, '')
}

export function parsePatch(source) {
  const lines = String(source).replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (INSERT_HEADER.test(line)) {
      const header = line
      index += 1
      const rows = []
      while (index < lines.length) {
        if (ROW_START.test(lines[index])) {
          const start = index
          let end = start + 1
          while (end < lines.length) {
            const next = lines[end]
            if (ROW_START.test(next)) break
            if (/^\s*$/.test(next) || /^\s{4,}/.test(next)) {
              end += 1
              continue
            }
            break
          }
          let rowEnd = end
          while (rowEnd > start + 1 && /^\s*$/.test(lines[rowEnd - 1])) rowEnd -= 1
          rows.push({
            id: idOf(lines[start]),
            lines: lines.slice(start, rowEnd),
            after: lines.slice(rowEnd, end),
          })
          index = end
          continue
        }
        if (/^\s*$/.test(lines[index])) {
          index += 1
          continue
        }
        break
      }
      blocks.push({ kind: 'insert', header, rows })
      continue
    }

    if (TOP_ITEM.test(line)) {
      const start = index
      let end = start + 1
      while (end < lines.length && !TOP_ITEM.test(lines[end])) end += 1
      blocks.push({
        kind: 'entry',
        rows: [{ id: idOf(lines[start]), lines: lines.slice(start, end), after: [] }],
      })
      index = end
      continue
    }

    const start = index
    let end = start
    while (end < lines.length && !TOP_ITEM.test(lines[end])) end += 1
    blocks.push({ kind: 'text', lines: lines.slice(start, end) })
    index = end
  }

  return blocks
}

export function serializePatch(blocks) {
  const out = []
  for (const block of blocks) {
    if (block.kind === 'text') {
      out.push(...block.lines)
      continue
    }
    if (block.kind === 'insert') {
      if (Array.isArray(block.before)) out.push(...block.before)
      out.push(block.header)
      for (const row of block.rows) out.push(...row.lines, ...row.after)
      continue
    }
    out.push(...block.rows[0].lines)
  }
  return out.join('\n')
}

/** Remove one row; an insert group left with no rows is dropped with it.
 *  The neighbouring row ids come back with it so a later re-insert can land
 *  where the row used to be instead of at the end of the document. */
export function removeRow(blocks, id) {
  const order = []
  for (const [blockIndex, block] of blocks.entries()) {
    if (block.kind === 'text') continue
    for (const [rowIndex, row] of block.rows.entries()) order.push({ id: row.id, blockIndex, rowIndex })
  }
  const at = order.findIndex((entry) => entry.id === id)
  if (at === -1) return { blocks, removed: null, beforeId: null, afterId: null }

  const beforeId = at > 0 ? order[at - 1].id : null
  const afterId = at < order.length - 1 ? order[at + 1].id : null

  const kept = []
  let removed = null

  for (const block of blocks) {
    if (block.kind === 'text') {
      kept.push(block)
      continue
    }
    if (block.kind === 'entry') {
      if (block.rows[0].id === id) {
        removed = block.rows[0].lines.join('\n')
        continue
      }
      kept.push(block)
      continue
    }
    const hit = block.rows.find((row) => row.id === id)
    if (!hit) {
      kept.push(block)
      continue
    }
    removed = hit.lines.join('\n')
    const rows = block.rows.filter((row) => row.id !== id)
    if (rows.length > 0) kept.push({ ...block, rows })
  }

  return { blocks: kept, removed, beforeId, afterId }
}

/**
 * Put a row back next to a remembered neighbour. Falls back to appending when
 * both anchors are gone, so a stale record can never be lost.
 *
 * The row keeps the shape it was stored in: a bare `- id:` line goes back as a
 * bare entry, an indented one goes back inside an insert group. Splicing an
 * indented line into a top-level entry (or the other way round) would produce
 * invalid YAML, so the anchor's kind never decides the row's kind.
 */
export function insertRow(blocks, lines, anchors = {}) {
  const row = { id: idOf(lines[0]), lines, after: [] }
  const bare = /^- /.test(lines[0])
  const makeBlock = () =>
    bare
      ? { kind: 'entry', rows: [row] }
      : { kind: 'insert', before: [], header: '- insert:', rows: [row] }

  const locate = (wanted) => {
    if (!wanted) return null
    for (const [blockIndex, block] of blocks.entries()) {
      if (block.kind === 'text') continue
      const rowIndex = block.rows.findIndex((item) => item.id === wanted)
      if (rowIndex !== -1) return { blockIndex, block, rowIndex }
    }
    return null
  }

  // `beforeId` is the predecessor, so the row goes right after it; `afterId` is
  // the successor, so the row goes right before it.
  const previous = locate(anchors.beforeId)
  if (previous) {
    const out = [...blocks]
    if (previous.block.kind === 'insert' && !bare) {
      const rows = [...previous.block.rows]
      rows.splice(previous.rowIndex + 1, 0, row)
      out[previous.blockIndex] = { ...previous.block, rows }
      return out
    }
    out.splice(previous.blockIndex + 1, 0, makeBlock())
    return out
  }

  const next = locate(anchors.afterId)
  if (next) {
    const out = [...blocks]
    if (next.block.kind === 'insert' && !bare) {
      const rows = [...next.block.rows]
      rows.splice(next.rowIndex, 0, row)
      out[next.blockIndex] = { ...next.block, rows }
      return out
    }
    out.splice(next.blockIndex, 0, makeBlock())
    return out
  }

  return appendRow(blocks, lines)
}

/** Append a row as its own insert group at the end of the document. */
export function appendRow(blocks, lines) {
  const next = [...blocks]
  const tail = serializePatch(next)
  const before = tail.endsWith('\n') || tail === '' ? [] : ['']
  next.push({
    kind: 'insert',
    before,
    header: '- insert:',
    rows: [{ id: idOf(lines[0]), lines, after: [] }],
  })
  return next
}

export function rowIds(blocks) {
  const ids = []
  for (const block of blocks) {
    if (block.kind === 'text') continue
    for (const row of block.rows) if (row.id) ids.push(row.id)
  }
  return ids
}

function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

/** Build the YAML lines of one MCP client row, at insert-group indentation. */
export function buildRowLines(id, config) {
  const lines = [`    - id: ${id}`, "      name: '@deepseek-ai/dsh-mcp-client'", '      config:']
  const field = (key, value) => lines.push(`        ${key}: ${value}`)

  field('serverName', quote(config.serverName))
  field('transport', quote(config.transport))

  if (config.transport === 'streamable-http') {
    field('url', quote(config.url))
  } else {
    field('command', quote(config.command))
    const args = Array.isArray(config.args) ? config.args : []
    if (args.length > 0) {
      lines.push('        args:')
      for (const arg of args) lines.push(`          - ${quote(arg)}`)
    }
    const env = config.env && typeof config.env === 'object' ? config.env : {}
    const keys = Object.keys(env)
    if (keys.length > 0) {
      lines.push('        env:')
      for (const key of keys) lines.push(`          ${key}: ${quote(env[key])}`)
    }
  }

  if (typeof config.toolCallTimeoutMs === 'number' && config.toolCallTimeoutMs > 0) {
    field('toolCallTimeoutMs', String(config.toolCallTimeoutMs))
  }
  if (config.failOnStartupError === true) field('failOnStartupError', 'true')

  return lines
}

/** Read the shape of a row out of its YAML lines. */
export function describeRow(lines) {
  const text = Array.isArray(lines) ? lines.join('\n') : String(lines || '')
  const pick = (key) => {
    const match = new RegExp(`^\\s+${key}:\\s*(.+?)\\s*$`, 'm').exec(text)
    return match ? match[1].replace(/^['"]|['"]$/g, '') : ''
  }
  return {
    name: pick('name'),
    serverName: pick('serverName'),
    transport: pick('transport'),
    url: pick('url'),
    command: pick('command'),
  }
}
