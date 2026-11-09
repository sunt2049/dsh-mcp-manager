window.__ModuleLoader__.load({
  id: '@sunt2049/dsh-mcp-manager',
  factory(require) {
    const React = require('react')
    const { useState, useEffect, useMemo, useCallback } = React
    const h = React.createElement

    const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'

    const C = {
      surface: 'var(--dsw-alias-bg-layer-1)',
      nested: 'var(--dsw-alias-bg-layer-2)',
      border: 'var(--dsw-alias-border-l1)',
      borderStrong: 'var(--dsw-alias-border-l2)',
      text: 'var(--dsw-alias-label-primary)',
      dim: 'var(--dsw-alias-label-secondary)',
      brand: 'var(--dsw-alias-brand-primary)',
      ok: 'var(--dsw-alias-state-success-primary)',
      warn: 'var(--dsw-alias-state-warn-primary)',
      err: 'var(--dsw-alias-state-error-primary)',
      idle: 'var(--dsw-alias-state-idle-primary)',
    }

    async function getJson(path) {
      try {
        const response = await fetch(path, { headers: { accept: 'application/json' } })
        return await response.json()
      } catch (error) {
        return { ok: false, error: String((error && error.message) || error) }
      }
    }

    async function postJson(path, body) {
      try {
        const response = await fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        return await response.json()
      } catch (error) {
        return { ok: false, error: String((error && error.message) || error) }
      }
    }

    function copyText(value) {
      try {
        navigator.clipboard.writeText(String(value))
        return true
      } catch {
        return false
      }
    }

    function endpointOf(server) {
      if (server.transport === 'streamable-http') return server.url || '(未配置 url)'
      if (server.transport === 'stdio') {
        const args = server.args && server.args.length ? ' ' + server.args.join(' ') : ''
        return (server.command || '(未配置 command)') + args
      }
      return server.transport || '(未知传输)'
    }

    function statusOf(server) {
      if (server.mounted === false) return { color: C.warn, label: '尚未挂载' }
      if (!server.transport) return { color: C.err, label: '配置不完整' }
      if (!server.tools.length) return { color: C.warn, label: '无工具' }
      return { color: C.ok, label: '已注册' }
    }

    function parseEnv(text) {
      const env = {}
      for (const raw of String(text || '').split('\n')) {
        const line = raw.trim()
        if (!line || line.startsWith('#')) continue
        const cut = line.indexOf('=')
        if (cut <= 0) continue
        env[line.slice(0, cut).trim()] = line.slice(cut + 1)
      }
      return env
    }

    /** `Name: Value` per line; the first colon separates, so values may contain colons. */
    function parseHeaders(text) {
      const headers = {}
      for (const raw of String(text || '').split('\n')) {
        const line = raw.trim()
        if (!line || line.startsWith('#')) continue
        const cut = line.indexOf(':')
        if (cut <= 0) continue
        const name = line.slice(0, cut).trim()
        const value = line.slice(cut + 1).trim()
        if (name && value) headers[name] = value
      }
      return headers
    }

    function verdictLabel(verdict) {
      switch (verdict) {
        case 'port-closed':
          return '端口不通'
        case 'handshake-failed':
          return '端口通，握手失败'
        case 'handshake-ok':
          return '握手成功'
        case 'files-missing':
          return '启动文件缺失'
        case 'files-ok':
          return '启动文件齐全'
        case 'bad-config':
          return '配置不完整'
        default:
          return '无法判断'
      }
    }

    const S = {
      root: { display: 'flex', flexDirection: 'column', gap: '14px', color: C.text, fontSize: '13px' },
      head: { display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' },
      title: { margin: 0, fontSize: '16px', fontWeight: 650, letterSpacing: '.2px' },
      sub: { margin: '3px 0 0', color: C.dim, fontSize: '12px' },
      spacer: { flex: 1 },
      btn: {
        appearance: 'none',
        border: `1px solid ${C.border}`,
        background: C.surface,
        color: C.text,
        borderRadius: '8px',
        padding: '5px 11px',
        fontSize: '12px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        lineHeight: 1.5,
      },
      danger: { borderColor: C.err, color: C.err },
      input: {
        width: '100%',
        boxSizing: 'border-box',
        border: `1px solid ${C.border}`,
        background: C.nested,
        color: C.text,
        borderRadius: '8px',
        padding: '7px 10px',
        fontSize: '12px',
        fontFamily: 'inherit',
        outline: 'none',
      },
      card: { border: `1px solid ${C.border}`, background: C.surface, borderRadius: '12px', overflow: 'hidden' },
      cardHead: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        width: '100%',
        textAlign: 'left',
        padding: '11px 13px',
        background: 'transparent',
        border: 0,
        color: C.text,
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: '13px',
      },
      dot: { width: '8px', height: '8px', borderRadius: '50%', flex: '0 0 auto' },
      name: { fontWeight: 620, flex: '0 0 auto' },
      chip: {
        border: `1px solid ${C.border}`,
        color: C.dim,
        borderRadius: '999px',
        padding: '1px 8px',
        fontSize: '11px',
        flex: '0 0 auto',
        fontFamily: MONO,
      },
      endpoint: {
        fontFamily: MONO,
        fontSize: '11.5px',
        color: C.dim,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        flex: '1 1 auto',
        minWidth: 0,
      },
      count: { color: C.dim, fontSize: '11.5px', flex: '0 0 auto' },
      body: { borderTop: `1px solid ${C.border}`, padding: '6px 8px 8px' },
      meta: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px 14px',
        padding: '2px 7px 8px',
        color: C.dim,
        fontSize: '11.5px',
      },
      tool: {
        display: 'flex',
        gap: '10px',
        alignItems: 'baseline',
        width: '100%',
        textAlign: 'left',
        border: 0,
        background: 'transparent',
        color: C.text,
        padding: '7px 8px',
        borderRadius: '7px',
        cursor: 'pointer',
        fontFamily: 'inherit',
      },
      toolName: { fontFamily: MONO, fontSize: '12px', color: C.brand, flex: '0 0 auto' },
      toolDesc: {
        color: C.dim,
        fontSize: '11.5px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        flex: '1 1 auto',
        minWidth: 0,
      },
      pre: {
        margin: '2px 8px 8px',
        padding: '10px 12px',
        borderRadius: '8px',
        border: `1px solid ${C.border}`,
        background: C.nested,
        color: C.text,
        fontFamily: MONO,
        fontSize: '11.5px',
        lineHeight: 1.55,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        maxHeight: '340px',
        overflow: 'auto',
      },
      notice: {
        border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${C.warn}`,
        background: C.nested,
        borderRadius: '8px',
        padding: '8px 11px',
        fontSize: '12px',
        color: C.dim,
      },
      error: { borderLeftColor: C.err, color: C.err },
      form: {
        display: 'grid',
        gap: '9px',
        padding: '12px',
        borderTop: `1px solid ${C.border}`,
        background: C.nested,
      },
      field: { display: 'grid', gap: '4px' },
      label: { fontSize: '11.5px', color: C.dim },
      row: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
      empty: { color: C.dim, fontSize: '12px', padding: '10px 12px' },
    }

    function Chip(props) {
      return h('span', { style: S.chip }, props.children)
    }

    function Notice(props) {
      return h('div', { style: props.error ? { ...S.notice, ...S.error } : S.notice }, props.children)
    }

    function SchemaBlock(props) {
      const entry = props.entry
      if (!entry) return null
      if (entry.state === 'loading') return h('div', { style: S.empty }, '正在读取 schema…')
      if (entry.state === 'error') return h(Notice, { error: true }, entry.error)

      const json = JSON.stringify(entry.parameters, null, 2)
      return h(
        'div',
        { style: { display: 'grid', gap: '6px' } },
        h(
          'div',
          { style: { ...S.row, padding: '0 8px' } },
          h('span', { style: { color: C.dim, fontSize: '11.5px' } }, 'JSON Schema · parameters'),
          h('span', { style: S.spacer }),
          h(
            'button',
            { style: { ...S.btn, padding: '2px 9px', fontSize: '11.5px' }, onClick: () => copyText(json) },
            '复制',
          ),
        ),
        h('pre', { style: S.pre }, json),
      )
    }

    function field(label, control) {
      return h('div', { style: S.field }, h('span', { style: S.label }, label), control)
    }

    const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/

    function EditForm(props) {
      const server = props.server
      const isHttp = server.transport === 'streamable-http'
      const [url, setUrl] = useState(server.url || '')
      const [command, setCommand] = useState(server.command || '')
      const [argsText, setArgsText] = useState((server.args || []).join('\n'))
      const [timeout, setTimeoutMs] = useState(
        server.toolCallTimeoutMs === null ? '' : String(server.toolCallTimeoutMs),
      )
      const [failFast, setFailFast] = useState(server.failOnStartupError === true)
      const [headerRows, setHeaderRows] = useState([{ name: '', value: '' }])
      const [dropped, setDropped] = useState([])
      const [busy, setBusy] = useState(false)
      const [failure, setFailure] = useState(null)

      const save = useCallback(async () => {
        const patch = { failOnStartupError: failFast }
        if (timeout.trim() !== '') {
          const value = Number(timeout)
          if (!Number.isFinite(value) || value <= 0) {
            setFailure('超时必须是正数毫秒')
            return
          }
          patch.toolCallTimeoutMs = value
        }
        if (isHttp) {
          if (!url.trim()) {
            setFailure('url 不能为空')
            return
          }
          patch.url = url.trim()

          const headers = {}
          for (const name of dropped) headers[name] = ''
          for (const row of headerRows) {
            const name = row.name.trim()
            if (!name) continue
            if (!HEADER_NAME.test(name)) {
              setFailure(`请求头名不合法：${name}`)
              return
            }
            headers[name] = row.value
          }
          if (Object.keys(headers).length > 0) patch.headers = headers
        } else {
          if (!command.trim()) {
            setFailure('command 不能为空')
            return
          }
          patch.command = command.trim()
          patch.args = argsText
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
        }
        setBusy(true)
        setFailure(null)
        const result = await postJson('/mcp-manager/save', { id: server.id, patch })
        setBusy(false)
        if (!result || !result.ok) {
          setFailure((result && result.error) || '保存失败')
          return
        }
        props.onSaved()
      }, [argsText, command, dropped, failFast, headerRows, isHttp, props, timeout, url])

      return h(
        'div',
        { style: S.form },
        isHttp
          ? field(
              'url（streamable-http）',
              h('input', { style: S.input, value: url, onChange: (e) => setUrl(e.target.value), spellCheck: false }),
            )
          : h(
              React.Fragment,
              null,
              field(
                'command（stdio）',
                h('input', {
                  style: S.input,
                  value: command,
                  onChange: (e) => setCommand(e.target.value),
                  spellCheck: false,
                }),
              ),
              field(
                'args（每行一个）',
                h('textarea', {
                  style: { ...S.input, minHeight: '62px', resize: 'vertical' },
                  value: argsText,
                  onChange: (e) => setArgsText(e.target.value),
                  spellCheck: false,
                }),
              ),
            ),
        isHttp
          ? field(
              '请求头（可选，同名覆盖；清空值不影响已有值）',
              h(
                'div',
                null,
                (server.headerKeys || []).length > 0
                  ? h(
                      'div',
                      { style: { ...S.row, gap: '5px', flexWrap: 'wrap', marginBottom: '6px' } },
                      (server.headerKeys || []).map((name) =>
                        dropped.includes(name)
                          ? h(
                              'button',
                              {
                                key: name,
                                style: { ...S.btn, padding: '1px 7px', fontSize: '11.5px', textDecoration: 'line-through', opacity: 0.55 },
                                title: '撤销删除',
                                onClick: () => setDropped((prev) => prev.filter((item) => item !== name)),
                              },
                              name,
                            )
                          : h(
                              'button',
                              {
                                key: name,
                                style: { ...S.btn, padding: '1px 7px', fontSize: '11.5px' },
                                title: '点击标记删除',
                                onClick: () => setDropped((prev) => [...prev, name]),
                              },
                              name,
                              h('span', { style: { color: C.dim, marginLeft: '4px' } }, '×'),
                            ),
                      ),
                    )
                  : null,
                headerRows.map((row, index) =>
                  h(
                    'div',
                    { key: 'h' + index, style: { ...S.row, gap: '5px', marginBottom: '4px' } },
                    h('input', {
                      style: { ...S.input, flex: '0 0 38%' },
                      placeholder: 'Header 名',
                      value: row.name,
                      spellCheck: false,
                      onChange: (event) =>
                        setHeaderRows((prev) =>
                          prev.map((item, at) => (at === index ? { ...item, name: event.target.value } : item)),
                        ),
                    }),
                    h('input', {
                      style: { ...S.input, flex: '1 1 auto' },
                      placeholder: '值',
                      value: row.value,
                      spellCheck: false,
                      onChange: (event) =>
                        setHeaderRows((prev) =>
                          prev.map((item, at) => (at === index ? { ...item, value: event.target.value } : item)),
                        ),
                    }),
                    h(
                      'button',
                      {
                        style: S.btn,
                        onClick: () => setHeaderRows((prev) => prev.filter((_, at) => at !== index)),
                        title: '移除此行',
                      },
                      '×',
                    ),
                  ),
                ),
                h(
                  'button',
                  {
                    style: { ...S.btn, marginTop: '2px' },
                    onClick: () => setHeaderRows((prev) => [...prev, { name: '', value: '' }]),
                  },
                  '+ 添加请求头',
                ),
              ),
            )
          : null,
        field(
          'toolCallTimeoutMs（留空表示用默认 60000）',
          h('input', {
            style: S.input,
            value: timeout,
            onChange: (e) => setTimeoutMs(e.target.value),
            inputMode: 'numeric',
            spellCheck: false,
          }),
        ),
        h(
          'label',
          { style: { ...S.row, gap: '7px', fontSize: '12px', color: C.dim, cursor: 'pointer' } },
          h('input', { type: 'checkbox', checked: failFast, onChange: (e) => setFailFast(e.target.checked) }),
          '连接失败时拒绝激活（failOnStartupError）',
        ),
        server.envKeys.length
          ? h(Notice, null, 'env 的值不在页面回显，以免泄露密钥；要改 env 请直接改 patch。')
          : null,
        failure ? h(Notice, { error: true }, failure) : null,
        h(
          'div',
          { style: S.row },
          h(
            'button',
            { style: { ...S.btn, borderColor: C.brand, color: C.brand }, onClick: save, disabled: busy },
            busy ? '保存中…' : '保存（热应用）',
          ),
          h('button', { style: S.btn, onClick: props.onCancel, disabled: busy }, '取消'),
        ),
      )
    }

    function AddForm(props) {
      const [serverName, setServerName] = useState('')
      const [transport, setTransport] = useState('streamable-http')
      const [url, setUrl] = useState('')
      const [command, setCommand] = useState('')
      const [argsText, setArgsText] = useState('')
      const [envText, setEnvText] = useState('')
      const [headersText, setHeadersText] = useState('')
      const [timeout, setTimeoutMs] = useState('')
      const [busy, setBusy] = useState(false)
      const [failure, setFailure] = useState(null)

      const submit = useCallback(async () => {
        const server = { serverName: serverName.trim(), transport }
        if (transport === 'streamable-http') {
          server.url = url.trim()
          const headers = parseHeaders(headersText)
          if (Object.keys(headers).length > 0) server.headers = headers
        } else {
          server.command = command.trim()
          server.args = argsText.split('\n').map((line) => line.trim()).filter(Boolean)
          const env = parseEnv(envText)
          if (Object.keys(env).length > 0) server.env = env
        }
        if (timeout.trim() !== '') server.toolCallTimeoutMs = Number(timeout)
        setBusy(true)
        setFailure(null)
        const result = await postJson('/mcp-manager/rows', { action: 'add', server })
        setBusy(false)
        if (!result || !result.ok) {
          setFailure((result && result.error) || '添加失败')
          return
        }
        props.onDone()
      }, [argsText, command, envText, headersText, props, serverName, timeout, transport, url])

      const isHttp = transport === 'streamable-http'
      return h(
        'div',
        { style: { ...S.card, marginTop: '2px' } },
        h('div', { style: { ...S.cardHead, cursor: 'default', fontWeight: 620 } }, '添加 MCP 服务器'),
        h(
          'div',
          { style: S.form },
          field(
            'serverName（工具将命名为 mcp__<serverName>__*）',
            h('input', { style: S.input, value: serverName, onChange: (e) => setServerName(e.target.value), spellCheck: false }),
          ),
          field(
            'transport',
            h(
              'select',
              {
                style: S.input,
                value: transport,
                onChange: (e) => setTransport(e.target.value),
              },
              h('option', { value: 'streamable-http' }, 'streamable-http'),
              h('option', { value: 'stdio' }, 'stdio'),
            ),
          ),
          isHttp
            ? h(
                React.Fragment,
                null,
                field('url', h('input', { style: S.input, value: url, onChange: (e) => setUrl(e.target.value), spellCheck: false })),
                field(
                  'headers（每行 Name: Value，可留空）',
                  h('textarea', {
                    style: { ...S.input, minHeight: '58px', resize: 'vertical' },
                    value: headersText,
                    onChange: (e) => setHeadersText(e.target.value),
                    spellCheck: false,
                    placeholder: 'Authorization: Bearer xxx',
                  }),
                ),
              )
            : h(
                React.Fragment,
                null,
                field(
                  'command',
                  h('input', { style: S.input, value: command, onChange: (e) => setCommand(e.target.value), spellCheck: false }),
                ),
                field(
                  'args（每行一个）',
                  h('textarea', {
                    style: { ...S.input, minHeight: '58px', resize: 'vertical' },
                    value: argsText,
                    onChange: (e) => setArgsText(e.target.value),
                    spellCheck: false,
                  }),
                ),
                field(
                  'env（每行 KEY=VALUE，可留空）',
                  h('textarea', {
                    style: { ...S.input, minHeight: '58px', resize: 'vertical' },
                    value: envText,
                    onChange: (e) => setEnvText(e.target.value),
                    spellCheck: false,
                  }),
                ),
              ),
          field(
            'toolCallTimeoutMs（可留空）',
            h('input', {
              style: S.input,
              value: timeout,
              onChange: (e) => setTimeoutMs(e.target.value),
              inputMode: 'numeric',
              spellCheck: false,
            }),
          ),
          failure ? h(Notice, { error: true }, failure) : null,
          h(
            'div',
            { style: S.row },
            h(
              'button',
              { style: { ...S.btn, borderColor: C.brand, color: C.brand }, onClick: submit, disabled: busy },
              busy ? '写入中…' : '写入 patch',
            ),
            h('button', { style: S.btn, onClick: props.onCancel, disabled: busy }, '取消'),
          ),
          h(Notice, null, '新行会追加到 profile patch 末尾，保存后通常几秒内自动挂载。'),
        ),
      )
    }

    const PAGE_SIZES = [5, 10, 20, 50, 100]
    const AUTO_REFRESH_MS = 4000

    /** `1 … 4 5 6 … 20` — a window around the current page plus both ends. */
    function pageItems(current, total) {
      const items = [1]
      const start = Math.max(2, current - 1)
      const end = Math.min(total - 1, current + 1)
      if (start > 2) items.push('…')
      for (let page = start; page <= end; page += 1) items.push(page)
      if (end < total - 1) items.push('…')
      if (total > 1) items.push(total)
      return items
    }

    function pageButton(label, enabled, onClick) {
      return h(
        'button',
        {
          style: { ...S.btn, padding: '2px 8px', fontSize: '12px', opacity: enabled ? 1 : 0.45 },
          disabled: !enabled,
          onClick,
        },
        label,
      )
    }

    function ServerCard(props) {
      const server = props.server
      const open = props.open
      const status = statusOf(server)
      const removable = server.inPatch
      const [page, setPage] = useState(1)
      const [pageSize, setPageSize] = useState(PAGE_SIZES[0])
      const [toolQuery, setToolQuery] = useState('')

      const tools = useMemo(() => {
        const needle = toolQuery.trim().toLowerCase()
        if (!needle) return server.tools
        return server.tools.filter(
          (tool) =>
            tool.wire.toLowerCase().includes(needle) || tool.description.toLowerCase().includes(needle),
        )
      }, [server.tools, toolQuery])

      const totalPages = Math.max(1, Math.ceil(tools.length / pageSize))
      const current = Math.min(page, totalPages)
      const from = (current - 1) * pageSize
      const visible = tools.slice(from, from + pageSize)

      return h(
        'div',
        { style: S.card },
        h(
          'button',
          { style: S.cardHead, onClick: props.onToggle, 'aria-expanded': open },
          h('span', { style: { ...S.dot, background: status.color }, title: status.label }),
          h('span', { style: S.name }, server.serverName || server.id),
          h(Chip, null, server.transport || '—'),
          h('span', { style: S.endpoint, title: endpointOf(server) }, endpointOf(server)),
          h('span', { style: S.count }, server.tools.length + ' 工具'),
          h('span', { style: { color: C.dim, fontSize: '11px' } }, open ? '收起' : '展开'),
        ),
        open
          ? h(
              'div',
              { style: S.body },
              h(
                'div',
                { style: S.meta },
                h('span', null, 'id: ' + server.id),
                server.mounted === false ? h('span', null, '（已写入，等待挂载…）') : null,
                server.cwd ? h('span', null, 'cwd: ' + server.cwd) : null,
                server.toolCallTimeoutMs === null
                  ? null
                  : h('span', null, '超时: ' + server.toolCallTimeoutMs + 'ms'),
                server.envKeys.length ? h('span', null, 'env: ' + server.envKeys.join(', ')) : null,
                server.headerKeys.length ? h('span', null, 'headers: ' + server.headerKeys.join(', ')) : null,
                server.failOnStartupError ? h('span', null, 'failOnStartupError') : null,
                server.inPatch ? null : h('span', null, '（不在本 profile 的 patch 里）'),
              ),
              server.tools.length === 0
                ? h(
                    'div',
                    { style: S.empty },
                    h(
                      'div',
                      null,
                      '这个服务器没有向工具注册表贡献任何 mcp__ 工具：可能没连上、握手失败，或它本身不提供 tools。',
                    ),
                    props.probe && props.probe.state === 'running'
                      ? h('div', { style: { marginTop: '6px' } }, '正在探测…')
                      : props.probe && props.probe.state === 'error'
                        ? h('div', { style: { marginTop: '6px', color: C.err } }, props.probe.detail)
                        : props.probe && props.probe.state === 'done'
                          ? h(
                              'div',
                              {
                                style: {
                                  marginTop: '6px',
                                  color:
                                    props.probe.verdict === 'handshake-ok' || props.probe.verdict === 'files-ok'
                                      ? C.ok
                                      : props.probe.verdict === 'handshake-failed'
                                        ? C.warn
                                        : C.err,
                                },
                              },
                              verdictLabel(props.probe.verdict) + ' · ' + props.probe.detail,
                            )
                          : null,
                  )
                : [
                    server.tools.length > 12
                      ? h('input', {
                          key: 'tool-filter',
                          style: { ...S.input, margin: '2px 8px 6px' },
                          placeholder: '在本服务器的 ' + server.tools.length + ' 个工具里筛选…',
                          value: toolQuery,
                          onChange: (event) => {
                            setToolQuery(event.target.value)
                            setPage(1)
                          },
                          spellCheck: false,
                        })
                      : null,
                    tools.length === 0
                      ? h('div', { key: 'no-match', style: S.empty }, '没有匹配的工具。')
                      : visible.map((tool) =>
                          h(
                            'div',
                            { key: tool.name },
                            h(
                              'button',
                              { style: S.tool, onClick: () => props.onToggleTool(tool.name) },
                              h('span', { style: S.toolName }, tool.wire),
                              h(
                                'span',
                                { style: S.toolDesc, title: tool.description },
                                tool.description || '（无描述）',
                              ),
                              h(
                                'span',
                                { style: { color: C.dim, fontSize: '11px' } },
                                props.openTool === tool.name ? '收回' : '参数',
                              ),
                            ),
                            props.openTool === tool.name
                              ? h(SchemaBlock, { entry: props.schemas[tool.name] })
                              : null,
                          ),
                        ),
                    tools.length > 0
                      ? h(
                          'div',
                          {
                            key: 'pager',
                            style: {
                              ...S.row,
                              gap: '4px',
                              padding: '8px 8px 2px',
                              borderTop: `1px solid ${C.border}`,
                              marginTop: '6px',
                            },
                          },
                          h(
                            'span',
                            { style: { color: C.dim, fontSize: '11.5px' } },
                            '共 ' + tools.length + ' 个',
                          ),
                          h('span', { style: S.spacer }),
                          totalPages > 1
                            ? h(
                                React.Fragment,
                                null,
                                pageButton('首页', current > 1, () => setPage(1), S),
                                pageButton('上一页', current > 1, () => setPage(current - 1), S),
                                pageItems(current, totalPages).map((item, index) =>
                                  item === '…'
                                    ? h(
                                        'span',
                                        {
                                          key: 'gap' + index,
                                          style: { color: C.dim, padding: '0 3px', fontSize: '12px' },
                                        },
                                        '…',
                                      )
                                    : h(
                                        'button',
                                        {
                                          key: 'p' + item,
                                          style: {
                                            ...S.btn,
                                            padding: '2px 8px',
                                            minWidth: '26px',
                                            fontSize: '12px',
                                            ...(item === current
                                              ? {
                                                  borderColor: C.brand,
                                                  color: C.brand,
                                                  fontWeight: 700,
                                                  textDecoration: 'underline',
                                                }
                                              : {}),
                                          },
                                          onClick: () => setPage(item),
                                        },
                                        String(item),
                                      ),
                                ),
                                pageButton('下一页', current < totalPages, () => setPage(current + 1), S),
                                pageButton('尾页', current < totalPages, () => setPage(totalPages), S),
                              )
                            : null,
                          h(
                            'span',
                            { style: { color: C.dim, fontSize: '11.5px', marginLeft: '6px' } },
                            '每页',
                          ),
                          h(
                            'select',
                            {
                              style: { ...S.btn, padding: '1px 4px', fontSize: '11.5px' },
                              value: String(pageSize),
                              onChange: (event) => {
                                setPageSize(Number(event.target.value))
                                setPage(1)
                              },
                            },
                            PAGE_SIZES.map((size) => h('option', { key: size, value: String(size) }, String(size))),
                          ),
                          h('span', { style: { color: C.dim, fontSize: '11.5px' } }, '个'),
                        )
                      : null,
                  ],
              h(
                'div',
                { style: { ...S.row, padding: '8px 6px 2px' } },
                h(
                  'button',
                  {
                    style: S.btn,
                    onClick: props.onEdit,
                    disabled: server.mounted === false,
                    title:
                      server.mounted === false
                        ? '这一行还没挂载，configEditor 改不到它；等它挂上（通常几秒）再编辑'
                        : '通过 configEditor 修改，即时生效',
                  },
                  props.editing ? '正在编辑' : '编辑配置',
                ),
                h('button', { style: S.btn, onClick: () => copyText(endpointOf(server)) }, '复制端点'),
                h(
                  'button',
                  {
                    style: S.btn,
                    onClick: props.onProbe,
                    disabled: props.probe && props.probe.state === 'running',
                  },
                  props.probe && props.probe.state === 'running' ? '探测中…' : '探测连通性',
                ),
                h('span', { style: S.spacer }),
                h(
                  'button',
                  {
                    style: S.btn,
                    onClick: props.onDisable,
                    disabled: !removable || props.busy,
                    title: removable ? '从 patch 里摘掉并暂存，可随时恢复' : '这一行不在本 profile 的 patch 文件里',
                  },
                  '停用',
                ),
                props.confirm
                  ? h(
                      React.Fragment,
                      null,
                      h(
                        'button',
                        { style: { ...S.btn, ...S.danger }, onClick: props.onDelete, disabled: props.busy },
                        props.busy ? '删除中…' : '确认删除',
                      ),
                      h('button', { style: S.btn, onClick: props.onCancelDelete, disabled: props.busy }, '取消'),
                    )
                  : h(
                      'button',
                      {
                        style: S.btn,
                        onClick: props.onAskDelete,
                        disabled: !removable || props.busy,
                        title: removable ? '从 patch 里永久删除这一行' : '这一行不在本 profile 的 patch 文件里',
                      },
                      '删除',
                    ),
              ),
            )
          : null,
        props.editing ? h(EditForm, { server, onCancel: props.onCancelEdit, onSaved: props.onSaved }) : null,
      )
    }

    function ConsoleSection() {
      const [data, setData] = useState(null)
      const [failure, setFailure] = useState(null)
      const [loading, setLoading] = useState(true)
      const [query, setQuery] = useState('')
      const [openIds, setOpenIds] = useState({})
      const [openTool, setOpenTool] = useState(null)
      const [schemas, setSchemas] = useState({})
      const [editingId, setEditingId] = useState(null)
      const [adding, setAdding] = useState(false)
      const [confirmId, setConfirmId] = useState(null)
      const [busyId, setBusyId] = useState(null)
      const [probes, setProbes] = useState({})
      const [auto, setAuto] = useState(true)
      const [syncedAt, setSyncedAt] = useState(null)
      const inflight = React.useRef(false)

      const refresh = useCallback(async (silent) => {
        if (inflight.current) return
        inflight.current = true
        if (!silent) setLoading(true)
        const result = await getJson('/mcp-manager/overview')
        inflight.current = false
        if (!silent) setLoading(false)
        if (!result || !result.ok) {
          // A background tick must not wipe a working panel over one bad read.
          if (!silent) setFailure((result && result.error) || '读取失败')
          return
        }
        setFailure(null)
        setData(result)
        setSyncedAt(new Date())
      }, [])

      useEffect(() => {
        refresh(false)
      }, [refresh])

      // The Loader applies patch edits through HMR within a few seconds, so the
      // panel re-reads on its own instead of making the user hunt for 刷新.
      useEffect(() => {
        if (!auto) return undefined
        const timer = setInterval(() => {
          if (document.hidden) return
          refresh(true)
        }, AUTO_REFRESH_MS)
        return () => clearInterval(timer)
      }, [auto, refresh])

      const runProbe = useCallback(async (server) => {
        setProbes((prev) => ({ ...prev, [server.id]: { state: 'running' } }))
        const result = await postJson('/mcp-manager/probe', { id: server.id })
        if (!result || !result.ok) {
          setProbes((prev) => ({
            ...prev,
            [server.id]: { state: 'error', detail: (result && result.error) || '探测失败' },
          }))
          return
        }
        setProbes((prev) => ({
          ...prev,
          [server.id]: { state: 'done', verdict: result.verdict, detail: result.detail },
        }))
      }, [])

      const loadSchema = useCallback(async (name) => {
        setSchemas((prev) =>
          prev[name] && prev[name].state === 'ok' ? prev : { ...prev, [name]: { state: 'loading' } },
        )
        const result = await getJson('/mcp-manager/schema?tool=' + encodeURIComponent(name))
        if (!result || !result.ok) {
          setSchemas((prev) => ({
            ...prev,
            [name]: { state: 'error', error: (result && result.error) || '读取 schema 失败' },
          }))
          return
        }
        setSchemas((prev) => ({
          ...prev,
          [name]: { state: 'ok', parameters: result.parameters, description: result.description },
        }))
      }, [])

      const toggleTool = useCallback(
        (name) => {
          setOpenTool((current) => {
            if (current === name) return null
            loadSchema(name)
            return name
          })
        },
        [loadSchema],
      )

      const toggleServer = useCallback(
        (server) => {
          const willOpen = openIds[server.id] !== true
          setOpenIds((prev) => ({ ...prev, [server.id]: willOpen }))
          // A server with no tools is exactly the case where the user wants a
          // verdict instead of a guess, so ask once on expand.
          if (willOpen && server.tools.length === 0 && !probes[server.id]) runProbe(server)
        },
        [openIds, probes, runProbe],
      )

      const exportJson = useCallback(async () => {
        const result = await getJson('/mcp-manager/export')
        if (!result || !result.ok) {
          setFailure((result && result.error) || '导出失败')
          return
        }
        copyText(JSON.stringify(result, null, 2))
      }, [])

      const act = useCallback(
        async (action, payload) => {
          const key = payload && payload.id ? payload.id : 'add'
          setBusyId(key)
          setFailure(null)
          const result = await postJson('/mcp-manager/rows', { action, ...payload })
          setBusyId(null)
          if (!result || !result.ok) {
            setFailure((result && result.error) || '操作失败')
            return false
          }
          setEditingId(null)
          setConfirmId(null)
          setSchemas({})
          setOpenTool(null)
          await refresh()
          return true
        },
        [refresh],
      )

      const servers = (data && data.servers) || []
      const parked = (data && data.parked) || []

      const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase()
        if (!needle) return servers
        return servers
          .map((server) => {
            const nameHit =
              server.serverName.toLowerCase().includes(needle) ||
              server.id.toLowerCase().includes(needle) ||
              endpointOf(server).toLowerCase().includes(needle)
            const tools = server.tools.filter(
              (tool) =>
                tool.wire.toLowerCase().includes(needle) || tool.description.toLowerCase().includes(needle),
            )
            if (nameHit) return server
            if (tools.length) return { ...server, tools }
            return null
          })
          .filter(Boolean)
      }, [query, servers])

      const style = h(
        'style',
        null,
        '.mc-card-btn:hover{background:var(--dsw-alias-bg-layer-2)}',
      )

      const header = h(
        'div',
        { style: S.head },
        h(
          'div',
          null,
          h('h3', { style: S.title }, 'MCP 控制台'),
          h(
            'p',
            { style: S.sub },
            loading && !data
              ? '读取中…'
              : data
                ? data.serverTotal + ' 个服务器 · ' + data.toolTotal + ' 个工具' +
                  (parked.length ? ' · ' + parked.length + ' 个已停用' : '') +
                  (syncedAt ? ' · 已同步 ' + syncedAt.toLocaleTimeString('zh-CN', { hour12: false }) : '')
                : '未获取到数据',
          ),
        ),
        h('span', { style: S.spacer }),
        h('button', { style: S.btn, onClick: () => setAdding((v) => !v) }, adding ? '收起添加' : '+ 添加'),
        h(
          'label',
          {
            style: { ...S.btn, display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer' },
            title: 'HMR 会在几秒内应用 patch 改动，自动刷新让你不用手动点',
          },
          h('input', {
            type: 'checkbox',
            checked: auto,
            onChange: (event) => setAuto(event.target.checked),
            style: { margin: 0 },
          }),
          '自动刷新',
          h(
            'span',
            { style: { color: C.dim, fontSize: '11px' } },
            auto ? '（' + AUTO_REFRESH_MS / 1000 + 's）' : '',
          ),
        ),
        h('button', { style: S.btn, onClick: () => refresh(false), disabled: loading }, loading ? '刷新中…' : '刷新'),
        h('button', { style: S.btn, onClick: exportJson }, '复制 JSON'),
      )

      const patchLine =
        data && data.patchPath
          ? h(
              'div',
              { style: { ...S.row, gap: '6px' } },
              h('span', { style: { color: C.dim, fontSize: '11.5px' } }, '配置来源'),
              h(
                'code',
                {
                  style: {
                    fontFamily: MONO,
                    fontSize: '11.5px',
                    color: C.dim,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  },
                  title: data.patchPath,
                },
                data.patchPath,
              ),
              h(
                'button',
                { style: { ...S.btn, padding: '1px 8px', fontSize: '11px' }, onClick: () => copyText(data.patchPath) },
                '复制',
              ),
            )
          : null

      const pending =
        data && data.pendingRestart
          ? h(
              Notice,
              null,
              '已写入 profile patch：HMR 通常几秒内自动生效。若长时间停在“尚未挂载”，才需要重启 DSH。',
            )
          : null

      return h(
        'div',
        { style: S.root },
        style,
        header,
        patchLine,
        pending,
        adding ? h(AddForm, { onDone: () => { setAdding(false); refresh() }, onCancel: () => setAdding(false) }) : null,
        h('input', {
          style: S.input,
          placeholder: '搜索服务器名、端点或工具名…',
          value: query,
          onChange: (event) => setQuery(event.target.value),
          spellCheck: false,
        }),
        failure ? h(Notice, { error: true }, failure) : null,
        data && data.error ? h(Notice, null, data.error) : null,
        loading && !data
          ? h('div', { style: S.empty }, '正在读取 MCP 配置与工具注册表…')
          : filtered.length === 0
            ? h('div', { style: S.empty }, query ? '没有匹配的服务器或工具。' : '这个 profile 里没有 MCP 服务器。')
            : filtered.map((server) =>
                h(ServerCard, {
                  key: server.id,
                  server,
                  open: openIds[server.id] === true,
                  openTool,
                  schemas,
                  editing: editingId === server.id,
                  confirm: confirmId === server.id,
                  busy: busyId === server.id,
                  searched: query.trim() !== '',
                  probe: probes[server.id],
                  onProbe: () => runProbe(server),
                  onToggle: () => toggleServer(server),
                  onToggleTool: toggleTool,
                  onEdit: () => setEditingId(server.id),
                  onCancelEdit: () => setEditingId(null),
                  onAskDelete: () => setConfirmId(server.id),
                  onCancelDelete: () => setConfirmId(null),
                  onDelete: () => act('remove', { id: server.patchId }),
                  onDisable: () => act('disable', { id: server.patchId }),
                  onSaved: () => {
                    setEditingId(null)
                    setSchemas({})
                    setOpenTool(null)
                    refresh()
                  },
                }),
              ),
        parked.length > 0
          ? h(
              'div',
              { style: { display: 'grid', gap: '8px' } },
              h(
                'div',
                { style: { ...S.row, gap: '8px' } },
                h('span', { style: { fontWeight: 620 } }, '已停用'),
                h('span', { style: { color: C.dim, fontSize: '11.5px' } }, '暂存在本 profile 的 mcp-manager/disabled.json，可恢复'),
              ),
              parked.map((item) =>
                h(
                  'div',
                  { key: item.id, style: { ...S.card, padding: '10px 13px', display: 'flex', gap: '10px', alignItems: 'center' } },
                  h('span', { style: { ...S.dot, background: C.idle } }),
                  h('span', { style: S.name }, item.serverName || item.id),
                  h(Chip, null, item.transport || '—'),
                  item.stillMounted ? h(Chip, null, '进程内仍挂着 · 待卸载') : null,
                  h('span', { style: S.endpoint, title: item.url }, item.url || item.id),
                  h('span', { style: S.spacer }),
                  h('span', { style: { color: C.dim, fontSize: '11.5px' } }, item.savedAt ? item.savedAt.slice(0, 19).replace('T', ' ') : ''),
                  h(
                    'button',
                    { style: S.btn, onClick: () => act('enable', { id: item.id }), disabled: busyId === item.id },
                    busyId === item.id ? '恢复中…' : '启用',
                  ),
                  h(
                    'button',
                    { style: { ...S.btn, ...S.danger }, onClick: () => act('forget', { id: item.id }), disabled: busyId === item.id },
                    '彻底删除',
                  ),
                ),
              ),
            )
          : null,
      )
    }

    return {
      name: '@sunt2049/dsh-mcp-manager',
      inject: ['slots'],
      apply(ctx) {
        const slots = ctx.get('slots')
        if (slots === undefined) return
        slots.inject('settings.section', () =>
          slots.register(
            {
              name: 'settings.section',
              id: 'mcp-manager',
              order: 26,
              label: () => 'MCP 控制台',
            },
            () => ConsoleSection(),
          ),
        )
      },
    }
  },
})
