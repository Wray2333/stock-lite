# Stock Lite

轻量股票与期货行情看板，支持 A 股、美股及常用贵金属期货。

## 功能

- 股票与期货自选列表、搜索和文件持久化
- 实时报价、关键指标、分时图及日/周/月 K 线
- 桌面端侧栏折叠、移动端抽屉和图表横屏全屏
- 深浅主题及系统主题跟随

## 技术栈

- React 19 + TypeScript + Vite
- ECharts 6
- [stock-sdk](https://stock-sdk.linkdiary.cn/)
- 东方财富行情接口（通过本地 Vite 中间件代理）

## 快速开始

```bash
npm install
npm run dev
```

生产检查与预览：

```bash
npm run build
npm run preview
```

项目结构、数据流、接口和部署说明见 [DEVELOPMENT.md](./DEVELOPMENT.md)。
