import { useEffect, useRef, useState } from 'react';
import {
  searchFutures,
  searchStocks,
} from '../../services/marketData';
import type { WatchItem } from '../../services/storage';
import type {
  FuturesQuote,
  FuturesSearchResult,
  SecurityQuote,
  StockSearchResult,
} from '../../types/market';
import {
  formatCurrencyPrice,
  formatPercent,
  formatSecurityCode,
  getFuturesExchangeInfo,
  getSecurityExchangeInfo,
  getTrendClass,
} from '../../utils/formatters';

export type SidebarTab = 'stock' | 'futures';

interface Props {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  watchlist: WatchItem[];
  quotes: Map<string, SecurityQuote>;
  selected: string | null;
  onSelect: (code: string) => void;
  onAdd: (item: WatchItem) => void;
  onRemove: (code: string) => void;
  futures: WatchItem[];
  futuresQuotes: Map<string, FuturesQuote>;
  selectedFutures: string | null;
  onSelectFutures: (code: string) => void;
  onAddFutures: (item: WatchItem) => void;
  onRemoveFutures: (code: string) => void;
}

export default function Watchlist({
  activeTab,
  onTabChange,
  watchlist,
  quotes,
  selected,
  onSelect,
  onAdd,
  onRemove,
  futures,
  futuresQuotes,
  selectedFutures,
  onSelectFutures,
  onAddFutures,
  onRemoveFutures,
}: Props) {
  const [keyword, setKeyword] = useState('');
  const [stockResults, setStockResults] = useState<StockSearchResult[] | null>(null);
  const [futuresResults, setFuturesResults] = useState<FuturesSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const isFuturesTab = activeTab === 'futures';

  useEffect(() => {
    setKeyword('');
    setStockResults(null);
    setFuturesResults(null);
  }, [activeTab]);

  useEffect(() => {
    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) {
      setStockResults(null);
      setFuturesResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    let isCancelled = false;
    const timer = setTimeout(async () => {
      try {
        if (isFuturesTab) {
          const results = await searchFutures(trimmedKeyword);
          if (!isCancelled) setFuturesResults(results);
        } else {
          const results = await searchStocks(trimmedKeyword);
          if (!isCancelled) setStockResults(results);
        }
      } catch {
        if (!isCancelled) {
          if (isFuturesTab) setFuturesResults([]);
          else setStockResults([]);
        }
      } finally {
        if (!isCancelled) setSearching(false);
      }
    }, 300);
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [keyword, isFuturesTab]);

  useEffect(() => {
    const closeSearchOnOutsideClick = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setKeyword('');
      }
    };
    document.addEventListener('mousedown', closeSearchOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeSearchOnOutsideClick);
  }, []);

  const watchedCodes = new Set(watchlist.map((w) => w.code));
  const futuresCodes = new Set(futures.map((item) => item.code));

  const handlePickStock = (item: StockSearchResult) => {
    if (!watchedCodes.has(item.code)) {
      onAdd(item);
    }
    onSelect(item.code);
    setKeyword('');
  };

  const handlePickFutures = (item: FuturesSearchResult) => {
    if (!futuresCodes.has(item.code)) {
      onAddFutures({ code: item.code, name: item.name });
    }
    onSelectFutures(item.code);
    setKeyword('');
  };

  const results = isFuturesTab ? futuresResults : stockResults;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-tabs">
          <button
            className={`sidebar-tab${!isFuturesTab ? ' active' : ''}`}
            onClick={() => onTabChange('stock')}
          >
            自选
          </button>
          <button
            className={`sidebar-tab${isFuturesTab ? ' active' : ''}`}
            onClick={() => onTabChange('futures')}
          >
            期货
          </button>
        </div>
        <div className="search-box" ref={boxRef}>
          <input
            className="search-input"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={
              isFuturesTab ? '搜索期货品种，如 黄金 / GC' : '搜索 A股 / 美股代码、名称、拼音'
            }
          />
          {keyword.trim() && (
            <div className="search-dropdown">
              {searching ? (
                <div className="search-empty">搜索中…</div>
              ) : results && results.length > 0 ? (
                isFuturesTab ? (
                  futuresResults?.map((result) => {
                    const exchange = getFuturesExchangeInfo(result.name);
                    const isAdded = futuresCodes.has(result.code);
                    return (
                      <div
                        key={result.code}
                        className={`search-item${isAdded ? ' is-added' : ''}`}
                        onClick={() => handlePickFutures(result)}
                      >
                        <span className="name">
                          <span className="market-tag futures" title={exchange.full}>
                            {exchange.label}
                          </span>
                          {result.name}
                        </span>
                        <span className="search-item-meta">
                          <span className="code">{result.code}</span>
                          {isAdded && (
                            <span
                              className="search-added-status"
                              aria-label="已添加"
                              title="已添加"
                            >
                              ✓
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  stockResults?.map((result) => {
                    const exchange = getSecurityExchangeInfo(result.code);
                    const isAdded = watchedCodes.has(result.code);
                    return (
                      <div
                        key={result.code}
                        className={`search-item${isAdded ? ' is-added' : ''}`}
                        onClick={() => handlePickStock(result)}
                      >
                        <span className="name">
                          <span
                            className={`market-tag ${exchange.market === 'US' ? 'us' : 'a'}`}
                            title={exchange.full}
                          >
                            {exchange.label}
                          </span>
                          {result.name}
                        </span>
                        <span className="search-item-meta">
                          <span className="code">{formatSecurityCode(result.code)}</span>
                          {isAdded && (
                            <span
                              className="search-added-status"
                              aria-label="已添加"
                              title="已添加"
                            >
                              ✓
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })
                )
              ) : (
                <div className="search-empty">
                  {isFuturesTab ? '未找到相关期货品种' : '未找到相关股票'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="watch-list">
        {isFuturesTab ? (
          futures.length === 0 ? (
            <div className="watch-empty">
              期货列表为空
              <br />
              使用上方搜索框添加期货
            </div>
          ) : (
            futures.map((item) => {
              const quote = futuresQuotes.get(item.code);
              const trend = getTrendClass(quote?.changePercent);
              const exchange = getFuturesExchangeInfo(quote?.name ?? item.name);
              return (
                <div
                  key={item.code}
                  className={`watch-row${selectedFutures === item.code ? ' active' : ''}`}
                  onClick={() => onSelectFutures(item.code)}
                >
                  <div className="watch-info">
                    <div className="watch-name">{quote?.name || item.name}</div>
                    <div className="watch-code">
                      <span className="market-tag futures" title={exchange.full}>
                        {exchange.label}
                      </span>
                      {item.code}
                    </div>
                  </div>
                  <div className="watch-quote">
                    <div className={`watch-price ${trend}`}>
                      {formatCurrencyPrice(quote?.price, exchange.symbol)}
                    </div>
                    <div className={`watch-percent ${trend}`}>
                      {formatPercent(quote?.changePercent)}
                    </div>
                  </div>
                  <button
                    className="watch-remove"
                    title="移除"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveFutures(item.code);
                    }}
                  >
                    ✕
                  </button>
                </div>
              );
            })
          )
        ) : watchlist.length === 0 ? (
          <div className="watch-empty">
            自选列表为空
            <br />
            使用上方搜索框添加股票
          </div>
        ) : (
          watchlist.map((item) => {
            const quote = quotes.get(item.code);
            const trend = getTrendClass(quote?.changePercent);
            const exchange = getSecurityExchangeInfo(item.code);
            return (
              <div
                key={item.code}
                className={`watch-row${selected === item.code ? ' active' : ''}`}
                onClick={() => onSelect(item.code)}
              >
                <div className="watch-info">
                  <div className="watch-name">{quote?.name || item.name}</div>
                  <div className="watch-code">
                    <span
                      className={`market-tag ${exchange.market === 'US' ? 'us' : 'a'}`}
                      title={exchange.full}
                    >
                      {exchange.label}
                    </span>
                    {formatSecurityCode(item.code)}
                  </div>
                </div>
                <div className="watch-quote">
                  <div className={`watch-price ${trend}`}>
                    {formatCurrencyPrice(quote?.price, exchange.symbol)}
                  </div>
                  <div className={`watch-percent ${trend}`}>
                    {formatPercent(quote?.changePercent)}
                  </div>
                </div>
                <button
                  className="watch-remove"
                  title="移除自选"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(item.code);
                  }}
                >
                  ✕
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
