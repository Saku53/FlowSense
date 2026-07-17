import * as fs from "fs";
import * as path from "path";

export interface Transaction {
  transaction_id: string;
  agent_id: string;
  area: string;
  timestamp: string;
  type: "cash_in" | "cash_out";
  amount: number;
  status: "SUCCESS" | "FAILED" | "DELAYED";
  opening_balance: number;
  current_balance: number;
  event_flags: string;
  case_status: "NONE" | "PENDING_REVIEW" | "UNDER_INVESTIGATION" | "RESOLVED";
  is_ground_truth_anomaly: boolean;
  anomaly_type: string | null;
}

export interface CashDrawerEntry {
  entry_id: string;
  agent_id: string;
  timestamp: string;
  type: "cash_in" | "cash_out" | "rebalance";
  amount: number;
  opening_cash: number;
  current_cash: number;
  provider_ref: "bkash" | "nagad" | "rocket" | "bank";
  provider_txn_id: string | null;
}

// 0. Robust Timestamp Sanitizer to handle Synthetic Delay/Conflict Anomalies (e.g., :60:, :70:, :80: minutes)
export function sanitizeTimestamp(timestamp: string): string {
  if (!timestamp) return timestamp;
  return timestamp
    .replace(/:60:/g, ":00:")
    .replace(/:70:/g, ":10:")
    .replace(/:80:/g, ":20:")
    .replace(/:90:/g, ":30:")
    .replace(/:60/g, ":00")
    .replace(/:70/g, ":10")
    .replace(/:80/g, ":20")
    .replace(/:90/g, ":30");
}

// 1. Festival / Holiday Windows for Bangladesh (Hijri-to-Gregorian)
export const EID_PEAKS = [
  "2024-04-11", // Eid-ul-Fitr 2024
  "2024-06-17", // Eid-ul-Adha 2024
  "2025-03-31", // Eid-ul-Fitr 2025
  "2025-06-07", // Eid-ul-Adha 2025
  "2026-03-20", // Eid-ul-Fitr 2026
  "2026-05-27"  // Eid-ul-Adha 2026
];

export function isFestivalWindow(dateStr: string): boolean {
  const sanitized = sanitizeTimestamp(dateStr);
  const d = new Date(sanitized);
  const time = d.getTime();
  if (isNaN(time)) return false;
  
  for (const peak of EID_PEAKS) {
    const peakTime = new Date(peak).getTime();
    // 5 days leading up to peak, plus peak day itself
    const start = peakTime - 5 * 24 * 60 * 60 * 1000;
    const end = peakTime + 1 * 24 * 60 * 60 * 1000; // include peak day and immediate next day
    if (time >= start && time <= end) {
      return true;
    }
  }
  return false;
}

// Helper to calculate median
export function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[half];
  }
  return (sorted[half - 1] + sorted[half]) / 2.0;
}

// Helper to calculate Median Absolute Deviation (MAD)
export function calculateMAD(values: number[], median: number): number {
  if (values.length === 0) return 0;
  const absoluteDeviations = values.map(v => Math.abs(v - median));
  return calculateMedian(absoluteDeviations);
}

// Bucket Key structure for seasonal baselines
// Key: "hour_dayOfWeek_isFestival" (e.g. "15_4_true" for 3 PM on Thursday during Eid)
export function getBaselineKey(hour: number, dayOfWeek: number, isFestival: boolean): string {
  return `${hour}_${dayOfWeek}_${isFestival ? "1" : "0"}`;
}

export interface BaselineParameters {
  medianCashInRate: number;
  meanCashInRate: number;
  madCashInRate: number;
  medianCashOutRate: number;
  meanCashOutRate: number;
  madCashOutRate: number;
  sampleCount: number;
}

// Continuous Time-Decayed EWMA State
export interface EWMAState {
  cashInRate: number;  // BDT per hour
  cashOutRate: number; // BDT per hour
  lastTimestampMs: number;
}

