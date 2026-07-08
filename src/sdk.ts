/**
 * stock-sdk 接入层：A股 + 美股统一接口
 */
import { StockSDK } from 'stock-sdk';
import type { FullQuote, GlobalFuturesQuote, USQuote } from 'stock-sdk';
import type { AppKline } from './charts';

export const sdk = new StockSDK({
  timeout: 30000,
  retry: { maxRetries: 2, baseDelay: 1000, maxDelay: 8000, backoffMultiplier: 2 },
  rateLimit: { requestsPerSecond: 4, maxBurst: 8 },
});

// ========== 类型定义：应用层统一 Quote / Timeline ==========

/** 应用层统一行情：A股 FullQuote + 美股 USQuote 映射后的公共字段 */
export interface AppQuote {
  code: string; // 内部标准格式：sh600519 / usaapl.oq
  name: string;
  market: 'A' | 'US';
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  change: number;
  changePercent: number;
  volume: number; // A股：手；美股：股
  amount: number; // A股：万元；美股：美元
  time: string; // 已格式化的显示时间
  turnoverRate: number | null;
  pe: number | null;
  pb: number | null;
  amplitude: number | null;
  totalMarketCap: number | null; // A股：亿元；美股：亿美元
  circulatingMarketCap: number | null; // 美股无此字段
  volumeRatio: number | null; // 美股无此字段
  high52w: number | null;
  low52w: number | null;
}

/** 统一分时数据结构 */
export interface TimelineData {
  market: 'A' | 'US' | 'FUTURES';
  preClose: number;
  data: { time: string; price: number; avgPrice: number | null }[];
}

// ========== 代码格式转换 ==========

/** 标准化 A 股代码：6/5 开头→沪市 sh，0/3/1 开头→深市 sz，4/8 开头→北交所 bj */
function normalizeAShare(code: string): string {
  const trimmed = code.trim().toLowerCase();
  const m = trimmed.match(/^(sh|sz|bj)?(\d{6})$/);
  if (!m) return trimmed;
  if (m[1]) return `${m[1]}${m[2]}`;
  const num = m[2];
  if (num.startsWith('6') || num.startsWith('5')) return `sh${num}`;
  if (num.startsWith('0') || num.startsWith('3') || num.startsWith('1')) return `sz${num}`;
  if (num.startsWith('4') || num.startsWith('8')) return `bj${num}`;
  return num;
}

/** 判断是否为 A 股代码（内部格式） */
function isAShare(code: string): boolean {
  return /^(sh|sz|bj)\d{6}$/.test(code);
}

/** 判断是否为美股代码（内部格式：usaapl.oq / ustsla.oq / usbaba.n） */
function isUSStock(code: string): boolean {
  return /^us[a-z]+\.(oq|n|a)$/i.test(code);
}

/** 腾讯美股格式 → 裸 ticker（行情接口入参）：usaapl.oq → AAPL */
function tencentToTicker(code: string): string {
  const m = code.match(/^us([a-z]+)\./i);
  return m ? m[1].toUpperCase() : code;
}

/** 腾讯美股格式 → 东财格式（K线/分时接口入参）：usaapl.oq → 105.AAPL, usbaba.n → 106.BABA */
function tencentToEastmoney(code: string): string {
  const m = code.match(/^us([a-z]+)\.(oq|n|a)$/i);
  if (!m) return code;
  const ticker = m[1].toUpperCase();
  const suffix = m[2].toLowerCase();
  // .oq = NASDAQ(105), .n = NYSE(106), .a = AMEX(107)
  const marketId = suffix === 'oq' ? '105' : suffix === 'n' ? '106' : '107';
  return `${marketId}.${ticker}`;
}

/** 美股行情返回的大写代码 → 腾讯格式：AAPL.OQ → usaapl.oq */
function quoteCodeToTencent(qCode: string): string {
  const m = qCode.match(/^([A-Z]+)\.(OQ|N|A)$/);
  if (!m) return qCode.toLowerCase();
  return `us${m[1].toLowerCase()}.${m[2].toLowerCase()}`;
}

