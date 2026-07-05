/**
 * 数值格式化工具：A股 + 美股适配
 */

/** 保留 2 位小数，空值显示 -- */
export function fmtPrice(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '--';
  return v.toFixed(2);
}

/** 带符号的涨跌额 */
export function fmtChange(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '--';
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}`;
}

/** 带符号的百分比 */
export function fmtPercent(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '--';
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
}

/** 成交量：A股(手) / 美股(股) */
export function fmtVolume(v: number | null | undefined, market: 'A' | 'US' = 'A'): string {
  if (v == null || Number.isNaN(v)) return '--';
  const unit = market === 'A' ? '手' : '股';
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)}亿${unit}`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(2)}万${unit}`;
  return `${Math.round(v)}${unit}`;
}

/** 成交额：A股(万元) / 美股(美元)，自动转换单位 */
export function fmtAmountWan(v: number | null | undefined, market: 'A' | 'US' = 'A'): string {
  if (v == null || Number.isNaN(v)) return '--';
  if (market === 'A') {
    // A股：万元 → 亿/万
    if (v >= 1e4) return `${(v / 1e4).toFixed(2)}亿`;
    return `${v.toFixed(0)}万`;
  } else {
    // 美股：美元 → $亿/$万
    if (v >= 1e8) return `$${(v / 1e8).toFixed(2)}亿`;
    if (v >= 1e4) return `$${(v / 1e4).toFixed(2)}万`;
    return `$${v.toFixed(0)}`;
  }
}

/** 市值：A股(亿元) / 美股(亿美元) */
export function fmtMarketCap(yi: number | null | undefined, market: 'A' | 'US' = 'A'): string {
  if (yi == null || Number.isNaN(yi)) return '--';
  const prefix = market === 'US' ? '$' : '';
  if (yi >= 1e4) return `${prefix}${(yi / 1e4).toFixed(2)}万亿`;
  return `${prefix}${yi.toFixed(0)}亿`;
}

/** 普通比率，空值 -- */
export function fmtRatio(v: number | null | undefined, suffix = ''): string {
  if (v == null || Number.isNaN(v)) return '--';
  return `${v.toFixed(2)}${suffix}`;
}

/** 涨跌配色 className */
export function trendClass(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v) || v === 0) return 'flat';
  return v > 0 ? 'up' : 'down';
}

/** 股票代码显示格式：sh600519 → SH600519, usaapl.oq → AAPL */
export function fmtCode(code: string): string {
  if (/^us([a-z]+)\./i.test(code)) {
    const m = code.match(/^us([a-z]+)\./i);
    return m ? m[1].toUpperCase() : code;
  }
  return code.toUpperCase();
}

/** 交易所信息：短标签 / 全称 / 所属市场 / 货币符号 */
export interface ExchangeInfo {
  label: string;
  full: string;
  market: 'A' | 'US';
  symbol: string;
}

/** 从内部代码推断交易所与货币：sh→沪(¥)、sz→深(¥)、bj→北(¥)、.oq→纳($)、.n→纽($)、.a→美($) */
export function exchangeInfo(code: string): ExchangeInfo {
  if (code.startsWith('sh')) return { label: '沪', full: '上交所 · 人民币', market: 'A', symbol: '¥' };
  if (code.startsWith('sz')) return { label: '深', full: '深交所 · 人民币', market: 'A', symbol: '¥' };
  if (code.startsWith('bj')) return { label: '北', full: '北交所 · 人民币', market: 'A', symbol: '¥' };
  const m = code.match(/^us[a-z]+\.(oq|n|a)$/i);
  if (m) {
    const s = m[1].toLowerCase();
    if (s === 'oq') return { label: '纳', full: '纳斯达克 · 美元', market: 'US', symbol: '$' };
    if (s === 'n') return { label: '纽', full: '纽交所 · 美元', market: 'US', symbol: '$' };
    return { label: '美', full: '美交所(AMEX) · 美元', market: 'US', symbol: '$' };
  }
  return { label: '?', full: '未知市场', market: 'A', symbol: '' };
}

/** 价格带货币符号：空值时不带符号，只显示 -- */
export function fmtPriceCur(v: number | null | undefined, symbol: string): string {
  if (v == null || Number.isNaN(v)) return '--';
  return `${symbol}${v.toFixed(2)}`;
}

/** 金属交易所信息：按品种名推断（沪=上期所，其余为美国 COMEX/NYMEX） */
export function metalExchangeInfo(name: string): { label: string; full: string; symbol: string } {
  if (name.startsWith('沪')) return { label: '沪', full: '上海期货交易所 · 人民币', symbol: '¥' };
  if (name.includes('NYMEX')) return { label: 'NYMEX', full: '纽约商业交易所 · 美元', symbol: '$' };
  if (name.includes('COMEX')) return { label: 'COMEX', full: '纽约商品交易所(COMEX) · 美元', symbol: '$' };
  return { label: '外盘', full: '国际期货 · 美元', symbol: '$' };
}
