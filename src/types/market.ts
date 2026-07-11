import type { Theme } from '../../shared/storage';

export type { Theme };

export type SecurityMarket = 'A' | 'US';
export type FuturesMarket = 'CN' | 'US';
export type TimelineMarket = SecurityMarket | 'FUTURES';
export type KlinePeriod = 'daily' | 'weekly' | 'monthly';
export type ChartTab = 'timeline' | KlinePeriod;

export interface TimelinePoint {
  time: string;
  price: number;
  avgPrice: number | null;
}

export interface TimelineData {
  market: TimelineMarket;
  preClose: number;
  data: TimelinePoint[];
}

export interface KlineBar {
  date: string;
  open: number | null;
  close: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  changePercent: number | null;
}

export interface SecurityQuote {
  code: string;
  name: string;
  market: SecurityMarket;
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  change: number;
  changePercent: number;
  /** A shares use lots; US shares use individual shares. */
  volume: number;
  /** A shares use CNY 10k; US shares use USD. */
  amount: number;
  time: string;
  turnoverRate: number | null;
  pe: number | null;
  pb: number | null;
  amplitude: number | null;
  totalMarketCap: number | null;
  circulatingMarketCap: number | null;
  volumeRatio: number | null;
  high52w: number | null;
  low52w: number | null;
}

export interface FuturesQuote {
  code: string;
  name: string;
  market: FuturesMarket;
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

export interface StockSearchResult {
  code: string;
  name: string;
  market: SecurityMarket;
}

export interface FuturesSearchResult {
  code: string;
  name: string;
  market: FuturesMarket;
}