export class LocalProviderModel {
  public provider: "bkash" | "nagad" | "rocket";
  // Baseline parameters stored locally
  // Key -> BaselineParameters
  public baselines: Record<string, BaselineParameters> = {};
  // Running EWMAs for each agent: agent_id -> { fast, medium, slow }
  public ewmastates: Record<string, {
    fast: EWMAState;   // tau = 15m
    medium: EWMAState; // tau = 30m
    slow: EWMAState;   // tau = 60m
  }> = {};

  constructor(provider: "bkash" | "nagad" | "rocket") {
    this.provider = provider;
  }

  // 1. Train local seasonal baseline locally from private database
  public train(txns: Transaction[]) {
    const buckets: Record<string, { cashInAmounts: number[]; cashOutAmounts: number[] }> = {};
    
    // Group transaction amounts into 1-hour buckets for density estimation
    // To fit hourly rate baselines, we look at the sum of amounts per actual hour-of-history
    const hourlyAggregate: Record<string, { cashIn: number; cashOut: number; timestamp: string }> = {};

    for (const t of txns) {
      if (t.status !== "SUCCESS") continue;
      const sanitizedTimestamp = sanitizeTimestamp(t.timestamp);
      const dateHourStr = sanitizedTimestamp.substring(0, 13); // e.g. "2024-07-17T15"
      if (!hourlyAggregate[dateHourStr]) {
        hourlyAggregate[dateHourStr] = { cashIn: 0, cashOut: 0, timestamp: sanitizedTimestamp };
      }
      if (t.type === "cash_in") {
        hourlyAggregate[dateHourStr].cashIn += t.amount;
      } else {
        hourlyAggregate[dateHourStr].cashOut += t.amount;
      }
    }

    // Now, group these hourly rates (BDT/hour) into seasonal buckets (hour of day, day of week, festival)
    for (const [_, agg] of Object.entries(hourlyAggregate)) {
      const d = new Date(agg.timestamp);
      const hour = d.getUTCHours();
      const dayOfWeek = d.getUTCDay();
      const isFestival = isFestivalWindow(agg.timestamp.split("T")[0]);
      
      const key = getBaselineKey(hour, dayOfWeek, isFestival);
      if (!buckets[key]) {
        buckets[key] = { cashInAmounts: [], cashOutAmounts: [] };
      }
      buckets[key].cashInAmounts.push(agg.cashIn);
      buckets[key].cashOutAmounts.push(agg.cashOut);
    }

    // Calculate statistical parameters for each bucket
    this.baselines = {};
    for (const [key, data] of Object.entries(buckets)) {
      const medianCashIn = calculateMedian(data.cashInAmounts);
      const meanCashIn = data.cashInAmounts.reduce((a, b) => a + b, 0) / Math.max(1, data.cashInAmounts.length);
      const madCashIn = calculateMAD(data.cashInAmounts, medianCashIn);

      const medianCashOut = calculateMedian(data.cashOutAmounts);
      const meanCashOut = data.cashOutAmounts.reduce((a, b) => a + b, 0) / Math.max(1, data.cashOutAmounts.length);
      const madCashOut = calculateMAD(data.cashOutAmounts, medianCashOut);

      this.baselines[key] = {
        medianCashInRate: medianCashIn,
        meanCashInRate: meanCashIn,
        madCashInRate: madCashIn,
        medianCashOutRate: medianCashOut,
        meanCashOutRate: meanCashOut,
        madCashOutRate: madCashOut,
        sampleCount: data.cashInAmounts.length
      };
    }
  }

