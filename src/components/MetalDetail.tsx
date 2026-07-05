import { useEffect, useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import EChart from './EChart';
import ThemeToggle from './ThemeToggle';
import { fetchMetalKline, type MetalQuote } from '../sdk';
import { buildKlineOption, type AppKline } from '../charts';
import type { Theme } from '../theme';
import {
  fmtChange,
  fmtPercent,
  fmtPrice,
  fmtVolume,
  metalExchangeInfo,
  trendClass,
} from '../format';

type ChartTab = 'daily' | 'weekly' | 'monthly';

const TABS: { key: ChartTab; label: string }[] = [
  { key: 'daily', label: '日K' },
  { key: 'weekly', label: '周K' },
  { key: 'monthly', label: '月K' },
];

interface Props {
  code: string;
  /** 列表里的品种名，行情未返回时兜底显示 */
  name?: string;
  quote: MetalQuote | undefined;
  theme: Theme;
  onToggleTheme: () => void;
}

export default function MetalDetail({ code, name, quote, theme, onToggleTheme }: Props) {
  const [tab, setTab] = useState<ChartTab>('daily');
  const [kline, setKline] = useState<AppKline[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // K 线：按周期加载
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setKline(null);
    setError('');
    fetchMetalKline(code, tab)
      .then((data) => {
        if (!cancelled) setKline(data);
      })
      .catch(() => {
        if (!cancelled) setError('K 线数据加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code, tab]);

  const option: EChartsOption | null = useMemo(
    () => (kline && kline.length > 0 ? buildKlineOption(kline, theme) : null),
    [kline, theme]
  );

  const cls = trendClass(quote?.changePercent);
  const displayName = quote?.name || name || code;
  const ex = metalExchangeInfo(displayName);

  const stats: { label: string; full: string; value: string; cls?: string }[] = [
    { label: '今开', full: '今开', value: fmtPrice(quote?.open), cls: trendClass(quote?.open != null && quote.prevSettle ? quote.open - quote.prevSettle : null) },
    { label: '昨结', full: '昨日结算价', value: fmtPrice(quote?.prevSettle) },
    { label: '最高', full: '最高', value: fmtPrice(quote?.high), cls: trendClass(quote?.high != null && quote.prevSettle ? quote.high - quote.prevSettle : null) },
    { label: '最低', full: '最低', value: fmtPrice(quote?.low), cls: trendClass(quote?.low != null && quote.prevSettle ? quote.low - quote.prevSettle : null) },
    { label: '总量', full: '成交量', value: fmtVolume(quote?.volume) },
    { label: '持仓', full: '持仓量', value: fmtVolume(quote?.openInterest) },
    { label: '买量', full: '买盘量', value: fmtVolume(quote?.buyVolume) },
    { label: '卖量', full: '卖盘量', value: fmtVolume(quote?.sellVolume) },
  ];

  return (
    <main className="detail">
      <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      <div className="detail-header">
        <span className="detail-name">{displayName}</span>
        <span className="detail-code">{code}</span>
        <span className="detail-time" title={ex.full}>
          {ex.label} · {ex.symbol}
        </span>
      </div>

      <div className="detail-price-row">
        <span className={`detail-price ${cls}`}>{fmtPrice(quote?.price)}</span>
        <span className={`detail-change ${cls}`}>
          {fmtChange(quote?.change)}　{fmtPercent(quote?.changePercent)}
        </span>
      </div>

      <div className="stats-grid">
        {stats.map((s) => (
          <div key={s.full} className="stat-cell" title={s.full}>
            <div className="stat-label">{s.label}</div>
            <div className={`stat-value ${s.cls ?? ''}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="chart-card">
        <div className="chart-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`chart-tab${tab === t.key ? ' active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="chart-body">
          {option && <EChart option={option} />}
          {!option && loading && <div className="chart-loading">加载中…</div>}
          {!option && !loading && error && <div className="chart-error">{error}</div>}
          {!option && !loading && !error && (
            <div className="chart-loading">暂无数据</div>
          )}
        </div>
      </div>
    </main>
  );
}
