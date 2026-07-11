import PriceChart from './PriceChart';
import StatsPanel, { type DetailStat } from './StatsPanel';
import ThemeToggle from '../common/ThemeToggle';
import {
  fetchFuturesKline,
  fetchFuturesTimeline,
} from '../../services/marketData';
import type { FuturesQuote, Theme } from '../../types/market';
import {
  formatChange,
  formatPercent,
  formatPrice,
  formatVolume,
  getFuturesExchangeInfo,
  getTrendClass,
} from '../../utils/formatters';

interface Props {
  code: string;
  name?: string;
  quote: FuturesQuote | undefined;
  theme: Theme;
  onToggleTheme: () => void;
  onShowSidebar?: () => void;
}

export default function FuturesDetail({
  code,
  name,
  quote,
  theme,
  onToggleTheme,
  onShowSidebar,
}: Props) {
  const displayName = quote?.name || name || code;
  const exchange = getFuturesExchangeInfo(displayName);
  const trend = getTrendClass(quote?.changePercent);
  const compareWithPreviousSettle = (value: number | null | undefined) =>
    getTrendClass(value != null && quote?.prevSettle ? value - quote.prevSettle : null);

  const stats: DetailStat[] = [
    { label: '今开', full: '今开', value: formatPrice(quote?.open), cls: compareWithPreviousSettle(quote?.open) },
    { label: '昨结', full: '昨日结算价', value: formatPrice(quote?.prevSettle) },
    { label: '最高', full: '最高', value: formatPrice(quote?.high), cls: compareWithPreviousSettle(quote?.high) },
    { label: '最低', full: '最低', value: formatPrice(quote?.low), cls: compareWithPreviousSettle(quote?.low) },
    { label: '总量', full: '成交量', value: formatVolume(quote?.volume) },
    { label: '持仓', full: '持仓量', value: formatVolume(quote?.openInterest) },
    { label: '买量', full: '买盘量', value: formatVolume(quote?.buyVolume) },
    { label: '卖量', full: '卖盘量', value: formatVolume(quote?.sellVolume) },
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
            <span className="detail-time" title={exchange.full}>
              {exchange.label} · {exchange.symbol}
            </span>
          </div>
          <div className="detail-price-row">
            <span className={`detail-price ${trend}`}>{formatPrice(quote?.price)}</span>
            <span className={`detail-change ${trend}`}>
              {formatChange(quote?.change)}　{formatPercent(quote?.changePercent)}
            </span>
          </div>
        </div>
        <StatsPanel stats={stats} />
      </div>
      <PriceChart
        code={code}
        theme={theme}
        loadTimeline={fetchFuturesTimeline}
        loadKline={fetchFuturesKline}
      />
    </main>
  );
}