// ========== 搜索：A股 + 美股 ==========

export interface StockSearchItem {
  code: string; // 内部格式
  name: string;
  market: 'A' | 'US';
}

const A_SHARE_CODE = /^(sh|sz|bj)\d{6}$/;
const US_STOCK_CODE = /^us[a-z]+\.(oq|n|a)$/i;

/** 搜索 A 股 + 美股个股 */
export async function searchStocks(keyword: string): Promise<StockSearchItem[]> {
  const results = await sdk.search(keyword);
  return results
    .map((r) => {
      const code = r.code.toLowerCase();
      if (r.market === 'us' && US_STOCK_CODE.test(code)) {
        return { code, name: r.name, market: 'US' as const };
      }
      const normalized = normalizeAShare(code);
      if (A_SHARE_CODE.test(normalized)) {
        return { code: normalized, name: r.name, market: 'A' as const };
      }
      return null;
    })
    .filter((x): x is StockSearchItem => x != null);
}

// ========== 行情：分流 + 映射为 AppQuote ==========

/** 行情时间格式化：14 位 yyyyMMddHHmmss → yyyy-MM-dd HH:mm:ss；已格式化的字符串原样返回（美股接口实测返回 "2026-07-02 16:00:01"） */
function formatQuoteTime(time: string | undefined): string {
  if (!time) return '';
  if (!/^\d{14}$/.test(time)) return time;
  return `${time.slice(0, 4)}-${time.slice(4, 6)}-${time.slice(6, 8)} ${time.slice(8, 10)}:${time.slice(10, 12)}:${time.slice(12)}`;
}

function mapFullQuote(q: FullQuote): AppQuote {
  return {
    code: normalizeAShare(q.code),
    name: q.name,
    market: 'A',
    price: q.price,
    prevClose: q.prevClose,
    open: q.open,
    high: q.high,
    low: q.low,
    change: q.change,
    changePercent: q.changePercent,
    volume: q.volume,
    amount: q.amount,
    time: formatQuoteTime(q.time),
    turnoverRate: q.turnoverRate,
    pe: q.pe,
    pb: q.pb,
    amplitude: q.amplitude,
    totalMarketCap: q.totalMarketCap,
    circulatingMarketCap: q.circulatingMarketCap,
    volumeRatio: (q as any).volumeRatio ?? null,
    high52w: (q as any).high52w ?? null,
    low52w: (q as any).low52w ?? null,
  };
}

function mapUSQuote(q: USQuote): AppQuote {
  return {
    code: quoteCodeToTencent(q.code),
    name: q.name,
    market: 'US',
    price: q.price,
    prevClose: q.prevClose,
    open: q.open,
    high: q.high,
    low: q.low,
    change: q.change,
    changePercent: q.changePercent,
    volume: q.volume,
    amount: q.amount,
    time: formatQuoteTime(q.time), // 腾讯原始 yyyyMMddHHmmss（美东时区）
    turnoverRate: q.turnoverRate,
    pe: q.pe,
    pb: q.pb,
    amplitude: q.amplitude,
    totalMarketCap: q.totalMarketCap,
    circulatingMarketCap: null,
    volumeRatio: null,
    high52w: q.high52w,
    low52w: q.low52w,
  };
}

/** 批量实时行情：自动分流 A股/美股 */
export async function fetchQuotes(codes: string[]): Promise<Map<string, AppQuote>> {
  const map = new Map<string, AppQuote>();
  if (codes.length === 0) return map;

  const aCodes = codes.filter(isAShare);
  const usCodes = codes.filter(isUSStock);

  const [aQuotes, usQuotes] = await Promise.all([
    aCodes.length > 0 ? sdk.getFullQuotes(aCodes) : Promise.resolve([]),
    usCodes.length > 0 ? sdk.getUSQuotes(usCodes.map(tencentToTicker)) : Promise.resolve([]),
  ]);

  for (const q of aQuotes) {
    const appQ = mapFullQuote(q);
    map.set(appQ.code, appQ);
  }
  for (const q of usQuotes) {
    const appQ = mapUSQuote(q);
    map.set(appQ.code, appQ);
  }

  return map;
}

