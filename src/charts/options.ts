import type { EChartsOption } from 'echarts';
import type { KlineBar, Theme, TimelineData } from '../types/market';

const CHART_COLORS = {
  dark: {
    text: '#ffffff',
    text2: '#c3c2b7',
    muted: '#898781',
    grid: '#2c2c2a',
    axis: '#383835',
    up: '#e66767',
    down: '#199e70',
    price: '#3987e5',
    avg: '#c98500',
    tooltipBg: '#232322',
    tooltipBorder: 'rgba(255, 255, 255, 0.1)',
    subtleFill: 'rgba(255, 255, 255, 0.05)',
    accentFill: 'rgba(57, 135, 229, 0.25)',
  },
  light: {
    text: '#191612',
    text2: '#4f4637',
    muted: '#8a7a61',
    grid: 'rgba(55, 45, 28, 0.12)',
    axis: 'rgba(55, 45, 28, 0.22)',
    up: '#c83f3f',
    down: '#13865f',
    price: '#1f6fc9',
    avg: '#b27400',
    tooltipBg: '#fffaf0',
    tooltipBorder: 'rgba(55, 45, 28, 0.14)',
    subtleFill: 'rgba(31, 111, 201, 0.08)',
    accentFill: 'rgba(31, 111, 201, 0.2)',
  },
} as const;

function chartColors(theme: Theme) {
  return CHART_COLORS[theme];
}

function axisCommon(color: ReturnType<typeof chartColors>) {
  return {
    axisLine: { lineStyle: { color: color.axis } },
    axisLabel: { color: color.muted, fontSize: 11 },
    axisTick: { show: false },
  } as const;
}

function tooltipCommon(color: ReturnType<typeof chartColors>) {
  return {
    trigger: 'axis' as const,
    backgroundColor: color.tooltipBg,
    borderColor: color.tooltipBorder,
    textStyle: { color: color.text, fontSize: 12 },
    axisPointer: {
      type: 'cross' as const,
      lineStyle: { color: color.muted },
      crossStyle: { color: color.muted },
      label: { backgroundColor: color.axis },
    },
  };
}

