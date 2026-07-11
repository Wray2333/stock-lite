# Stock Lite 开发文档

## 1. 项目定位

Stock Lite 是一个由 Vite 同时承载前端页面和轻量服务端中间件的行情看板。前端负责交互和图表渲染，Vite 中间件负责自选列表持久化，以及为东方财富 K 线和分时接口补充 Cookie、规避浏览器跨域限制。

项目不是纯静态站点。部署环境需要运行 `vite preview`，或将 `server/` 中的两个插件迁移到正式 Node 服务；只托管 `dist/` 会导致 `/api/storage` 和 `/api/qt/*` 不可用。

## 2. 目录结构

```text
stock-lite/
├─ server/                         # 仅在 Vite dev/preview 进程中运行
│  ├─ eastmoneyProxyPlugin.ts      # 东方财富代理、Cookie 与 curl 降级
│  └─ storagePlugin.ts             # data/storage.json 读写 API
├─ shared/
│  └─ storage.ts                   # 前后端共享的存储类型、默认值和校验
├─ src/
│  ├─ charts/options.ts            # ECharts option 构建函数
│  ├─ components/
│  │  ├─ common/                   # 无业务归属的通用组件
│  │  ├─ detail/                   # 行情详情、指标和共用图表容器
│  │  └─ sidebar/                  # 自选列表与搜索
│  ├─ services/
│  │  ├─ marketData.ts             # stock-sdk 与东方财富数据适配层
│  │  └─ storage.ts                # 浏览器端存储 API 客户端
│  ├─ styles/app.css               # 全局主题、布局及响应式样式
│  ├─ types/market.ts              # 前端统一行情、K 线和图表类型
│  ├─ utils/formatters.ts          # 金额、代码、涨跌和交易所格式化
│  ├─ App.tsx                      # 页面状态、轮询和列表编排
│  └─ main.tsx                     # React 入口
├─ data/                           # 运行时数据，不提交 Git
├─ vite.config.ts                  # 组装 React、存储和行情代理插件
├─ tsconfig.json                   # 浏览器端类型检查
└─ tsconfig.node.json              # Vite 配置及 server 类型检查
```

## 3. 常用命令

```bash
npm run dev        # 启动开发服务
npm run typecheck  # 检查 src、shared、server 和 Vite 配置
npm run build      # 类型检查并生成 dist
npm run preview    # 以生产模式运行 dist 和服务端中间件
```

默认开发地址由 Vite 自动分配。指定端口示例：

```bash
npm run dev -- --host 127.0.0.1 --port 5174
```

## 4. 数据流

### 股票

1. `Watchlist` 调用 `searchStocks` 搜索 A 股和美股。
2. `App` 每 5 秒调用 `fetchSecurityQuotes` 刷新列表和当前选中股票。
3. `StockDetail` 使用 `PriceChart` 加载分时或 K 线。
4. A 股和美股返回值在 `marketData.ts` 中映射为 `SecurityQuote`，组件不直接依赖 SDK 原始类型。

### 期货

1. `searchFutures` 在本地固定品种表中搜索，不发网络请求。
2. 国内期货来自东方财富上期所列表，美国期货来自 `stock-sdk` 全球期货接口。
3. 分时和 K 线统一转换为 `TimelineData` 与 `KlineBar`，复用同一个 `PriceChart`。

### 图表

- `PriceChart` 管理页签、加载状态、15 秒分时轮询和全屏状态。
- `charts/options.ts` 只负责把统一数据转换成 ECharts option，不发请求、不持有 React 状态。
- K 线请求完整历史，图表通过 `dataZoom` 默认展示日 K 半年、周 K 一年、月 K 两年。

## 5. 本地 API

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/api/storage` | 读取自选列表和主题 |
| `PUT` | `/api/storage/watchlist` | 保存股票自选 |
| `PUT` | `/api/storage/metals` | 保存期货自选；路径名为兼容旧数据而保留 |
| `PUT` | `/api/storage/theme` | 保存主题 |
| `GET` | `/api/qt/stock/kline/get` | 代理东方财富 K 线 |
| `GET` | `/api/qt/stock/trends2/get` | 代理东方财富分时 |

`data/storage.json` 是运行时文件，已被 `.gitignore` 忽略。首次启动且文件不存在时，会自动写入 `shared/storage.ts` 中的默认列表。

## 6. 东方财富 Cookie

代理按以下优先级读取 Cookie：

1. 环境变量 `EASTMONEY_COOKIE`
2. `data/eastmoney-cookie.txt`
3. `server/eastmoneyProxyPlugin.ts` 中的默认 Cookie

文件内容可以是原始 Cookie，也可以写成：

```text
EASTMONEY_COOKIE="key=value; key2=value2"
```

代理优先使用 Node `fetch`。部分服务器存在 TLS 或上游兼容问题时，会自动降级调用系统 `curl`，因此生产环境需要确保 `curl` 可用。

## 7. 类型与命名约定

- `Security*` 表示 A 股和美股共用的证券模型。
- `Futures*` 表示期货模型；持久化字段 `metals` 仅为兼容旧版本。
- `fetch*` 表示网络请求，`search*` 表示搜索，`create*Option` 表示纯图表配置构建。
- 格式化函数使用完整动词名，例如 `formatSecurityCode`、`formatTurnoverAmount`。
- 上游接口字段、市场代码转换、缓存和代理降级需要注释；组件中显而易见的赋值与渲染不添加叙述式注释。
- 页面组件只使用 `src/types/market.ts` 中的统一类型，不直接向 UI 暴露 SDK 或东方财富原始结构。

## 8. 添加期货品种

在 `src/services/marketData.ts` 的 `FUTURES_CATALOG` 中添加代码、名称、市场和搜索别名。

- 上期所主连使用市场 `CN`，代码需与东方财富 `list/113` 返回值一致。
- COMEX 品种使用市场 `US`，`GC`、`SI`、`HG` 前缀会映射到东方财富市场 `101`。
- 其他 NYMEX 品种当前映射到市场 `102`；新增品种前应先核对其 `secid`。

默认展示项在 `shared/storage.ts` 的 `DEFAULT_FUTURES` 中维护。

## 9. 部署检查

1. 执行 `npm ci`。
2. 执行 `npm run build`，确保浏览器端和 Node 端类型检查都通过。
3. 使用 `npm run preview -- --host 0.0.0.0` 启动服务。
4. 反向代理需要放行 `/api/storage` 和 `/api/qt/`，不能只回退到 `index.html`。
5. 自定义域名需加入 `vite.config.ts` 的 `preview.allowedHosts`。
6. 为 `data/` 提供可写持久卷，否则容器重建后自选列表会恢复默认值。

## 10. 常见问题

### API 返回了网页 HTML

通常是反向代理把 `/api/*` 当成前端路由回退到了 `index.html`。应让请求到达 Vite preview 进程，或在网关中为 API 单独配置上游。

### 日 K 看起来像周 K

不要给东方财富历史接口传过小的压缩条数。当前实现请求完整历史，并由 ECharts 控制默认可视范围。

### 清空自选后重启又出现默认项

存储校验允许空数组。若仍出现，检查部署环境是否保留了 `data/storage.json`，以及写入目录是否有权限。