  // 2. O(1)-amortized streaming update of EWMA rates
  public updateStreamingEWMA(agentId: string, timestamp: string, type: "cash_in" | "cash_out", amount: number) {
    const sanitizedTimestamp = sanitizeTimestamp(timestamp);
    const timeMs = new Date(sanitizedTimestamp).getTime();
    
    if (!this.ewmastates[agentId]) {
      this.ewmastates[agentId] = {
        fast: { cashInRate: 0, cashOutRate: 0, lastTimestampMs: timeMs },
        medium: { cashInRate: 0, cashOutRate: 0, lastTimestampMs: timeMs },
        slow: { cashInRate: 0, cashOutRate: 0, lastTimestampMs: timeMs }
      };
    }

    const state = this.ewmastates[agentId];
    const scales = [
      { key: "fast" as const, tau: 15 },
      { key: "medium" as const, tau: 30 },
      { key: "slow" as const, tau: 60 }
    ];

    for (const scale of scales) {
      const ewma = state[scale.key];
      const dtMs = timeMs - ewma.lastTimestampMs;
      const dtMinutes = Math.max(0, dtMs / (60 * 1000));
      
      const decay = Math.exp(-dtMinutes / scale.tau);
      
      // Update Rates in BDT/hour
      const tauHours = scale.tau / 60;
      ewma.cashInRate = ewma.cashInRate * decay + (type === "cash_in" ? amount : 0) / tauHours;
      ewma.cashOutRate = ewma.cashOutRate * decay + (type === "cash_out" ? amount : 0) / tauHours;
      ewma.lastTimestampMs = timeMs;
    }
  }

  // 3. Export ONLY statistical parameters (satisfies privacy/antitrust constraint)
  public exportStatisticalParameters() {
    return {
      provider: this.provider,
      baselines: this.baselines,
      // Only share high-level metadata of EWMA rates for active agents
      activeAgents: Object.keys(this.ewmastates).map(agentId => ({
        agentId,
        fast: { cashInRate: this.ewmastates[agentId].fast.cashInRate, cashOutRate: this.ewmastates[agentId].fast.cashOutRate, lastTimestampMs: this.ewmastates[agentId].fast.lastTimestampMs },
        medium: { cashInRate: this.ewmastates[agentId].medium.cashInRate, cashOutRate: this.ewmastates[agentId].medium.cashOutRate, lastTimestampMs: this.ewmastates[agentId].medium.lastTimestampMs },
        slow: { cashInRate: this.ewmastates[agentId].slow.cashInRate, cashOutRate: this.ewmastates[agentId].slow.cashOutRate, lastTimestampMs: this.ewmastates[agentId].slow.lastTimestampMs }
      }))
    };
  }
}

// 4. Shared Control Tower (Federated Aggregation Model)
export class SharedControlTower {
  private providerParameters: Record<string, ReturnType<LocalProviderModel["exportStatisticalParameters"]>> = {};
  
  // Shared Cash Drawer running rates: agent_id -> { fast, medium, slow }
  public drawerEWMAs: Record<string, {
    fast: EWMAState;
    medium: EWMAState;
    slow: EWMAState;
  }> = {};

  // Register statistical parameters from private providers
  public registerProviderParameters(params: ReturnType<LocalProviderModel["exportStatisticalParameters"]>) {
    this.providerParameters[params.provider] = params;
  }

  // Update cash drawer streaming EWMA (shared across all providers)
  public updateDrawerEWMA(agentId: string, timestamp: string, type: "cash_in" | "cash_out" | "rebalance", amount: number) {
    const sanitizedTimestamp = sanitizeTimestamp(timestamp);
    const timeMs = new Date(sanitizedTimestamp).getTime();

    if (!this.drawerEWMAs[agentId]) {
      this.drawerEWMAs[agentId] = {
        fast: { cashInRate: 0, cashOutRate: 0, lastTimestampMs: timeMs },
        medium: { cashInRate: 0, cashOutRate: 0, lastTimestampMs: timeMs },
        slow: { cashInRate: 0, cashOutRate: 0, lastTimestampMs: timeMs }
      };
    }

    const state = this.drawerEWMAs[agentId];
    const scales = [
      { key: "fast" as const, tau: 15 },
      { key: "medium" as const, tau: 30 },
      { key: "slow" as const, tau: 60 }
    ];

    for (const scale of scales) {
      const ewma = state[scale.key];
      const dtMs = timeMs - ewma.lastTimestampMs;
      const dtMinutes = Math.max(0, dtMs / (60 * 1000));
      const decay = Math.exp(-dtMinutes / scale.tau);
      const tauHours = scale.tau / 60;

      // Note:
      // For physical cash drawer:
      // - cash_in (deposits) increases physical cash
      // - cash_out (withdrawals) decreases physical cash
      // We track cash drawer inflows and outflows separately
      ewma.cashInRate = ewma.cashInRate * decay + (type === "cash_in" ? amount : 0) / tauHours;
      ewma.cashOutRate = ewma.cashOutRate * decay + (type === "cash_out" ? amount : 0) / tauHours;
      ewma.lastTimestampMs = timeMs;
    }
  }

