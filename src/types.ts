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

export interface AuditLogEntry {
  audit_id: string;
  timestamp: string;
  username: string;
  role: string;
  action: string;
  scope: string;
  status: string;
  hash: string;
}

export interface User {
  username: string;
  role: string;
  scope: string;
  description: string;
}

export interface AggregatedSummary {
  totalVolume: number;
  totalTransactions: number;
  bkashVolume: number;
  nagadVolume: number;
  rocketVolume: number;
  bkashShare: number;
  nagadShare: number;
  rocketShare: number;
  totalAnomalies: number;
  activeUnresolvedAnomalies: number;
}

export interface LiquiditySummary {
  agentId: string;
  bkash: number;
  nagad: number;
  rocket: number;
  cashDrawer: number;
  digitalTotal: number;
  totalLiquidity: number;
  digitalPercentage: number;
  cashPercentage: number;
  pressureLevel: string;
  pressureDetails: string;
  score: number;
}

export interface DailyTrend {
  date: string;
  bkash: number;
  nagad: number;
  rocket: number;
  total: number;
}

export interface StreamingAlert {
  alert_id: string;
  timestamp: string;
  agent_id: string;
  provider: "bkash" | "nagad" | "rocket";
  transaction_id: string;
  amount: number;
  type: string;
  severity: "OK" | "WARNING" | "CRITICAL";
  case_status: "OPEN" | "ACKNOWLEDGED" | "ESCALATED" | "RESOLVED";
  owner: string;
  notes: string[];
  auditable_history: Array<{
    timestamp: string;
    action: string;
    actor: string;
    notes: string;
  }>;
  evidence: {
    situation: string;
    reason: string;
    evidence: string;
    uncertainty: string;
    safetyNextStep: string;
  };
}

export interface AnalyticsResponse {
  summary: AggregatedSummary;
  liquidity: LiquiditySummary[];
  dailyTrends: DailyTrend[];
}
