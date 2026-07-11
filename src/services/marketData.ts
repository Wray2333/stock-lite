import { StockSDK } from 'stock-sdk';
import type { FullQuote, GlobalFuturesQuote, USQuote } from 'stock-sdk';
import type {
  FuturesQuote,
  FuturesSearchResult,
  KlineBar,
  KlinePeriod,
  SecurityQuote,
  StockSearchResult,
  TimelineData,
} from '../types/market';

const stockSdk = new StockSDK({
  timeout: 30000,
  retry: { maxRetries: 2, baseDelay: 1000, maxDelay: 8000, backoffMultiplier: 2 },
  rateLimit: { requestsPerSecond: 4, maxBurst: 8 },
});

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

const A_SHARE_CODE = /^(sh|sz|bj)\d{6}$/;
const US_STOCK_CODE = /^us[a-z]+\.(oq|n|a)$/i;

/** 搜索 A 股 + 美股个股 */
export async function searchStocks(keyword: string): Promise<StockSearchResult[]> {
  const results = await stockSdk.search(keyword);
  return results
    .map((result) => {
      const code = result.code.toLowerCase();
      if (result.market === 'us' && US_STOCK_CODE.test(code)) {
        return { code, name: result.name, market: 'US' as const };
      }
      const normalized = normalizeAShare(code);
      if (A_SHARE_CODE.test(normalized)) {
        return { code: normalized, name: result.name, market: 'A' as const };
      }
      return null;
    })
    .filter((item): item is StockSearchResult => item != null);
}

/** 行情时间格式化：14 位 yyyyMMddHHmmss → yyyy-MM-dd HH:mm:ss；已格式化的字符串原样返回（美股接口实测返回 "2026-07-02 16:00:01"） */
function formatQuoteTime(time: string | undefined): string {
  if (!time) return '';
  if (!/^\d{14}$/.test(time)) return time;
  return `${time.slice(0, 4)}-${time.slice(4, 6)}-${time.slice(6, 8)} ${time.slice(8, 10)}:${time.slice(10, 12)}:${time.slice(12)}`;
}

function mapAShareQuote(quote: FullQuote): SecurityQuote {
  return {
    code: normalizeAShare(quote.code),
    name: quote.name,
    market: 'A',
    price: quote.price,
    prevClose: quote.prevClose,
    open: quote.open,
    high: quote.high,
    low: quote.low,
    change: quote.change,
    changePercent: quote.changePercent,
    volume: quote.volume,
    amount: quote.amount,
    time: formatQuoteTime(quote.time),
    turnoverRate: quote.turnoverRate,
    pe: quote.pe,
    pb: quote.pb,
    amplitude: quote.amplitude,
    totalMarketCap: quote.totalMarketCap,
    circulatingMarketCap: quote.circulatingMarketCap,
    volumeRatio: quote.volumeRatio,
    high52w: quote.high52w,
    low52w: quote.low52w,
  };
}

function mapUSSecurityQuote(quote: USQuote): SecurityQuote {
  return {
    code: quoteCodeToTencent(quote.code),
    name: quote.name,
    market: 'US',
    price: quote.price,
    prevClose: quote.prevClose,
    open: quote.open,
    high: quote.high,
    low: quote.low,
    change: quote.change,
    changePercent: quote.changePercent,
    volume: quote.volume,
    amount: quote.amount,
    time: formatQuoteTime(quote.time),
    turnoverRate: quote.turnoverRate,
    pe: quote.pe,
    pb: quote.pb,
    amplitude: quote.amplitude,
    totalMarketCap: quote.totalMarketCap,
    circulatingMarketCap: null,
    volumeRatio: null,
    high52w: quote.high52w,
    low52w: quote.low52w,
  };
}

/** 批量实时行情：自动分流 A股/美股 */
export async function fetchSecurityQuotes(codes: string[]): Promise<Map<string, SecurityQuote>> {
  const map = new Map<string, SecurityQuote>();
  if (codes.length === 0) return map;

  const aCodes = codes.filter(isAShare);
  const usCodes = codes.filter(isUSStock);

  const [aQuotes, usQuotes] = await Promise.all([
    aCodes.length > 0 ? stockSdk.getFullQuotes(aCodes) : Promise.resolve([]),
    usCodes.length > 0 ? stockSdk.getUSQuotes(usCodes.map(tencentToTicker)) : Promise.resolve([]),
  ]);

  for (const quote of aQuotes) {
    const securityQuote = mapAShareQuote(quote);
    map.set(securityQuote.code, securityQuote);
  }
  for (const quote of usQuotes) {
    const securityQuote = mapUSSecurityQuote(quote);
    map.set(securityQuote.code, securityQuote);
  }

  return map;
}