  // 5. O(1) Confidence and Fallback Scoring Engine
  public calculateConfidence(
    provider: string,
    key: string,
    lastTxnTimeMs: number,
    currentEvalTimeMs: number,
    hasConflicts: boolean
  ): { confidence: number; reason: string; useFallback: boolean } {
    const params = this.providerParameters[provider];
    if (!params) {
      return { confidence: 0, reason: "No provider data found", useFallback: true };
    }

    const baseline = params.baselines[key];
    const sampleCount = baseline ? baseline.sampleCount : 0;

    // 1. Sample count confidence: more samples = higher confidence
    // O(1) function: 1 - exp(-sampleCount / 10)
    const sampleConfidence = 1 - Math.exp(-sampleCount / 10);

    // 2. Staleness penalty: decays confidence if no recent transactions
    // If the feed is silent for more than 4 hours, decay begins
    const stalenessMs = currentEvalTimeMs - lastTxnTimeMs;
    const stalenessHours = Math.max(0, stalenessMs / (1000 * 60 * 60));
    const stalenessFactor = Math.exp(-Math.max(0, stalenessHours - 4) / 12); // decays over 12 hour scale

    // 3. Conflict penalty: severe penalty if feed conflict detected
    const conflictFactor = hasConflicts ? 0.4 : 1.0;

    const finalConfidence = sampleConfidence * stalenessFactor * conflictFactor;
    const useFallback = finalConfidence < 0.45;

    let reason = "High confidence baseline fit";
    if (sampleCount < 5) {
      reason = `Insufficient baseline samples (${sampleCount})`;
    } else if (stalenessHours > 8) {
      reason = `Data feed stale by ${stalenessHours.toFixed(1)}h`;
    } else if (hasConflicts) {
      reason = "Active feed conflict / ledger mismatch detected";
    }

    return {
      confidence: Math.round(finalConfidence * 100) / 100,
      reason,
      useFallback
    };
  }

