import { useEffect, useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import EChart from './EChart';
import StatsPanel, { type DetailStat } from './StatsPanel';
import ThemeToggle from './ThemeToggle';
import { fetchMetalKline, fetchMetalTimeline, type MetalQuote, type TimelineData } from '../sdk';
import { buildKlineOption, buildTimelineOption, type AppKline } from '../charts';
import type { Theme } from '../theme';
import {
  fmtChange,
  fmtPercent,
  fmtPrice,
  fmtVolume,
  metalExchangeInfo,
  trendClass,
} from '../format';

type ChartTab = 'timeline' | 'daily' | 'weekly' | 'monthly';

const TABS: { key: ChartTab; label: string }[] = [
  { key: 'timeline', label: '分时' },
  { key: 'daily', label: '日K' },
  { key: 'weekly', label: '周K' },
  { key: 'monthly', label: '月K' },
];
const DEFAULT_VISIBLE_KLINE_YEARS = 2;
const TIMELINE_REFRESH_MS = 15000;

interface Props {
  code: string;
  /** 列表里的品种名，行情未返回时兜底显示 */
  name?: string;
  quote: MetalQuote | undefined;
  theme: Theme;
  onToggleTheme: () => void;
  onShowSidebar?: () => void;
}

export default function MetalDetail({
  code,
  name,
  quote,
  theme,
  onToggleTheme,
  onShowSidebar,
}: Props) {
  const [tab, setTab] = useState<ChartTab>('timeline');
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [kline, setKline] = useState<AppKline[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chartFullscreen, setChartFullscreen] = useState(false);

  useEffect(() => {
    setTimeline(null);
    setKline(null);
    setError('');
    setChartFullscreen(false);
  }, [code]);

  useEffect(() => {
    setKline(null);
    setError('');
  }, [code, tab]);

  useEffect(() => {
    if (!chartFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setChartFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [chartFullscreen]);

  // 分时：加载 + 轮询
  useEffect(() => {
    if (tab !== 'timeline') return;
    let cancelled = false;
    const load = async (silent: boolean) => {
      if (!silent) setLoading(true);
      try {
        const res = await fetchMetalTimeline(code);
        if (!cancelled) {
          setTimeline(res);
          setError('');
        }
      } catch {
        if (!cancelled && !silent) setError('分时数据加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load(false);
    const timer = setInterval(() => load(true), TIMELINE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [code, tab]);

  // K 线：按周期加载
  useEffect(() => {
    if (tab === 'timeline') return;
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

  const option: EChartsOption | null = useMemo(() => {
    if (tab === 'timeline') {
      return timeline && timeline.data.length > 0 ? buildTimelineOption(timeline, theme) : null;
    }
    return kline && kline.length > 0
      ? buildKlineOption(kline, theme, DEFAULT_VISIBLE_KLINE_YEARS)
      : null;
  }, [tab, timeline, kline, theme]);

  const cls = trendClass(quote?.changePercent);
  const displayName = quote?.name || name || code;
  const ex = metalExchangeInfo(displayName);

  const stats: DetailStat[] = [
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
      <div className="detail-summary">
        <div className="detail-main-quote">
          <div className="detail-header">
            <span className="detail-name">{displayName}</span>
            {onShowSidebar && (
              <button
                type="button"
                className="detail-sidebar-restore"
                aria-label="显示左侧栏"
                title="显示左侧栏"
                onClick={onShowSidebar}
              >
                ›
              </button>
            )}
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
        </div>

        <StatsPanel stats={stats} />
      </div>

      <div className={`chart-card${chartFullscreen ? ' chart-fullscreen' : ''}`}>
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
          <button
            type="button"
            className="chart-fullscreen-button"
            aria-label={chartFullscreen ? '退出全屏' : '全屏查看图表'}
            title={chartFullscreen ? '退出全屏' : '全屏查看图表'}
            onClick={() => setChartFullscreen((current) => !current)}
          >
            {chartFullscreen ? '×' : '⛶'}
          </button>
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
