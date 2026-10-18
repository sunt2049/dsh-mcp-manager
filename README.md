# @sunt2049/dsh-mcp-manager

DeepSeek Harness（DSH）的 **MCP 控制台**：在设置页里把当前 profile 的所有 MCP 服务器看清楚、改得动。

![icon](./icon.svg)

## 它解决什么

社区里的 MCP 管理面板大多只是 `cordis.patch.yml` 的增删改壳子 —— 因为它们拿不到"MCP 到底连上没有"。本插件把三件被忽视的数据接了起来：

| 能力 | 数据来源 |
|---|---|
| 每个服务器**实际注册了多少工具** | `ctx.tools.schemas()` 里所有 `mcp__<server>__*` |
| 每个工具的**完整 JSON Schema** | 同上，按需取，不塞进首屏 |
| 配置**改完是否真的生效** | 保存走 `ctx.configEditor.edit`（Loader 就地重载连接），而不是猜文件 |

## 功能

- **服务器总览**：传输方式、端点 / 命令行、工具数、env / headers 的键名（值不回显）、超时
- **工具清单 + Schema**：按服务器分组、可搜索、点「参数」看完整 JSON Schema 并可复制
- **连通性探测**：区分「端口不通」「端口通了但 MCP 握手失败」「握手成功」；stdio 类型则检查 `command` 与参数里的绝对路径是否存在
- **添加 / 删除 / 停用 / 启用**：直接维护 profile 的 `cordis.patch.yml`
- **停用可恢复**：摘掉的行原样暂存，启用时**按原位置插回**
- **编辑配置**：url / command / args / 超时 / failOnStartupError，即时生效

## 安装

```bash
dsh plugin --profile web add @sunt2049/dsh-mcp-manager
```

或从 Git 仓库：

```bash
dsh plugin --profile web add github:<owner>/<repo>
```

装完重启一次 DSH，在 **设置 → MCP 控制台** 里使用。

## 两条重要的行为差异

1. **「编辑配置」是即时生效的**，因为走 `configEditor`，MCP 客户端会就地重载那一条连接。
2. **「添加 / 删除 / 停用 / 启用」只写文件，需要重启 DSH 才生效**。DSH 不监听 `cordis.patch.yml`（实测：把整行删掉后工具数不变），所以面板会显示「待重启」横幅，直到文件内容与启动时不同。

## 写入行为的边界

- 用块级解析器读写文档，**注释、空行、以及不属于 MCP 的行一律原样保留**；解析结果无法逐字节还原时直接**拒绝写入**，绝不"尽力而为"地重排你的配置。
- 停用记录按 profile 分文件：`profiles/<profile>/mcp-manager/disabled.json`。
- 只有本 profile 的 `cordis.patch.yml` 里的行能删；来自其它层（例如 agent preset、其它 patch 文件）的行会标注并禁用按钮。

## 兼容性

- 需要 DSH `0.2.0-rc.2` 及以上（`peerDependencies` 会由宿主做兼容性闸门检查）
- 客户端插件 `platform: web`，Web GUI 与桌面端（Electron）通用

## 许可证

MIT