  // 6. Blended Forecasting Simulation
  // Projects balance and drawer over a horizon (H hours)
  public forecastLiquidity(
    agentId: string,
    provider: "bkash" | "nagad" | "rocket",
    currentBalance: number,
    currentCashDrawer: number,
    currentTimeStr: string,
    lastTxnTimeMs: number,
    hasConflicts: boolean,
    horizonHours: number = 12
  ) {
    const sanitizedTimeStr = sanitizeTimestamp(currentTimeStr);
    const evalTimeMs = new Date(sanitizedTimeStr).getTime();
    const d = new Date(sanitizedTimeStr);
    const hour = d.getUTCHours();
    const dayOfWeek = d.getUTCDay();
    const isFest = isFestivalWindow(sanitizedTimeStr.split("T")[0]);
    const key = getBaselineKey(hour, dayOfWeek, isFest);

    // Calculate confidence
    const { confidence, reason, useFallback } = this.calculateConfidence(
      provider,
      key,
      lastTxnTimeMs,
      evalTimeMs,
      hasConflicts
    );

    // Fetch exported statistical parameters
    const params = this.providerParameters[provider];
    const baseline = params ? params.baselines[key] : null;

    // Running EWMA rates (slow timescale represents steady hourly rate)
    const agentEWMA = params?.activeAgents.find(a => a.agentId === agentId);
    const ewmaCashInRate = agentEWMA ? agentEWMA.medium.cashInRate : 0;
    const ewmaCashOutRate = agentEWMA ? agentEWMA.medium.cashOutRate : 0;

    // Baseline rates
    let baseCashInRate = baseline ? baseline.medianCashInRate : 10000;
    let baseCashOutRate = baseline ? baseline.medianCashOutRate : 10000;
    let madCashIn = baseline ? baseline.madCashInRate : 2000;
    let madCashOut = baseline ? baseline.madCashOutRate : 2000;

    // Blending rates: Blended = Confidence * EWMA + (1 - Confidence) * Baseline
    let blendedCashIn = confidence * ewmaCashInRate + (1 - confidence) * baseCashInRate;
    let blendedCashOut = confidence * ewmaCashOutRate + (1 - confidence) * baseCashOutRate;

    // Safer Fallback Degradation:
    // When confidence is low, we degrade to a conservative high-stress fallback estimate
    // to avoid underestimating risk (i.e. we assume a high-outflow scenario)
    if (useFallback) {
      // High-outflow fallback: take baseline + 1.5x MAD for outflows, and baseline - 1.0x MAD for inflows
      blendedCashOut = baseCashOutRate + 1.5 * madCashOut;
      blendedCashIn = Math.max(0, baseCashInRate - 1.0 * madCashIn);
    }

    // Shared Cash Drawer overall rates (combining all providers)
    const drawerState = this.drawerEWMAs[agentId];
    const drawerInRate = drawerState ? drawerState.medium.cashInRate : 20000;
    const drawerOutRate = drawerState ? drawerState.medium.cashOutRate : 20000;

    // Projected states over horizon (step-by-step forecast)
    const projection: Array<{
      hour: number;
      balance: number;
      balanceMin: number;
      balanceMax: number;
      drawer: number;
      drawerMin: number;
      drawerMax: number;
    }> = [];

    let tempBalance = currentBalance;
    let tempDrawer = currentCashDrawer;

    for (let h = 1; h <= horizonHours; h++) {
      // Rate effects:
      // bKash digital balance increases with Cash-Out, decreases with Cash-In
      tempBalance += (blendedCashOut - blendedCashIn);
      // Cash drawer increases with Cash-In, decreases with Cash-Out (this is provider specific but let's assume total drawer flow matches overall drawer rates)
      // Overall drawer rate: drawerInRate - drawerOutRate
      tempDrawer += (drawerInRate - drawerOutRate);

      // Uncertainty ranges using square-root-of-time scaling of MAD
      const uncertaintyFactor = Math.sqrt(h);
      const balanceMADSum = (madCashIn + madCashOut) * uncertaintyFactor;
      const drawerMADSum = (madCashIn + madCashOut) * 1.5 * uncertaintyFactor; // larger variance on cash drawer

      projection.push({
        hour: h,
        balance: Math.round(Math.max(0, tempBalance)),
        balanceMin: Math.round(Math.max(0, tempBalance - 1.96 * balanceMADSum)),
        balanceMax: Math.round(tempBalance + 1.96 * balanceMADSum),
        drawer: Math.round(Math.max(0, tempDrawer)),
        drawerMin: Math.round(Math.max(0, tempDrawer - 1.96 * drawerMADSum)),
        drawerMax: Math.round(tempDrawer + 1.96 * drawerMADSum)
      });
    }

    // Shortage prediction detection
    let projectedShortageHour: number | null = null;
    let projectedShortageType: "NONE" | "EMONEY" | "DRAWER" | "BOTH" = "NONE";

    for (const step of projection) {
      const balanceLow = step.balance <= 0 || step.balanceMin <= 0;
      const drawerLow = step.drawer <= 0 || step.drawerMin <= 0;

      if (balanceLow && drawerLow) {
        projectedShortageHour = step.hour;
        projectedShortageType = "BOTH";
        break;
      } else if (balanceLow) {
        projectedShortageHour = step.hour;
        projectedShortageType = "EMONEY";
        break;
      } else if (drawerLow) {
        projectedShortageHour = step.hour;
        projectedShortageType = "DRAWER";
        break;
      }
    }

    // Generate dynamic Banglish alert based on forecast results
    const alert = this.generateBanglishAlert(
      provider,
      projectedShortageType,
      projectedShortageHour,
      confidence,
      useFallback,
      key
    );

    return {
      provider,
      confidence,
      reason,
      useFallback,
      currentBalance,
      currentCashDrawer,
      forecastRates: {
        cashInRate: Math.round(blendedCashIn),
        cashOutRate: Math.round(blendedCashOut),
        cashInRateRaw: Math.round(ewmaCashInRate),
        cashOutRateRaw: Math.round(ewmaCashOutRate),
        baselineInRate: Math.round(baseCashInRate),
        baselineOutRate: Math.round(baseCashOutRate)
      },
      projectedShortageHour,
      projectedShortageType,
      alert,
      projection
    };
  }

