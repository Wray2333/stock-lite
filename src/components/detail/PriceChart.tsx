import { useEffect, useMemo, useState } from 'react';
import EChart from '../common/EChart';
import { createKlineChartOption, createTimelineChartOption } from '../../charts/options';
import type {
  ChartTab,
  KlineBar,
  KlinePeriod,
  Theme,
  TimelineData,
} from '../../types/market';

const CHART_TABS: { key: ChartTab; label: string }[] = [
  { key: 'timeline', label: '分时' },
  { key: 'daily', label: '日K' },
  { key: 'weekly', label: '周K' },
  { key: 'monthly', label: '月K' },
];

const TIMELINE_REFRESH_MS = 15_000;
const DEFAULT_VISIBLE_KLINE_YEARS = 2;

interface Props {
  code: string;
  theme: Theme;
  loadTimeline: (code: string) => Promise<TimelineData>;
  loadKline: (code: string, period: KlinePeriod) => Promise<KlineBar[]>;
}

export default function PriceChart({ code, theme, loadTimeline, loadKline }: Props) {
  const [activeTab, setActiveTab] = useState<ChartTab>('timeline');
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [klines, setKlines] = useState<KlineBar[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setTimeline(null);
    setKlines(null);
    setErrorMessage('');
    setIsFullscreen(false);
  }, [code]);

  useEffect(() => {
    if (!isFullscreen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isFullscreen]);

  useEffect(() => {
    if (activeTab !== 'timeline') return;
    let isCancelled = false;

    const refreshTimeline = async (silent: boolean) => {
      if (!silent) setIsLoading(true);
      try {
        const data = await loadTimeline(code);
        if (!isCancelled) {
          setTimeline(data);
          setErrorMessage('');
        }
      } catch {
        if (!isCancelled && !silent) setErrorMessage('分时数据加载失败');
      } finally {
        if (!isCancelled && !silent) setIsLoading(false);
      }
    };

    void refreshTimeline(false);
    const timer = window.setInterval(() => void refreshTimeline(true), TIMELINE_REFRESH_MS);
    return () => {
      isCancelled = true;
      window.clearInterval(timer);
    };
  }, [activeTab, code, loadTimeline]);

  useEffect(() => {
    if (activeTab === 'timeline') return;
    let isCancelled = false;
    setIsLoading(true);
    setKlines(null);
    setErrorMessage('');

    loadKline(code, activeTab)
      .then((data) => {
        if (!isCancelled) setKlines(data);
      })
      .catch(() => {
        if (!isCancelled) setErrorMessage('K 线数据加载失败');
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [activeTab, code, loadKline]);

  const option = useMemo(() => {
    if (activeTab === 'timeline') {
      return timeline?.data.length ? createTimelineChartOption(timeline, theme) : null;
    }
    return klines?.length
      ? createKlineChartOption(klines, theme, DEFAULT_VISIBLE_KLINE_YEARS)
      : null;
  }, [activeTab, klines, theme, timeline]);

  return (
    <div className={`chart-card${isFullscreen ? ' chart-fullscreen' : ''}`}>
      <div className="chart-tabs">
        {CHART_TABS.map((tab) => (
          <button
            type="button"
            key={tab.key}
            className={`chart-tab${activeTab === tab.key ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
        <button
          type="button"
          className="chart-fullscreen-button"
          aria-label={isFullscreen ? '退出全屏' : '全屏查看图表'}
          title={isFullscreen ? '退出全屏' : '全屏查看图表'}
          onClick={() => setIsFullscreen((current) => !current)}
        >
          {isFullscreen ? '×' : '⛶'}
        </button>
      </div>
      <div className="chart-body">
        {option && <EChart option={option} />}
        {!option && isLoading && <div className="chart-loading">加载中…</div>}
        {!option && !isLoading && errorMessage && (
          <div className="chart-error">{errorMessage}</div>
        )}
        {!option && !isLoading && !errorMessage && (
          <div className="chart-loading">暂无数据</div>
        )}
      </div>
    </div>
  );
}
