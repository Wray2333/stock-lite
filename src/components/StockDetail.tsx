import { useEffect, useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import EChart from './EChart';
import ThemeToggle from './ThemeToggle';
import { fetchKline, fetchTimeline, type AppQuote, type TimelineData } from '../sdk';
import { buildKlineOption, buildTimelineOption, type AppKline } from '../charts';
import type { Theme } from '../theme';
import {
  fmtAmountWan,
  fmtChange,
  fmtCode,
  fmtMarketCap,
  fmtPercent,
  fmtPrice,
  fmtRatio,
  fmtVolume,
  trendClass,
} from '../format';

type ChartTab = 'timeline' | 'daily' | 'weekly' | 'monthly';

const TABS: { key: ChartTab; label: string }[] = [
  { key: 'timeline', label: '分时' },
  { key: 'daily', label: '日K' },
  { key: 'weekly', label: '周K' },
  { key: 'monthly', label: '月K' },
];

const TIMELINE_REFRESH_MS = 15000;

interface Props {
  code: string;
  quote: AppQuote | undefined;
  theme: Theme;
  onToggleTheme: () => void;
  onShowSidebar?: () => void;
}

export default function StockDetail({
  code,
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

  // 切换股票时重置图表数据
  useEffect(() => {
    setTimeline(null);
    setKline(null);
    setError('');
    setChartFullscreen(false);
  }, [code]);

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
        const res = await fetchTimeline(code);
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
    fetchKline(code, tab)
      .then((data) => {
        if (!cancelled) {
          setKline(data);
          setError('');
        }
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
    return kline && kline.length > 0 ? buildKlineOption(kline, theme) : null;
  }, [tab, timeline, kline, theme]);

  const cls = trendClass(quote?.changePercent);
  const market = quote?.market ?? (code.startsWith('us') ? 'US' : 'A');

  const stats: { label: string; full: string; value: string; cls?: string }[] = [
    { label: '今开', full: '今开', value: fmtPrice(quote?.open), cls: trendClass(quote && quote.prevClose ? quote.open - quote.prevClose : null) },
    { label: '昨收', full: '昨收', value: fmtPrice(quote?.prevClose) },
    { label: '最高', full: '最高', value: fmtPrice(quote?.high), cls: trendClass(quote && quote.prevClose ? quote.high - quote.prevClose : null) },
    { label: '最低', full: '最低', value: fmtPrice(quote?.low), cls: trendClass(quote && quote.prevClose ? quote.low - quote.prevClose : null) },
    { label: '总量', full: '成交量', value: fmtVolume(quote?.volume, market) },
    { label: '总额', full: '成交额', value: fmtAmountWan(quote?.amount, market) },
    { label: '换手', full: '换手率', value: fmtRatio(quote?.turnoverRate, '%') },
    { label: '量比', full: '量比', value: fmtRatio(quote?.volumeRatio) },
    { label: '振幅', full: '振幅', value: fmtRatio(quote?.amplitude, '%') },
    { label: '市盈', full: '市盈率(TTM)', value: fmtRatio(quote?.pe) },
    { label: '市净', full: '市净率', value: fmtRatio(quote?.pb) },
    { label: '总值', full: '总市值', value: fmtMarketCap(quote?.totalMarketCap, market) },
    { label: '流值', full: '流通市值', value: fmtMarketCap(quote?.circulatingMarketCap, market) },
  ];

  return (
    <main className="detail">
      <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      <div className="detail-summary">
        <div className="detail-main-quote">
          <div className="detail-header">
            <span className="detail-name">{quote?.name || code}</span>
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
            <span className="detail-code">{fmtCode(code)}</span>
            {quote?.time && (
              <span className="detail-time">
                {quote.time}
                {market === 'US' ? '（美东）' : ''}
              </span>
            )}
          </div>

          <div className="detail-price-row">
            <span className={`detail-price ${cls}`}>{fmtPrice(quote?.price)}</span>
            <span className={`detail-change ${cls}`}>
              {fmtChange(quote?.change)}　{fmtPercent(quote?.changePercent)}
            </span>
          </div>
        </div>

        <div className="stats-grid">
          {stats.map((s) => (
            <div key={s.full} className="stat-cell" title={s.full}>
              <div className="stat-label">{s.label}</div>
              <div className={`stat-value ${s.cls ?? ''}`}>{s.value}</div>
            </div>
          ))}
        </div>
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
