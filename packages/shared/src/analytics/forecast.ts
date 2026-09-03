/**
 * Short-horizon forecasting for camp planning:
 *   - walk-in footfall per camp (staffing),
 *   - drug consumption and days-to-stockout (supply chain).
 *
 * Holt's linear trend method is used rather than a heavier model because a
 * gathering runs for days-to-weeks, so there is never enough history to fit
 * seasonality, and an officer must be able to see why a number moved.
 */

export interface HoltOptions {
  /** Level smoothing. */
  alpha?: number;
  /** Trend smoothing. */
  beta?: number;
}

export interface ForecastPoint {
  step: number;
  value: number;
  lower: number;
  upper: number;
}

export interface ForecastResult {
  fitted: number[];
  forecast: ForecastPoint[];
  level: number;
  trend: number;
  /** Root mean squared error of the one-step-ahead fit. */
  rmse: number;
}

/** Holt's linear (double exponential) smoothing with a naive prediction band. */
export function holtLinear(series: number[], horizon = 3, options: HoltOptions = {}): ForecastResult {
  const alpha = options.alpha ?? 0.5;
  const beta = options.beta ?? 0.3;

  if (series.length === 0) {
    return { fitted: [], forecast: [], level: 0, trend: 0, rmse: 0 };
  }
  if (series.length === 1) {
    const v = series[0]!;
    return {
      fitted: [v],
      forecast: Array.from({ length: horizon }, (_, i) => ({ step: i + 1, value: v, lower: v, upper: v })),
      level: v,
      trend: 0,
      rmse: 0,
    };
  }

  let level = series[0]!;
  let trend = series[1]! - series[0]!;
  const fitted: number[] = [level];
  const errors: number[] = [];

  for (let t = 1; t < series.length; t += 1) {
    const prediction = level + trend;
    fitted.push(prediction);
    errors.push(series[t]! - prediction);

    const prevLevel = level;
    level = alpha * series[t]! + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }

  const rmse = errors.length > 0 ? Math.sqrt(errors.reduce((a, e) => a + e * e, 0) / errors.length) : 0;

  const forecast: ForecastPoint[] = Array.from({ length: horizon }, (_, i) => {
    const step = i + 1;
    const value = level + step * trend;
    // The band widens with the square root of the horizon, the usual
    // random-walk approximation for a short forecast.
    const spread = 1.96 * rmse * Math.sqrt(step);
    return {
      step,
      value: round(Math.max(0, value)),
      lower: round(Math.max(0, value - spread)),
      upper: round(Math.max(0, value + spread)),
    };
  });

  return { fitted: fitted.map(round), forecast, level: round(level), trend: round(trend), rmse: round(rmse) };
}

export interface StockPosition {
  drugCode: string;
  drugName: string;
  onHand: number;
  reorderLevel: number;
  /** Units issued per day, oldest first. */
  dailyConsumption: number[];
}

export const STOCK_RISKS = ['OK', 'WATCH', 'LOW', 'STOCKOUT_IMMINENT', 'OUT_OF_STOCK'] as const;
export type StockRisk = (typeof STOCK_RISKS)[number];

export interface StockProjection {
  drugCode: string;
  drugName: string;
  onHand: number;
  /** Forecast burn rate for tomorrow, units/day. */
  projectedDailyBurn: number;
  daysToStockout: number | null;
  risk: StockRisk;
  reorderQuantity: number;
}

/**
 * Project days-to-stockout from the forecast burn rate rather than a flat
 * average, so a camp whose footfall is climbing is flagged before it runs dry.
 */
export function projectStock(position: StockPosition, coverDays = 3): StockProjection {
  const { forecast } = holtLinear(position.dailyConsumption, 1);
  const recent = position.dailyConsumption.slice(-3);
  const average = recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  const burn = Math.max(forecast[0]?.value ?? 0, average);

  const daysToStockout = burn > 0 ? round(position.onHand / burn) : null;

  let risk: StockRisk = 'OK';
  if (position.onHand <= 0) risk = 'OUT_OF_STOCK';
  else if (daysToStockout !== null && daysToStockout <= 1) risk = 'STOCKOUT_IMMINENT';
  else if (position.onHand <= position.reorderLevel) risk = 'LOW';
  else if (daysToStockout !== null && daysToStockout <= coverDays) risk = 'WATCH';

  const target = Math.ceil(burn * coverDays) + position.reorderLevel;
  return {
    drugCode: position.drugCode,
    drugName: position.drugName,
    onHand: position.onHand,
    projectedDailyBurn: round(burn),
    daysToStockout,
    risk,
    reorderQuantity: Math.max(0, target - position.onHand),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