export async function fetchSecurityTimeline(code: string): Promise<TimelineData> {
  if (isAShare(code)) {
    const res = await stockSdk.getTodayTimeline(code);
    return {
      market: 'A',
      preClose: res.preClose && res.preClose > 0 ? res.preClose : res.data[0]?.price ?? 0,
      data: res.data.map((p) => ({ time: p.time, price: p.price, avgPrice: p.avgPrice })),
    };
  } else {
    // 美股分时：getUSMinuteKline 返回 USMinuteTimeline[]，含 open/close/avgPrice
    const emCode = tencentToEastmoney(code);
    const response = await stockSdk.getUSMinuteKline(emCode, { period: '1' });
    const points = response as {
      time: string;
      close: number;
      open: number;
      avgPrice?: number | null;
    }[];
    const data = points.map((point) => ({
      time: point.time.slice(11, 16),
      price: point.close,
      avgPrice: point.avgPrice ?? null,
    }));
    const preClose = points[0]?.open ?? data[0]?.price ?? 0;
    return { market: 'US', preClose, data };
  }
}

const EASTMONEY_KLINE_URL = '/api/qt/stock/kline/get';
const EASTMONEY_TRENDS_URL = '/api/qt/stock/trends2/get';
const EASTMONEY_WEB_UT = 'fa5fd1943c7b386f172d6893dbfba10b';
const EASTMONEY_CALLBACK_PREFIX = 'jQuery35105710896192148922';
const EASTMONEY_TRENDS_CALLBACK_PREFIX = 'miniquotechart_jp';
const KLINE_CACHE_VERSION = 5;
const KLINE_CACHE_MS = 60000;
const klineCache = new Map<string, { at: number; data: KlineBar[] }>();
const klineInflight = new Map<string, Promise<KlineBar[]>>();
let klineJsonpSeq = 0;
let trendsJsonpSeq = 0;

