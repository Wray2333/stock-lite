import PriceChart from './PriceChart';
import StatsPanel, { type DetailStat } from './StatsPanel';
import ThemeToggle from '../common/ThemeToggle';
import {
  fetchSecurityKline,
  fetchSecurityTimeline,
} from '../../services/marketData';
import type { SecurityQuote, Theme } from '../../types/market';
import {
  formatChange,
  formatMarketCap,
  formatPercent,
  formatPrice,
  formatRatio,
  formatSecurityCode,
  formatTurnoverAmount,
  formatVolume,
  getTrendClass,
} from '../../utils/formatters';

interface Props {
  code: string;
  quote: SecurityQuote | undefined;
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
  const trend = getTrendClass(quote?.changePercent);
  const market = quote?.market ?? (code.startsWith('us') ? 'US' : 'A');
  const compareWithPreviousClose = (value: number | null | undefined) =>
    getTrendClass(value != null && quote?.prevClose ? value - quote.prevClose : null);

  const stats: DetailStat[] = [
    { label: '今开', full: '今开', value: formatPrice(quote?.open), cls: compareWithPreviousClose(quote?.open) },
    { label: '昨收', full: '昨收', value: formatPrice(quote?.prevClose) },
    { label: '最高', full: '最高', value: formatPrice(quote?.high), cls: compareWithPreviousClose(quote?.high) },
    { label: '最低', full: '最低', value: formatPrice(quote?.low), cls: compareWithPreviousClose(quote?.low) },
    { label: '总量', full: '成交量', value: formatVolume(quote?.volume, market) },
    { label: '总额', full: '成交额', value: formatTurnoverAmount(quote?.amount, market) },
    { label: '换手', full: '换手率', value: formatRatio(quote?.turnoverRate, '%') },
    { label: '量比', full: '量比', value: formatRatio(quote?.volumeRatio) },
    { label: '振幅', full: '振幅', value: formatRatio(quote?.amplitude, '%') },
    { label: '市盈', full: '市盈率(TTM)', value: formatRatio(quote?.pe) },
    { label: '市净', full: '市净率', value: formatRatio(quote?.pb) },
    { label: '总值', full: '总市值', value: formatMarketCap(quote?.totalMarketCap, market) },
    { label: '流值', full: '流通市值', value: formatMarketCap(quote?.circulatingMarketCap, market) },
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
            <span className="detail-code">{formatSecurityCode(code)}</span>
            {quote?.time && (
              <span className="detail-time">
                {quote.time}{market === 'US' ? '（美东）' : ''}
              </span>
            )}
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
        loadTimeline={fetchSecurityTimeline}
        loadKline={fetchSecurityKline}
      />
    </main>
  );
}
