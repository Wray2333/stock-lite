# Stock Lite

极简 A 股自选行情看板：左侧自选列表，右侧个股详情。

参考 [stock-dashboard](../stock-dashboard-main) 重写的简化版。

## 功能

- **左侧自选**：搜索（代码/名称/拼音）添加 A 股，点击切换，悬停删除，localStorage 持久化
- **右侧详情**：实时报价 + 关键指标（开/收/高/低、量额、换手、市盈市净、市值等）
- **图表**：分时（价格线 + 均价线，昨收基准）、日K / 周K / 月K（前复权蜡烛图 + MA5/10/20 + 成交量）
- **刷新**：行情 5s 轮询，分时 15s 轮询

## 技术栈

- React 19 + TypeScript + Vite
- ECharts 6
- 数据来源：[stock-sdk](https://stock-sdk.linkdiary.cn/)

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```