/** A 股完整分时刻度：09:30~11:30 + 13:00~15:00，共 242 个点 */
function fullTradingMinutesA(): string[] {
  const times: string[] = [];
  const push = (h1: number, m1: number, h2: number, m2: number) => {
    let t = h1 * 60 + m1;
    const end = h2 * 60 + m2;
    for (; t <= end; t++) {
      times.push(
        `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
      );
    }
  };
  push(9, 30, 11, 30);
  push(13, 0, 15, 0);
  return times;
}

/** 美股完整分时刻度：09:30~16:00（美东），共 391 个点 */
function fullTradingMinutesUS(): string[] {
  const times: string[] = [];
  for (let t = 9 * 60 + 30; t <= 16 * 60; t++) {
    times.push(
      `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
    );
  }
  return times;
}

/** 分时图：价格线 + 均价线，昨收为基准；A股含盘后，美股 09:30-16:00 */
export function createTimelineChartOption(
  timeline: TimelineData,
  theme: Theme
): EChartsOption {
  const COLOR = chartColors(theme);
  const axis = axisCommon(COLOR);
  const tooltip = tooltipCommon(COLOR);
  const isUS = timeline.market === 'US';
  const isFutures = timeline.market === 'FUTURES';
  // A股：盘后固定价格交易（15:00 之后）数据源返回了才追加刻度
  const baseTimes = isUS ? fullTradingMinutesUS() : fullTradingMinutesA();
  const afterHours = isUS || isFutures
    ? []
    : timeline.data.map((p) => p.time).filter((t) => t > '15:00');
  const times = isFutures ? timeline.data.map((p) => p.time) : [...baseTimes, ...afterHours];
  const byTime = new Map(timeline.data.map((p) => [p.time, p]));
  const prevClose = timeline.preClose;

  const prices: (number | null)[] = times.map((t) => byTime.get(t)?.price ?? null);
  const avgs: (number | null)[] = times.map((t) => byTime.get(t)?.avgPrice ?? null);

  // y 轴围绕昨收对称，保证涨跌幅度视觉上可比
  const valid = timeline.data.map((p) => p.price).filter((v) => v > 0);
  const maxDiff = Math.max(
    ...valid.map((v) => Math.abs(v - prevClose)),
    prevClose * 0.005
  );
  const yMin = prevClose - maxDiff * 1.1;
  const yMax = prevClose + maxDiff * 1.1;

  const tickTimes = isFutures
    ? []
    : isUS
    ? ['09:30', '11:00', '12:30', '14:00', '16:00']
    : ['09:30', '10:30', '11:30', '14:00', '15:00'];
  if (afterHours.length > 0) tickTimes.push(afterHours[afterHours.length - 1]);

  return {
    animation: false,
    grid: { left: 64, right: 64, top: 20, bottom: 28 },
    legend: {
      show: true,
      top: 0,
      right: 70,
      textStyle: { color: COLOR.text2, fontSize: 11 },
      itemWidth: 14,
      itemHeight: 2,
      data: ['价格', '均价'],
    },
    tooltip: {
      ...tooltip,
      formatter: (params) => {
        const list = params as unknown as { axisValue: string; value: number | null }[];
        const price = list[0]?.value;
        if (price == null) return '';
        const t = list[0].axisValue;
        const pct = ((price - prevClose) / prevClose) * 100;
        const avg = list[1]?.value;
        return [
          `<b>${t}${t > '15:00' ? '（盘后）' : ''}</b>`,
          `价格：${price.toFixed(2)}（${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%）`,
          avg != null ? `均价：${avg.toFixed(2)}` : '',
        ]
          .filter(Boolean)
          .join('<br/>');
      },
    },
    xAxis: {
      type: 'category',
      data: times,
      boundaryGap: false,
      ...axis,
      axisLabel: {
        ...axis.axisLabel,
        interval: isFutures
          ? 'auto'
          : (index: number) => tickTimes.includes(times[index]),
        formatter: isFutures
          ? (value: string) => value.slice(11, 16)
          : undefined,
      },
      splitLine: { show: false },
    },
    yAxis: [
      {
        type: 'value',
        min: yMin,
        max: yMax,
        ...axis,
        axisLabel: {
          ...axis.axisLabel,
          formatter: (v: number) => v.toFixed(2),
          color: (v?: string | number) =>
            Number(v) > prevClose ? COLOR.up : Number(v) < prevClose ? COLOR.down : COLOR.muted,
        },
        splitLine: { lineStyle: { color: COLOR.grid } },
      },
      {
        type: 'value',
        min: yMin,
        max: yMax,
        ...axis,
        axisLabel: {
          ...axis.axisLabel,
          formatter: (v: number) =>
            `${(((v - prevClose) / prevClose) * 100).toFixed(2)}%`,
          color: (v?: string | number) =>
            Number(v) > prevClose ? COLOR.up : Number(v) < prevClose ? COLOR.down : COLOR.muted,
        },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '价格',
        type: 'line',
        data: prices,
        showSymbol: false,
        connectNulls: true,
        lineStyle: { color: COLOR.price, width: 1.5 },
        itemStyle: { color: COLOR.price },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: COLOR.accentFill },
              { offset: 1, color: 'rgba(57,135,229,0)' },
            ],
          },
        },
        markLine: {
          silent: true,
          symbol: 'none',
          label: { show: false },
          lineStyle: { color: COLOR.muted, type: 'dashed', width: 1 },
          data: [{ yAxis: prevClose }],
        },
        markPoint: {
          silent: true,
          symbol: 'circle',
          symbolSize: 7,
          label: {
            color: COLOR.text,
            fontSize: 12,
            fontWeight: 700,
            backgroundColor: COLOR.tooltipBg,
            borderColor: COLOR.tooltipBorder,
            borderWidth: 1,
            borderRadius: 4,
            padding: [4, 7],
            shadowBlur: 8,
            shadowColor: 'rgba(0, 0, 0, 0.18)',
            formatter: '{c}',
          },
          data: [
            {
              name: '最高',
              type: 'max',
              valueDim: 'y',
              symbolOffset: [0, -4],
              label: { position: 'top', color: COLOR.up, borderColor: COLOR.up },
              itemStyle: { color: COLOR.up },
            },
            {
              name: '最低',
              type: 'min',
              valueDim: 'y',
              symbolOffset: [0, 4],
              label: { position: 'bottom', color: COLOR.down, borderColor: COLOR.down },
              itemStyle: { color: COLOR.down },
            },
          ],
        },
        markArea:
          afterHours.length > 0 && !isUS
            ? {
                silent: true,
                itemStyle: { color: COLOR.subtleFill },
                label: {
                  show: true,
                  position: 'insideTop',
                  color: COLOR.muted,
                  fontSize: 10,
                },
                data: [
                  [
                    { name: '盘后', xAxis: afterHours[0] },
                    { xAxis: afterHours[afterHours.length - 1] },
                  ],
                ],
              }
            : undefined,
      },
      {
        name: '均价',
        type: 'line',
        data: avgs,
        showSymbol: false,
        connectNulls: true,
        lineStyle: { color: COLOR.avg, width: 1.5 },
        itemStyle: { color: COLOR.avg },
      },
    ],
  };
}