function getEastmoneyKlinePeriod(period: KlinePeriod): string {
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

function parseEastmoneyKlinePayload(payload: EastmoneyKlinePayload): KlineBar[] {
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

function parseEastmoneyKlineText(text: string): KlineBar[] {
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

async function requestEastmoneyKline(url: string): Promise<KlineBar[]> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Eastmoney K line HTTP ${res.status}`);
  return parseEastmoneyKlineText(await res.text());
}

/** 东财网页端 K 线参数：走本地代理带 Cookie，请求完整历史，图表默认视窗由 dataZoom 控制。 */
async function fetchEastmoneyWebKline(
  secid: string,
  period: KlinePeriod,
  fqt: '0' | '1'
): Promise<KlineBar[]> {
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
    klt: getEastmoneyKlinePeriod(period),
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

export async function fetchSecurityKline(
  code: string,
  period: KlinePeriod
): Promise<KlineBar[]> {
  if (isAShare(code)) {
    return fetchEastmoneyWebKline(eastmoneyAShareSecid(code), period, '1');
  }
  return fetchEastmoneyWebKline(tencentToEastmoney(code), period, '1');
}

/** 固定品种表：只收录当前关注的中美期货品种 */
const FUTURES_CATALOG: (FuturesSearchResult & { aliases: string[] })[] = [
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

const FUTURES_BY_CODE = new Map(FUTURES_CATALOG.map((item) => [item.code, item]));

function getEastmoneyFuturesSecurityId(code: string): string {
  if (FUTURES_BY_CODE.get(code)?.market === 'CN') {
    return `113.${code}`;
  }
  const market = /^(GC|SI|HG)/.test(code) ? '101' : '102';
  return `${market}.${code}`;
}

function getEastmoneyFuturesTimelineId(code: string): string {
  const secid = getEastmoneyFuturesSecurityId(code);
  const [market, symbol] = secid.split('.');
  return `${market}.${symbol.toLowerCase()}`;
}

/** 是否为已收录的期货代码（用于过滤历史遗留项） */
export function isSupportedFuturesCode(code: string): boolean {
  return FUTURES_BY_CODE.has(code);
}

/** 搜索期货：固定品种表内按名称/别名/代码匹配，无需请求网络 */
export async function searchFutures(keyword: string): Promise<FuturesSearchResult[]> {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) return [];
  return FUTURES_CATALOG.filter(
    (item) =>
      item.name.toLowerCase().includes(normalizedKeyword) ||
      item.code.toLowerCase().includes(normalizedKeyword) ||
      item.aliases.some((alias) => alias.toLowerCase().includes(normalizedKeyword))
  ).map(({ code, name, market }) => ({ code, name, market }));
}

/** 美国期货：全球期货实时接口（全量列表，短缓存） */
let globalFuturesCache: { at: number; list: GlobalFuturesQuote[] } | null = null;
const GLOBAL_FUTURES_CACHE_MS = 10000;

async function fetchGlobalFuturesQuotes(): Promise<GlobalFuturesQuote[]> {
  if (
    globalFuturesCache &&
    Date.now() - globalFuturesCache.at < GLOBAL_FUTURES_CACHE_MS
  ) {
    return globalFuturesCache.list;
  }
  const all = await stockSdk.getGlobalFuturesSpot({ pageSize: 1000 });
  globalFuturesCache = { at: Date.now(), list: all };
  return globalFuturesCache.list;
}

function mapGlobalFuturesQuote(quote: GlobalFuturesQuote): FuturesQuote {
  return {
    code: quote.code,
    name: quote.name,
    market: 'US',
    price: quote.price,
    change: quote.change,
    changePercent: quote.changePercent,
    open: quote.open,
    high: quote.high,
    low: quote.low,
    prevSettle: quote.prevSettle,
    volume: quote.volume,
    openInterest: quote.openInterest,
    buyVolume: quote.buyVolume,
    sellVolume: quote.sellVolume,
  };
}

/**
 * 国内期货实时行情：SDK 未封装上期所实时列表，直接调用东财 futsseapi
 * （与 getGlobalFuturesSpot 同源同 token，一次请求返回全部上期所合约）
 */
interface EastmoneyFuturesSpotItem {
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

const EASTMONEY_SHFE_QUOTES_URL =
  'https://futsseapi.eastmoney.com/list/113' +
  '?orderBy=dm&sort=desc&pageSize=400&pageIndex=0' +
  '&token=58b2fa8f54638b60b87d69b31969089c' +
  `&field=${encodeURIComponent('dm,name,p,zde,zdf,o,h,l,zjsj,vol,ccl')}`;

function parseFiniteNumber(v: number | string | undefined): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

let cnSpotCache: { at: number; map: Map<string, FuturesQuote> } | null = null;
const CN_SPOT_CACHE_MS = 10000;

async function fetchChineseFuturesQuotes(): Promise<Map<string, FuturesQuote>> {
  if (cnSpotCache && Date.now() - cnSpotCache.at < CN_SPOT_CACHE_MS) {
    return cnSpotCache.map;
  }
  const res = await fetch(EASTMONEY_SHFE_QUOTES_URL);
  const json: { list?: EastmoneyFuturesSpotItem[] } = await res.json();
  const map = new Map<string, FuturesQuote>();
  for (const it of json.list ?? []) {
    const code = it.dm.toUpperCase();
    if (!FUTURES_BY_CODE.has(code)) continue;
    map.set(code, {
      code,
      name: it.name,
      market: 'CN',
      price: parseFiniteNumber(it.p),
      change: parseFiniteNumber(it.zde),
      changePercent: parseFiniteNumber(it.zdf),
      open: parseFiniteNumber(it.o),
      high: parseFiniteNumber(it.h),
      low: parseFiniteNumber(it.l),
      prevSettle: parseFiniteNumber(it.zjsj),
      volume: parseFiniteNumber(it.vol),
      openInterest: parseFiniteNumber(it.ccl),
      buyVolume: null,
      sellVolume: null,
    });
  }
  cnSpotCache = { at: Date.now(), map };
  return map;
}

/** 批量期货行情：按市场分流 */
export async function fetchFuturesQuotes(codes: string[]): Promise<Map<string, FuturesQuote>> {
  const map = new Map<string, FuturesQuote>();
  if (codes.length === 0) return map;

  const cnCodes = codes.filter((code) => FUTURES_BY_CODE.get(code)?.market === 'CN');
  const usCodes = codes.filter((code) => FUTURES_BY_CODE.get(code)?.market === 'US');

  const [cnMap, usList] = await Promise.all([
    cnCodes.length > 0
      ? fetchChineseFuturesQuotes()
      : Promise.resolve(new Map<string, FuturesQuote>()),
    usCodes.length > 0 ? fetchGlobalFuturesQuotes() : Promise.resolve([]),
  ]);

  for (const c of cnCodes) {
    const quote = cnMap.get(c);
    if (quote) map.set(c, quote);
  }
  const wanted = new Set(usCodes);
  for (const quote of usList) {
    if (wanted.has(quote.code)) map.set(quote.code, mapGlobalFuturesQuote(quote));
  }
  return map;
}

/** 期货历史 K 线（日/周/月）：使用东财网页端 JSONP，避免 SDK push2his 多域名重试 */
export async function fetchFuturesKline(
  code: string,
  period: KlinePeriod
): Promise<KlineBar[]> {
  return fetchEastmoneyWebKline(getEastmoneyFuturesSecurityId(code), period, '0');
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

export async function fetchFuturesTimeline(code: string): Promise<TimelineData> {
  const now = Date.now();
  const cb = `${EASTMONEY_TRENDS_CALLBACK_PREFIX}${trendsJsonpSeq++ % 10}`;
  const params = new URLSearchParams({
    fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13,f14,f17',
    fields2: 'f51,f52,f53,f54,f55,f58',
    dect: '1',
    mpi: '1000',
    ut: EASTMONEY_WEB_UT,
    secid: getEastmoneyFuturesTimelineId(code),
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