  // 7. Dynamic Banglish / Bengali alerts generator
  private generateBanglishAlert(
    provider: string,
    shortageType: "NONE" | "EMONEY" | "DRAWER" | "BOTH",
    shortageHour: number | null,
    confidence: number,
    useFallback: boolean,
    baselineKey: string
  ): { status: "OK" | "WARNING" | "CRITICAL"; message: string; evidence: string; safetyNextStep: string } {
    if (shortageType === "NONE") {
      return {
        status: "OK",
        message: `${provider.toUpperCase()} operations are fully stable. No immediate liquidity depletion projected.`,
        evidence: `Forecast confidence is ${Math.round(confidence * 100)}%. Cash flows match historical baselines.`,
        safetyNextStep: "Maintain standard drawer limits and regular bank rebalancing schedule."
      };
    }

    const brand = provider === "bkash" ? "bKash" : provider === "nagad" ? "Nagad" : "Rocket";
    const timeText = shortageHour === 1 ? "1 hour" : `${shortageHour} hours`;
    
    let message = "";
    let evidence = "";
    let safetyNextStep = "";
    let status: "WARNING" | "CRITICAL" = shortageHour && shortageHour <= 3 ? "CRITICAL" : "WARNING";

    if (shortageType === "EMONEY") {
      message = `⚠️ ASTE SHOBDHAN! ${brand} digital reserves are running extremely dry! Projected depletion within ${timeText}.`;
      evidence = `High Cash-In rate forecast (${brand} balances depleting) on seasonal bucket [${baselineKey}]. Confidence index: ${confidence}.`;
      safetyNextStep = `Please execute an urgent TOP-UP on your ${brand} digital wallet. Consider transferring physical cash from your shared drawer back to the bank.`;
    } else if (shortageType === "DRAWER") {
      message = `⚠️ SHOBDHAN! Shared physical cash drawer is exhausting! Projected depletion within ${timeText}.`;
      evidence = `Heavy Cash-Out withdrawals draining shared physical reserves. Model confidence: ${confidence}.`;
      safetyNextStep = "URGENT: Arrange additional physical cash from your corporate bank. Limit high-value single cash-outs until rebalanced.";
    } else {
      message = `🚨 URGENT LIQUIDITY CRUNCH! Both ${brand} e-money and physical drawer cash are collapsing in ${timeText}!`;
      evidence = `Unbalanced multi-provider cash runs. Fallback safety mode activated: ${useFallback ? "YES" : "NO"}.`;
      safetyNextStep = "STOP: Suspend large cash-out transactions. Visit nearest bank branch immediately to split balances and replenish cash drawer.";
    }

    return {
      status,
      message,
      evidence,
      safetyNextStep
    };
  }
}