function calculateMovingAverage(
  closes: (number | null)[],
  period: number
): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  let count = 0;
  for (let i = 0; i < closes.length; i++) {
    const v = closes[i];
    if (v == null) {
      out.push(null);
      continue;
    }
    sum += v;
    count++;
    if (count > period) {
      // 回退窗口起点（假定窗口内无 null，A 股日线数据基本连续）
      sum -= closes[i - period] ?? 0;
      count = period;
    }
    out.push(count === period ? sum / period : null);
  }
  return out;
}

function parseKlineDate(value: string): number | null {
  const time = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(time) ? time : null;
}

function calculateDefaultZoomStartValue(
  klines: KlineBar[],
  visibleMonths: number
): string | undefined {
  if (klines.length === 0) return undefined;

  const lastTime = parseKlineDate(klines[klines.length - 1].date);
  if (lastTime == null) return klines[0].date;

  const startDate = new Date(lastTime);
  startDate.setMonth(startDate.getMonth() - visibleMonths);
  const startTime = startDate.getTime();
  const index = klines.findIndex((k) => {
    const time = parseKlineDate(k.date);
    return time != null && time >= startTime;
  });

  return klines[index >= 0 ? index : 0].date;
}

/** K 线图：蜡烛 + MA5/10/20 + 成交量 */
export function createKlineChartOption(
  klines: KlineBar[],
  theme: Theme,
  visibleMonths = 24
): EChartsOption {
  const COLOR = chartColors(theme);
  const axis = axisCommon(COLOR);
  const tooltip = tooltipCommon(COLOR);
  const dates = klines.map((k) => k.date);
  const candles = klines.map((k) => [k.open, k.close, k.low, k.high]);
  const closes = klines.map((k) => k.close);
  const volumes = klines.map((k, i) => ({
    value: k.volume ?? 0,
    itemStyle: {
      color: (k.close ?? 0) >= (k.open ?? 0) ? COLOR.up : COLOR.down,
      opacity: 0.85,
    },
    changePercent: klines[i].changePercent,
  }));

  const maSeries = [5, 10, 20].map((period, i) => ({
    name: `MA${period}`,
    type: 'line' as const,
    data: calculateMovingAverage(closes, period),
    showSymbol: false,
    connectNulls: true,
    lineStyle: { width: 1, color: ['#9085e9', '#c98500', '#3987e5'][i] },
    itemStyle: { color: ['#9085e9', '#c98500', '#3987e5'][i] },
    emphasis: { disabled: true },
  }));
  const zoomStartValue = calculateDefaultZoomStartValue(klines, visibleMonths);
  const zoomEndValue = dates[dates.length - 1];

  return {
    animation: false,
    legend: {
      top: 0,
      left: 10,
      textStyle: { color: COLOR.text2, fontSize: 11 },
      itemWidth: 14,
      itemHeight: 2,
      data: ['MA5', 'MA10', 'MA20'],
    },
    tooltip: {
      ...tooltip,
      axisPointer: {
        ...tooltip.axisPointer,
        label: { show: false },
      },
      formatter: (params) => {
        const list = params as unknown as {
          seriesName: string;
          axisValue: string;
          value: unknown;
        }[];
        const candle = list.find((p) => p.seriesName === 'K线');
        if (!candle) return '';
        // 不用 candle.value：candlestick 在类目轴下 value 首位是类目索引，直接取原始数据
        const k = klines[dates.indexOf(candle.axisValue)];
        if (!k) return '';
        const lines = [
          `<b>${candle.axisValue}</b>`,
          `开：${k.open?.toFixed(2) ?? '--'}　收：${k.close?.toFixed(2) ?? '--'}`,
          `高：${k.high?.toFixed(2) ?? '--'}　低：${k.low?.toFixed(2) ?? '--'}`,
          k.changePercent != null
            ? `涨跌幅：${k.changePercent > 0 ? '+' : ''}${k.changePercent.toFixed(2)}%`
            : '',
        ];
        for (const p of list) {
          if (p.seriesName.startsWith('MA') && typeof p.value === 'number') {
            lines.push(`${p.seriesName}：${p.value.toFixed(2)}`);
          }
        }
        return lines.filter(Boolean).join('<br/>');
      },
    },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    grid: [
      { left: 64, right: 20, top: 28, height: '62%' },
      { left: 64, right: 20, top: '74%', height: '13%' },
    ],
    xAxis: [
      {
        type: 'category',
        data: dates,
        gridIndex: 0,
        boundaryGap: true,
        ...axis,
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      {
        type: 'category',
        data: dates,
        gridIndex: 1,
        boundaryGap: true,
        ...axis,
        splitLine: { show: false },
      },
    ],
    yAxis: [
      {
        type: 'value',
        scale: true,
        gridIndex: 0,
        ...axis,
        axisLabel: { ...axis.axisLabel, formatter: (v: number) => v.toFixed(2) },
        splitLine: { lineStyle: { color: COLOR.grid } },
      },
      {
        type: 'value',
        gridIndex: 1,
        ...axis,
        axisLabel: { show: false },
        splitLine: { show: false },
      },
    ],
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: [0, 1],
        startValue: zoomStartValue,
        endValue: zoomEndValue,
        filterMode: 'filter',
      },
      {
        type: 'slider',
        xAxisIndex: [0, 1],
        startValue: zoomStartValue,
        endValue: zoomEndValue,
        filterMode: 'filter',
        bottom: 8,
        height: 18,
        borderColor: COLOR.axis,
        backgroundColor: 'transparent',
        fillerColor: 'rgba(57,135,229,0.15)',
        handleStyle: { color: COLOR.price },
        textStyle: { color: COLOR.muted, fontSize: 10 },
        dataBackground: {
          lineStyle: { color: COLOR.axis },
          areaStyle: { color: COLOR.subtleFill },
        },
      },
    ],
    series: [
      {
        name: 'K线',
        type: 'candlestick',
        data: candles,
        xAxisIndex: 0,
        yAxisIndex: 0,
        // A 股惯例红涨绿跌；阳线空心（borderColor 描边、填充透明）作为除颜色外的第二区分
        itemStyle: {
          color: 'transparent',
          color0: COLOR.down,
          borderColor: COLOR.up,
          borderColor0: COLOR.down,
        },
        markPoint: {
          silent: true,
          symbol: 'circle',
          symbolSize: 7,
          label: {
            color: COLOR.text,
            fontSize: 12,
            fontWeight: 700,
            backgroundColor: COLOR.tooltipBg,
            borderColor: COLOR.tooltipBorder,
            borderWidth: 1,
            borderRadius: 4,
            padding: [4, 7],
            shadowBlur: 8,
            shadowColor: 'rgba(0, 0, 0, 0.18)',
            formatter: '{c}',
          },
          data: [
            {
              name: '最高',
              type: 'max',
              valueDim: 'highest',
              symbolOffset: [0, -4],
              label: { position: 'top', color: COLOR.up, borderColor: COLOR.up },
              itemStyle: { color: COLOR.up },
            },
            {
              name: '最低',
              type: 'min',
              valueDim: 'lowest',
              symbolOffset: [0, 4],
              label: { position: 'bottom', color: COLOR.down, borderColor: COLOR.down },
              itemStyle: { color: COLOR.down },
            },
          ],
        },
      },
      ...maSeries,
      {
        name: '成交量',
        type: 'bar',
        data: volumes,
        xAxisIndex: 1,
        yAxisIndex: 1,
        barWidth: '60%',
      },
    ],
  };
}