// ========== 分时：A股 getTodayTimeline / 美股 getUSMinuteKline ==========

export async function fetchTimeline(code: string): Promise<TimelineData> {
  if (isAShare(code)) {
    const res = await sdk.getTodayTimeline(code);
    return {
      market: 'A',
      preClose: res.preClose && res.preClose > 0 ? res.preClose : res.data[0]?.price ?? 0,
      data: res.data.map((p) => ({ time: p.time, price: p.price, avgPrice: p.avgPrice })),
    };
  } else {
    // 美股分时：getUSMinuteKline 返回 USMinuteTimeline[]，含 open/close/avgPrice
    const emCode = tencentToEastmoney(code);
    const res = await sdk.getUSMinuteKline(emCode, { period: '1' });
    const points = Array.isArray(res) ? res : [];
    // 提取 HH:mm 部分
    const data = points.map((p: any) => ({
      time: p.time.slice(11, 16), // "2026-07-02 09:30" → "09:30"
      price: p.close ?? 0,
      avgPrice: p.avgPrice ?? null,
    }));
    const preClose = points[0]?.open ?? data[0]?.price ?? 0;
    return { market: 'US', preClose, data };
  }
}

// ========== K 线：东财网页端 JSONP（A股 / 美股 / 期货） ==========

const EASTMONEY_KLINE_URL = '/api/qt/stock/kline/get';
const EASTMONEY_TRENDS_URL = '/api/qt/stock/trends2/get';
const EASTMONEY_WEB_UT = 'fa5fd1943c7b386f172d6893dbfba10b';
const EASTMONEY_CALLBACK_PREFIX = 'jQuery35105710896192148922';
const EASTMONEY_TRENDS_CALLBACK_PREFIX = 'miniquotechart_jp';
const KLINE_CACHE_VERSION = 5;
const KLINE_CACHE_MS = 60000;
const klineCache = new Map<string, { at: number; data: AppKline[] }>();
const klineInflight = new Map<string, Promise<AppKline[]>>();
let klineJsonpSeq = 0;
let trendsJsonpSeq = 0;

function eastmoneyKlt(period: 'daily' | 'weekly' | 'monthly'): string {
  return { daily: '101', weekly: '102', monthly: '103' }[period];
}

function eastmoneyAShareSecid(code: string): string {
  const normalized = normalizeAShare(code);
  const market = normalized.startsWith('sh') ? '1' : '0';
  return `${market}.${normalized.slice(2)}`;
}

function parseNullableNumber(v: string | undefined): number | null {
  if (v == null || v === '' || v === '-') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

interface EastmoneyKlinePayload {
  data?: { klines?: string[] };
}

function parseEastmoneyKlinePayload(payload: EastmoneyKlinePayload): AppKline[] {
  return (payload.data?.klines ?? []).map((line) => {
    const f = line.split(',');
    return {
      date: f[0],
      open: parseNullableNumber(f[1]),
      close: parseNullableNumber(f[2]),
      high: parseNullableNumber(f[3]),
      low: parseNullableNumber(f[4]),
      volume: parseNullableNumber(f[5]),
      changePercent: parseNullableNumber(f.length > 8 ? f[8] : f[7]),
    };
  });
}

function parseEastmoneyKlineText(text: string): AppKline[] {
  const trimmed = text.trim();
  const start = trimmed.indexOf('(');
  const end = trimmed.lastIndexOf(')');
  const jsonText = start >= 0 && end > start ? trimmed.slice(start + 1, end) : trimmed;
  return parseEastmoneyKlinePayload(JSON.parse(jsonText) as EastmoneyKlinePayload);
}

function parseJsonpPayload<T>(text: string): T {
  const trimmed = text.trim();
  const start = trimmed.indexOf('(');
  const end = trimmed.lastIndexOf(')');
  const jsonText = start >= 0 && end > start ? trimmed.slice(start + 1, end) : trimmed;
  return JSON.parse(jsonText) as T;
}

async function requestEastmoneyKline(url: string): Promise<AppKline[]> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Eastmoney K line HTTP ${res.status}`);
  return parseEastmoneyKlineText(await res.text());
}

/** 东财网页端 K 线参数：走本地代理带 Cookie，请求完整历史，图表默认视窗由 dataZoom 控制。 */
async function fetchEastmoneyWebKline(
  secid: string,
  period: 'daily' | 'weekly' | 'monthly',
  fqt: '0' | '1'
): Promise<AppKline[]> {
  const cacheKey = `${KLINE_CACHE_VERSION}|${secid}|${period}|${fqt}`;
  const cached = klineCache.get(cacheKey);
  if (cached && Date.now() - cached.at < KLINE_CACHE_MS) {
    return cached.data;
  }
  const inflight = klineInflight.get(cacheKey);
  if (inflight) return inflight;

  const now = Date.now();
  const cb = `${EASTMONEY_CALLBACK_PREFIX}_${now + (klineJsonpSeq++ % 10)}`;
  const params = new URLSearchParams({
    cb,
    secid,
    ut: EASTMONEY_WEB_UT,
    fields1: 'f1,f2,f3,f4,f5,f6',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
    klt: eastmoneyKlt(period),
    fqt,
    beg: '0',
    end: '20500101',
    lmt: '1000000',
    _: String(now),
  });
  const promise = requestEastmoneyKline(`${EASTMONEY_KLINE_URL}?${params.toString()}`)
    .then((data) => {
      klineCache.set(cacheKey, { at: Date.now(), data });
      return data;
    })
    .finally(() => {
      klineInflight.delete(cacheKey);
    });
  klineInflight.set(cacheKey, promise);
  return promise;
}

export async function fetchKline(
  code: string,
  period: 'daily' | 'weekly' | 'monthly'
): Promise<AppKline[]> {
  if (isAShare(code)) {
    return fetchEastmoneyWebKline(eastmoneyAShareSecid(code), period, '1');
  }
  return fetchEastmoneyWebKline(tencentToEastmoney(code), period, '1');
}

// ========== 期货：中国（上期所主连）+ 美国（COMEX/NYMEX） ==========

/** 期货统一行情（国内来自最新日K，美国来自全球期货实时接口） */
export interface MetalQuote {
  code: string;
  name: string;
  market: 'CN' | 'US';
  price: number | null;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  prevSettle: number | null;
  volume: number | null;
  openInterest: number | null;
  buyVolume: number | null;
  sellVolume: number | null;
}

export interface MetalSearchItem {
  code: string;
  name: string;
  market: 'CN' | 'US';
}

/** 固定品种表：只收录当前关注的中美期货品种 */
const METAL_CATALOG: (MetalSearchItem & { aliases: string[] })[] = [
  { code: 'AUM', name: '沪金主连', market: 'CN', aliases: ['黄金', 'gold', 'au'] },
  { code: 'AGM', name: '沪银主连', market: 'CN', aliases: ['白银', 'silver', 'ag'] },
  { code: 'CUM', name: '沪铜主连', market: 'CN', aliases: ['铜', 'copper', 'cu'] },
  { code: 'ALM', name: '沪铝主连', market: 'CN', aliases: ['铝', 'aluminum', 'al'] },
  { code: 'ZNM', name: '沪锌主连', market: 'CN', aliases: ['锌', 'zinc', 'zn'] },
  { code: 'PBM', name: '沪铅主连', market: 'CN', aliases: ['铅', 'lead', 'pb'] },
  { code: 'NIM', name: '沪镍主连', market: 'CN', aliases: ['镍', 'nickel', 'ni'] },
  { code: 'SNM', name: '沪锡主连', market: 'CN', aliases: ['锡', 'tin', 'sn'] },
  { code: 'GC00Y', name: 'COMEX黄金', market: 'US', aliases: ['黄金', 'gold'] },
  { code: 'SI00Y', name: 'COMEX白银', market: 'US', aliases: ['白银', 'silver'] },
  { code: 'HG00Y', name: 'COMEX铜', market: 'US', aliases: ['铜', 'copper'] },
  { code: 'PL00Y', name: 'NYMEX铂金', market: 'US', aliases: ['铂金', 'platinum'] },
  { code: 'PA00Y', name: 'NYMEX钯金', market: 'US', aliases: ['钯金', 'palladium'] },
];

const METAL_BY_CODE = new Map(METAL_CATALOG.map((m) => [m.code, m]));

function eastmoneyMetalSecid(code: string): string {
  if (METAL_BY_CODE.get(code)?.market === 'CN') {
    return `113.${code}`;
  }
  const market = /^(GC|SI|HG)/.test(code) ? '101' : '102';
  return `${market}.${code}`;
}

function eastmoneyMetalTrendsSecid(code: string): string {
  const secid = eastmoneyMetalSecid(code);
  const [market, symbol] = secid.split('.');
  return `${market}.${symbol.toLowerCase()}`;
}

/** 是否为已收录的期货代码（用于过滤历史遗留项） */
export function isMetalCode(code: string): boolean {
  return METAL_BY_CODE.has(code);
}

/** 搜索期货：固定品种表内按名称/别名/代码匹配，无需请求网络 */
export async function searchMetals(keyword: string): Promise<MetalSearchItem[]> {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return [];
  return METAL_CATALOG.filter(
    (m) =>
      m.name.toLowerCase().includes(kw) ||
      m.code.toLowerCase().includes(kw) ||
      m.aliases.some((a) => a.toLowerCase().includes(kw))
  ).map(({ code, name, market }) => ({ code, name, market }));
}

/** 美国期货：全球期货实时接口（全量列表，短缓存） */
let usSpotCache: { at: number; list: GlobalFuturesQuote[] } | null = null;
const US_SPOT_CACHE_MS = 10000;

async function fetchUSSpot(): Promise<GlobalFuturesQuote[]> {
  if (usSpotCache && Date.now() - usSpotCache.at < US_SPOT_CACHE_MS) {
    return usSpotCache.list;
  }
  const all = await sdk.getGlobalFuturesSpot({ pageSize: 1000 });
  usSpotCache = { at: Date.now(), list: all };
  return usSpotCache.list;
}

function mapUSSpot(q: GlobalFuturesQuote): MetalQuote {
  return {
    code: q.code,
    name: q.name,
    market: 'US',
    price: q.price,
    change: q.change,
    changePercent: q.changePercent,
    open: q.open,
    high: q.high,
    low: q.low,
    prevSettle: q.prevSettle,
    volume: q.volume,
    openInterest: q.openInterest,
    buyVolume: q.buyVolume,
    sellVolume: q.sellVolume,
  };
}

/**
 * 国内期货实时行情：SDK 未封装上期所实时列表，直接调用东财 futsseapi
 * （与 getGlobalFuturesSpot 同源同 token，一次请求返回全部上期所合约）
 */
interface FutsseItem {
  dm: string; // 代码（小写，如 aum）
  name: string;
  p: number | string; // 最新价
  zde: number | string; // 涨跌额
  zdf: number | string; // 涨跌幅%
  o: number | string; // 今开
  h: number | string; // 最高
  l: number | string; // 最低
  zjsj: number | string; // 昨结算价
  vol: number | string; // 成交量
  ccl: number | string; // 持仓量
}

const FUTSSE_SHFE_URL =
  'https://futsseapi.eastmoney.com/list/113' +
  '?orderBy=dm&sort=desc&pageSize=400&pageIndex=0' +
  '&token=58b2fa8f54638b60b87d69b31969089c' +
  `&field=${encodeURIComponent('dm,name,p,zde,zdf,o,h,l,zjsj,vol,ccl')}`;

function num(v: number | string | undefined): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

let cnSpotCache: { at: number; map: Map<string, MetalQuote> } | null = null;
const CN_SPOT_CACHE_MS = 10000;

async function fetchCNSpot(): Promise<Map<string, MetalQuote>> {
  if (cnSpotCache && Date.now() - cnSpotCache.at < CN_SPOT_CACHE_MS) {
    return cnSpotCache.map;
  }
  const res = await fetch(FUTSSE_SHFE_URL);
  const json: { list?: FutsseItem[] } = await res.json();
  const map = new Map<string, MetalQuote>();
  for (const it of json.list ?? []) {
    const code = it.dm.toUpperCase();
    if (!METAL_BY_CODE.has(code)) continue;
    map.set(code, {
      code,
      name: it.name,
      market: 'CN',
      price: num(it.p),
      change: num(it.zde),
      changePercent: num(it.zdf),
      open: num(it.o),
      high: num(it.h),
      low: num(it.l),
      prevSettle: num(it.zjsj),
      volume: num(it.vol),
      openInterest: num(it.ccl),
      buyVolume: null,
      sellVolume: null,
    });
  }
  cnSpotCache = { at: Date.now(), map };
  return map;
}

/** 批量期货行情：按市场分流 */
export async function fetchMetalQuotes(codes: string[]): Promise<Map<string, MetalQuote>> {
  const map = new Map<string, MetalQuote>();
  if (codes.length === 0) return map;

  const cnCodes = codes.filter((c) => METAL_BY_CODE.get(c)?.market === 'CN');
  const usCodes = codes.filter((c) => METAL_BY_CODE.get(c)?.market === 'US');

  const [cnMap, usList] = await Promise.all([
    cnCodes.length > 0 ? fetchCNSpot() : Promise.resolve(new Map<string, MetalQuote>()),
    usCodes.length > 0 ? fetchUSSpot() : Promise.resolve([]),
  ]);

  for (const c of cnCodes) {
    const q = cnMap.get(c);
    if (q) map.set(c, q);
  }
  const wanted = new Set(usCodes);
  for (const q of usList) {
    if (wanted.has(q.code)) map.set(q.code, mapUSSpot(q));
  }
  return map;
}

/** 期货历史 K 线（日/周/月）：使用东财网页端 JSONP，避免 SDK push2his 多域名重试 */
export async function fetchMetalKline(
  code: string,
  period: 'daily' | 'weekly' | 'monthly'
): Promise<AppKline[]> {
  return fetchEastmoneyWebKline(eastmoneyMetalSecid(code), period, '0');
}

interface EastmoneyTrendsPayload {
  data?: {
    prePrice?: number;
    preSettlement?: number;
    preClose?: number;
    trends?: string[];
  };
}

function parseEastmoneyTrendsText(text: string): TimelineData {
  const payload = parseJsonpPayload<EastmoneyTrendsPayload>(text);
  const data = payload.data;
  const preClose = data?.prePrice ?? data?.preSettlement ?? data?.preClose ?? 0;
  const points = (data?.trends ?? [])
    .map((line) => {
      const f = line.split(',');
      const price = parseNullableNumber(f[2]);
      if (price == null) return null;
      const avgPrice = parseNullableNumber(f[5]);
      return {
        time: f[0],
        price,
        avgPrice: avgPrice != null && avgPrice > 0 ? avgPrice : null,
      };
    })
    .filter((p): p is { time: string; price: number; avgPrice: number | null } => p != null);
  return { market: 'FUTURES', preClose, data: points };
}

export async function fetchMetalTimeline(code: string): Promise<TimelineData> {
  const now = Date.now();
  const cb = `${EASTMONEY_TRENDS_CALLBACK_PREFIX}${trendsJsonpSeq++ % 10}`;
  const params = new URLSearchParams({
    fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13,f14,f17',
    fields2: 'f51,f52,f53,f54,f55,f58',
    dect: '1',
    mpi: '1000',
    ut: EASTMONEY_WEB_UT,
    secid: eastmoneyMetalTrendsSecid(code),
    ndays: '1',
    iscr: '0',
    iscca: '0',
    wbp2u: '1849325530509956|0|1|0|web',
    cb,
    _: String(now),
  });
  const res = await fetch(`${EASTMONEY_TRENDS_URL}?${params.toString()}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Eastmoney trends HTTP ${res.status}`);
  return parseEastmoneyTrendsText(await res.text());
}
