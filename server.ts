import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import express from "express";
import * as fs from "fs";
import * as path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { LocalProviderModel, SharedControlTower, sanitizeTimestamp } from "./server/liquidityEngine";
import { StreamingAnomalyDetector, StreamingAlert } from "./server/anomalyDetector";

const app = express();
const PORT = 3000;

app.use(express.json());

// In-Memory Data Cache
interface Transaction {
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

interface CashDrawerEntry {
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

interface User {
  username: string;
  password?: string;
  role: string;
  scope: string;
  description: string;
}

let bkashCache: Transaction[] = [];
let nagadCache: Transaction[] = [];
let rocketCache: Transaction[] = [];
let drawerCache: CashDrawerEntry[] = [];
let usersList: User[] = [];

// Parse CSV lines handling quotes and escaped commas
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// Convert CSV String to JSON Array
function csvToJSON<T>(csvContent: string, headers: string[]): T[] {
  const lines = csvContent.split("\n").filter(l => l.trim().length > 0);
  if (lines.length <= 1) return [];
  const result: T[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const obj: any = {};
    headers.forEach((header, index) => {
      let val: any = values[index] !== undefined ? values[index] : "";
      // Convert types
      if (val === "true") val = true;
      else if (val === "false") val = false;
      else if (!isNaN(Number(val)) && val !== "") {
        val = Number(val);
      }
      obj[header] = val;
    });
    result.push(obj as T);
  }
  return result;
}

// Convert JSON Array back to CSV String
function jsonToCSV(data: any[], headers: string[]): string {
  const csvRows = [headers.join(",")];
  for (const row of data) {
    const values = headers.map(header => {
      const val = row[header];
      if (val === null || val === undefined) return "";
      const valStr = String(val);
      if (valStr.includes(",") || valStr.includes("\"") || valStr.includes("\n")) {
        return `"${valStr.replace(/"/g, '""')}"`;
      }
      return valStr;
    });
    csvRows.push(values.join(","));
  }
  return csvRows.join("\n");
}

const txnHeaders = [
  "transaction_id",
  "agent_id",
  "area",
  "timestamp",
  "type",
  "amount",
  "status",
  "opening_balance",
  "current_balance",
  "event_flags",
  "case_status",
  "is_ground_truth_anomaly",
  "anomaly_type"
];

// Load Database Files on Startup
function loadDatabase() {
  try {
    const dbDir = path.join(process.cwd(), "db_files");
    
    // Load Users
    const usersPath = path.join(dbDir, "users.json");
    if (fs.existsSync(usersPath)) {
      usersList = JSON.parse(fs.readFileSync(usersPath, "utf-8"));
    }

    // Load Providers Data
    const bkashPath = path.join(dbDir, "bkash.csv");
    if (fs.existsSync(bkashPath)) {
      bkashCache = csvToJSON<Transaction>(fs.readFileSync(bkashPath, "utf-8"), txnHeaders);
    }
    const nagadPath = path.join(dbDir, "nagad.csv");
    if (fs.existsSync(nagadPath)) {
      nagadCache = csvToJSON<Transaction>(fs.readFileSync(nagadPath, "utf-8"), txnHeaders);
    }
    const rocketPath = path.join(dbDir, "rocket.csv");
    if (fs.existsSync(rocketPath)) {
      rocketCache = csvToJSON<Transaction>(fs.readFileSync(rocketPath, "utf-8"), txnHeaders);
    }

    // Load Cash Drawer Ledger
    const drawerPath = path.join(dbDir, "cash_drawer_ledger.csv");
    if (fs.existsSync(drawerPath)) {
      const drawerHeaders = ["entry_id", "agent_id", "timestamp", "type", "amount", "opening_cash", "current_cash", "provider_ref", "provider_txn_id"];
      drawerCache = csvToJSON<CashDrawerEntry>(fs.readFileSync(drawerPath, "utf-8"), drawerHeaders);
    }

    console.log(`Database loaded. bKash: ${bkashCache.length}, Nagad: ${nagadCache.length}, Rocket: ${rocketCache.length}, Drawer Ledger: ${drawerCache.length}`);
  } catch (error) {
    console.error("Error loading CSV database files:", error);
  }
}

loadDatabase();

// --- LIQUIDITY FORECASTING ENGINE INITIALIZATION ---
const bkashModel = new LocalProviderModel("bkash");
const nagadModel = new LocalProviderModel("nagad");
const rocketModel = new LocalProviderModel("rocket");
const sharedTower = new SharedControlTower();

function getLatestSimTime(): string {
  let latest = 0;
  const check = (txns: any[]) => {
    if (txns.length > 0) {
      const sorted = [...txns].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      const t = new Date(sanitizeTimestamp(sorted[0].timestamp)).getTime();
      if (t > latest) latest = t;
    }
  };
  check(bkashCache);
  check(nagadCache);
  check(rocketCache);
  return latest > 0 ? new Date(latest).toISOString() : new Date("2026-07-17T08:00:00Z").toISOString();
}

function initializeLiquidityEngine() {
  console.log("Initializing and training Liquidity Forecasting Engine...");
  
  // Train local provider baselines on the caches
  bkashModel.train(bkashCache);
  nagadModel.train(nagadCache);
  rocketModel.train(rocketCache);
  
  // Build streaming EWMAs sequentially to match the end state of the training data
  const allTxns = [
    ...bkashCache.map(t => ({ ...t, provider: "bkash" as const })),
    ...nagadCache.map(t => ({ ...t, provider: "nagad" as const })),
    ...rocketCache.map(t => ({ ...t, provider: "rocket" as const }))
  ].filter(t => t.status === "SUCCESS")
   .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  for (const t of allTxns) {
    if (t.provider === "bkash") bkashModel.updateStreamingEWMA(t.agent_id, t.timestamp, t.type, t.amount);
    else if (t.provider === "nagad") nagadModel.updateStreamingEWMA(t.agent_id, t.timestamp, t.type, t.amount);
    else if (t.provider === "rocket") rocketModel.updateStreamingEWMA(t.agent_id, t.timestamp, t.type, t.amount);
  }

  // Build cash drawer EWMAs
  const sortedDrawer = [...drawerCache].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  for (const d of sortedDrawer) {
    sharedTower.updateDrawerEWMA(d.agent_id, d.timestamp, d.type, d.amount);
  }

  // Register provider statistical parameters in the shared control tower
  sharedTower.registerProviderParameters(bkashModel.exportStatisticalParameters());
  sharedTower.registerProviderParameters(nagadModel.exportStatisticalParameters());
  sharedTower.registerProviderParameters(rocketModel.exportStatisticalParameters());

  console.log("Liquidity Forecasting Engine trained and initialized successfully.");
}

initializeLiquidityEngine();

// --- ANOMALY DETECTION ENGINE INITIALIZATION ---
const anomalyDetector = new StreamingAnomalyDetector();

function initializeAnomalyEngine() {
  console.log("Initializing and training Anomaly Detection Engine...");
  
  // Combine individual provider baselines into a dictionary for seasonal adjustment lookup
  const baselinesLookup: Record<string, any> = {};
  const mergeBaselines = (baselines: Record<string, any>) => {
    for (const [k, v] of Object.entries(baselines)) {
      if (!baselinesLookup[k]) {
        baselinesLookup[k] = { ...v };
      } else {
        baselinesLookup[k].meanCashInRate = (baselinesLookup[k].meanCashInRate + v.meanCashInRate) / 2;
        baselinesLookup[k].meanCashOutRate = (baselinesLookup[k].meanCashOutRate + v.meanCashOutRate) / 2;
      }
    }
  };
  mergeBaselines(bkashModel.baselines);
  mergeBaselines(nagadModel.baselines);
  mergeBaselines(rocketModel.baselines);

  // Run backtest over loaded caches to pre-populate anomalies and warm up trackers
  anomalyDetector.runBacktest(bkashCache, nagadCache, rocketCache, baselinesLookup);
  console.log("Anomaly Detection Engine initialized and backtested successfully.");
}

initializeAnomalyEngine();

// Audit Logging Service
function logAudit(username: string, role: string, action: string, scope: string, status: string) {
  try {
    const auditFile = path.join(process.cwd(), "db_files", "audit_log.csv");
    const timestamp = new Date().toISOString();
    const auditId = `AUD-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
    
    const rowContent = `${auditId},${timestamp},${username},${role},${action},${scope},${status}`;
    // Compute HMAC for cryptographic validation of the audit record
    const hash = crypto.createHmac("sha256", "super-agent-secret").update(rowContent).digest("hex");
    
    const fullRow = `${rowContent},${hash}\n`;
    
    if (!fs.existsSync(auditFile)) {
      const headers = "audit_id,timestamp,username,role,action,scope,status,hash\n";
      fs.writeFileSync(auditFile, headers);
    }
    fs.appendFileSync(auditFile, fullRow);
  } catch (error) {
    console.error("Audit log write error:", error);
  }
}

// Token Verification Middleware
function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  
  if (!token) {
    return res.status(401).json({ error: "Access token is missing" });
  }

  try {
    // Basic verification: Decode the JSON from base64
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
    if (!decoded.username || !decoded.role || !decoded.scope) {
      return res.status(403).json({ error: "Invalid token structure" });
    }
    
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: "Token parse or verification failed" });
  }
}

// API Routes

// Login Stub
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  const foundUser = usersList.find(u => u.username === username);
  if (!foundUser || foundUser.password !== password) {
    return res.status(400).json({ error: "Invalid credentials" });
  }

  // Generate Token containing role and scope claims
  const tokenPayload = {
    username: foundUser.username,
    role: foundUser.role,
    scope: foundUser.scope,
    description: foundUser.description
  };
  const token = Buffer.from(JSON.stringify(tokenPayload)).toString("base64");
  
  logAudit(foundUser.username, foundUser.role, "LOGIN", foundUser.scope, "200_OK");
  
  res.json({ token, user: { username: foundUser.username, role: foundUser.role, scope: foundUser.scope, description: foundUser.description } });
});

// Me endpoint
app.get("/api/auth/me", authenticateToken, (req: any, res) => {
  res.json({ user: req.user });
});

// 1. PROVIDER ISOLATED ENDPOINTS (bKash, Nagad, Rocket transactions)
app.get("/api/:provider/transactions", authenticateToken, (req: any, res) => {
  const provider = req.params.provider;
  if (provider !== "bkash" && provider !== "nagad" && provider !== "rocket") {
    return res.status(404).json({ error: "Provider not found" });
  }

  const user = req.user;
  
  // Row Level Security / Tenant Isolation
  // Rules:
  // - MANAGEMENT role is aggregated-only! Cannot view raw transaction line items at all.
  // - PROVIDER_OPS & RISK_ANALYST can query ALL transactions inside their scoped provider ONLY.
  // - AGENT can query their own shop transactions inside ALL providers they serve.
  // - SHOP_OWNER can view all transaction ledger logs (since they own all 8 shops).
  
  let dataset: Transaction[] = [];
  if (provider === "bkash") dataset = bkashCache;
  else if (provider === "nagad") dataset = nagadCache;
  else dataset = rocketCache;

  let filtered: Transaction[] = [];

  if (user.role === "MANAGEMENT") {
    logAudit(user.username, user.role, `QUERY_${provider.toUpperCase()}_TXNS`, user.scope, "403_FORBIDDEN");
    return res.status(403).json({ error: "Management is restricted to Aggregated Views only. No line-item details permitted." });
  } 
  else if (user.role === "PROVIDER_OPS" || user.role === "RISK_ANALYST") {
    // Scopes must match the provider
    if (user.scope !== provider && user.scope !== "global") {
      logAudit(user.username, user.role, `QUERY_${provider.toUpperCase()}_TXNS`, user.scope, "403_FORBIDDEN");
      return res.status(403).json({ error: `Access Denied. Your scope '${user.scope}' is unauthorized for provider '${provider}'.` });
    }
    filtered = dataset; // Access to all provider rows
  } 
  else if (user.role === "AGENT") {
    // Filters rows down to only their own agent_id
    filtered = dataset.filter(t => t.agent_id === user.scope);
  } 
  else if (user.role === "SHOP_OWNER") {
    filtered = dataset; // Access to all shops
  } 
  else {
    logAudit(user.username, user.role, `QUERY_${provider.toUpperCase()}_TXNS`, user.scope, "403_FORBIDDEN");
    return res.status(403).json({ error: "Unauthorized role claims." });
  }

  // If a risk analyst wants to search, page, or filter anomalies
  const { isAnomaly, agentId, type, page = 1, limit = 50 } = req.query;
  let result = filtered;

  if (isAnomaly === "true") {
    result = result.filter(t => t.is_ground_truth_anomaly === true);
  }
  if (agentId) {
    result = result.filter(t => t.agent_id === agentId);
  }
  if (type) {
    result = result.filter(t => t.type === type);
  }

  // Pagination to keep loads lightning-fast
  const startIdx = (Number(page) - 1) * Number(limit);
  const paginated = result.slice(startIdx, startIdx + Number(limit));

  logAudit(user.username, user.role, `QUERY_${provider.toUpperCase()}_TXNS`, user.scope, "200_OK");
  
  res.json({
    transactions: paginated,
    totalCount: result.length,
    page: Number(page),
    limit: Number(limit)
  });
});

// 2. CASH DRAWER LEDGER (Owned by Agent / Shop Owner)
app.get("/api/drawer/ledger", authenticateToken, (req: any, res) => {
  const user = req.user;
  
  // Rules:
  // - AGENT: sees only their own shop's ledger lines.
  // - SHOP_OWNER: sees all shops' ledger lines.
  // - PROVIDER_OPS / RISK_ANALYST: Forbidden (this is agent private physical cash ledger data!).
  // - MANAGEMENT: Aggregated statistics only.
  
  let filtered: CashDrawerEntry[] = [];
  
  if (user.role === "AGENT") {
    filtered = drawerCache.filter(e => e.agent_id === user.scope);
  } 
  else if (user.role === "SHOP_OWNER") {
    filtered = drawerCache;
  } 
  else if (user.role === "MANAGEMENT") {
    logAudit(user.username, user.role, "QUERY_DRAWER_LEDGER", user.scope, "403_FORBIDDEN");
    return res.status(403).json({ error: "Management is restricted to Aggregated Views only." });
  } 
  else {
    logAudit(user.username, user.role, "QUERY_DRAWER_LEDGER", user.scope, "403_FORBIDDEN");
    return res.status(403).json({ error: "Access Denied. Provider representatives cannot inspect physical cash ledger logs." });
  }

  const { agentId, page = 1, limit = 50 } = req.query;
  let result = filtered;
  if (agentId) {
    result = result.filter(e => e.agent_id === agentId);
  }

  // Sort descending by timestamp
  result = [...result].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const startIdx = (Number(page) - 1) * Number(limit);
  const paginated = result.slice(startIdx, startIdx + Number(limit));

  logAudit(user.username, user.role, "QUERY_DRAWER_LEDGER", user.scope, "200_OK");

  res.json({
    ledger: paginated,
    totalCount: result.length,
    page: Number(page),
    limit: Number(limit)
  });
});

// 3. SECURE CROSS-PROVIDER AGGREGATION ENDPOINT (CROSSING POINT)
app.get("/api/analytics/aggregated", authenticateToken, (req: any, res) => {
  const user = req.user;
  
  // Only aggregated values may cross boundaries!
  // Allowed Roles: MANAGEMENT, SHOP_OWNER, and AGENT (filtered for their own shop).
  // RISK_ANALYST can also see but only for statistics.
  
  let targetAgentId = req.query.agentId as string;
  
  if (user.role === "AGENT") {
    // Agents are strictly bound to their own shop's aggregation metrics
    targetAgentId = user.scope;
  }

  // Let's compute statistics in memory
  // Filter by Agent if specified
  const bkashTxns = targetAgentId ? bkashCache.filter(t => t.agent_id === targetAgentId) : bkashCache;
  const nagadTxns = targetAgentId ? nagadCache.filter(t => t.agent_id === targetAgentId) : nagadCache;
  const rocketTxns = targetAgentId ? rocketCache.filter(t => t.agent_id === targetAgentId) : rocketCache;
  const drawerEntries = targetAgentId ? drawerCache.filter(t => t.agent_id === targetAgentId) : drawerCache;

  // Aggregate Volumes
  const getVol = (txns: Transaction[]) => txns.reduce((acc, t) => acc + (t.status === "SUCCESS" ? t.amount : 0), 0);
  const getCount = (txns: Transaction[]) => txns.length;
  
  const bKashVol = getVol(bkashTxns);
  const nagadVol = getVol(nagadTxns);
  const rocketVol = getVol(rocketTxns);

  const totalVol = bKashVol + nagadVol + rocketVol;
  const totalCount = getCount(bkashTxns) + getCount(nagadTxns) + getCount(rocketTxns);

  // Compute active anomalies count
  const getAnomaliesCount = (txns: Transaction[]) => txns.filter(t => t.is_ground_truth_anomaly).length;
  const totalAnomalies = getAnomaliesCount(bkashTxns) + getAnomaliesCount(nagadTxns) + getAnomaliesCount(rocketTxns);

  const getUnresolvedAnomaliesCount = (txns: Transaction[]) => txns.filter(t => t.is_ground_truth_anomaly && t.case_status === "PENDING_REVIEW").length;
  const activeUnresolvedAnomalies = getUnresolvedAnomaliesCount(bkashTxns) + getUnresolvedAnomaliesCount(nagadTxns) + getUnresolvedAnomaliesCount(rocketTxns);

  // Liquidity Pressure ratios
  // Real agent shops need to keep physical cash vs e-money balanced.
  // Let's find current balances of each provider and current drawer cash.
  // For simplicity, we can get the balance from the last transaction or seed default if no transactions.
  const getLatestBal = (txns: Transaction[], seed: number) => {
    if (txns.length === 0) return seed;
    // Sort txns by timestamp to get latest
    const sorted = [...txns].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return sorted[0].current_balance;
  };

  const getLatestCash = (entries: CashDrawerEntry[], seed: number) => {
    if (entries.length === 0) return seed;
    const sorted = [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return sorted[0].current_cash;
  };

  // Compute aggregated current balances
  const getBalancesAgg = (agentId: string) => {
    const bTx = bkashCache.filter(t => t.agent_id === agentId);
    const nTx = nagadCache.filter(t => t.agent_id === agentId);
    const rTx = rocketCache.filter(t => t.agent_id === agentId);
    const dTx = drawerCache.filter(t => t.agent_id === agentId);

    const bBal = getLatestBal(bTx, 100000);
    const nBal = getLatestBal(nTx, 80000);
    const rBal = getLatestBal(rTx, 50000);
    const cash = getLatestCash(dTx, 150000);

    const digitalTotal = bBal + nBal + rBal;
    const totalLiquidity = digitalTotal + cash;

    // Digital pressure: if digital is low and cash is high, we have digital pressure (cannot do cash-ins).
    // Cash pressure: if cash is low and digital is high, we have physical cash pressure (cannot do cash-outs).
    const digitalPercentage = totalLiquidity > 0 ? (digitalTotal / totalLiquidity) * 100 : 50;
    const cashPercentage = totalLiquidity > 0 ? (cash / totalLiquidity) * 100 : 50;

    let pressureLevel = "STABLE";
    let pressureDetails = "Liquidity levels are within safe operating parameters.";
    let score = 0; // 0 (healthy) to 100 (danger)
    
    if (cashPercentage < 25) {
      pressureLevel = "CRITICAL_PHYSICAL_CASH_SHORTAGE";
      pressureDetails = `Physical cash drawer is near-depletion (${cashPercentage.toFixed(1)}%). Agent cannot fulfill further Cash-Out requests without rebalancing from bank.`;
      score = (25 - cashPercentage) * 4;
    } else if (digitalPercentage < 25) {
      pressureLevel = "CRITICAL_DIGITAL_EMONEY_DRAUGHT";
      pressureDetails = `Digital wallet reserves are near-depletion (${digitalPercentage.toFixed(1)}%). Agent cannot fulfill Cash-In deposits without top-up.`;
      score = (25 - digitalPercentage) * 4;
    } else if (cashPercentage < 35) {
      pressureLevel = "MODERATE_PHYSICAL_CASH_WARNING";
      pressureDetails = `Physical cash reserves are dipping (${cashPercentage.toFixed(1)}%). Rebalance recommended soon.`;
      score = (35 - cashPercentage) * 2;
    } else if (digitalPercentage < 35) {
      pressureLevel = "MODERATE_DIGITAL_EMONEY_WARNING";
      pressureDetails = `Digital reserves are dipping (${digitalPercentage.toFixed(1)}%). Top-up recommended.`;
      score = (35 - digitalPercentage) * 2;
    }

    return {
      agentId,
      bkash: bBal,
      nagad: nBal,
      rocket: rBal,
      cashDrawer: cash,
      digitalTotal,
      totalLiquidity,
      digitalPercentage,
      cashPercentage,
      pressureLevel,
      pressureDetails,
      score: Math.min(100, Math.max(0, Math.round(score)))
    };
  };

  const agentSummaryList = ["AGENT-001", "AGENT-002", "AGENT-003", "AGENT-004", "AGENT-005", "AGENT-006", "AGENT-007", "AGENT-008"];
  const liquiditySummaries = targetAgentId 
    ? [getBalancesAgg(targetAgentId)]
    : agentSummaryList.map(id => getBalancesAgg(id));

  // Daily volume time-series (Aggregated by day over last 180 days to keep UI fast)
  // Maps dayStr -> totalVolume
  const dailyTimeSeries: Record<string, { bkash: number; nagad: number; rocket: number; total: number }> = {};
  
  const mapTxnsToTimeSeries = (txns: Transaction[], prov: "bkash" | "nagad" | "rocket") => {
    for (const t of txns) {
      if (t.status !== "SUCCESS") continue;
      const dateStr = t.timestamp.split("T")[0];
      // Only capture last 180 days in actual time-series to keep JSON transport tiny and super clean
      const cutoffDate = "2026-01-17"; // 6 months before 2026-07-17
      if (dateStr < cutoffDate) continue;

      if (!dailyTimeSeries[dateStr]) {
        dailyTimeSeries[dateStr] = { bkash: 0, nagad: 0, rocket: 0, total: 0 };
      }
      dailyTimeSeries[dateStr][prov] += t.amount;
      dailyTimeSeries[dateStr].total += t.amount;
    }
  };

  mapTxnsToTimeSeries(bkashTxns, "bkash");
  mapTxnsToTimeSeries(nagadTxns, "nagad");
  mapTxnsToTimeSeries(rocketTxns, "rocket");

  // Sort dailyTimeSeries by date
  const sortedSeries = Object.entries(dailyTimeSeries)
    .map(([date, vals]) => ({ date, ...vals }))
    .sort((a, b) => a.date.localeCompare(b.date));

  logAudit(user.username, user.role, "GET_AGGREGATED_ANALYTICS", targetAgentId || "ALL_SHOPS", "200_OK");

  res.json({
    summary: {
      totalVolume: totalVol,
      totalTransactions: totalCount,
      bkashVolume: bKashVol,
      nagadVolume: nagadVol,
      rocketVolume: rocketVol,
      bkashShare: totalVol > 0 ? (bKashVol / totalVol) * 100 : 0,
      nagadShare: totalVol > 0 ? (nagadVol / totalVol) * 100 : 0,
      rocketShare: totalVol > 0 ? (rocketVol / totalVol) * 100 : 0,
      totalAnomalies,
      activeUnresolvedAnomalies
    },
    liquidity: liquiditySummaries,
    dailyTrends: sortedSeries
  });
});

// 4. ACTION ENDPOINT: RISK COMPLIANCE ESCALATION / UPDATE
app.post("/api/actions/escalate", authenticateToken, (req: any, res) => {
  const user = req.user;
  
  // Rules:
  // - ONLY RISK_ANALYST or PROVIDER_OPS can modify case_status
  // - Can only operate on their scoped provider
  if (user.role !== "RISK_ANALYST" && user.role !== "PROVIDER_OPS" && user.role !== "SHOP_OWNER") {
    logAudit(user.username, user.role, "POST_ESCALATE_ACTION", user.scope, "403_FORBIDDEN");
    return res.status(403).json({ error: "Access Denied. Only Compliance Analysts or Provider Ops can update risk status." });
  }

  const { provider, transactionId, status } = req.body;
  if (!provider || !transactionId || !status) {
    return res.status(400).json({ error: "Missing required parameters: provider, transactionId, status" });
  }

  if (user.role === "RISK_ANALYST" || user.role === "PROVIDER_OPS") {
    if (user.scope !== provider && user.scope !== "global") {
      logAudit(user.username, user.role, `ESCALATE_${provider.toUpperCase()}_TXN`, user.scope, "403_FORBIDDEN");
      return res.status(403).json({ error: `Access Denied. Scoped scope '${user.scope}' is unauthorized to modify '${provider}' entries.` });
    }
  }

  // Find transaction
  let cache: Transaction[] = [];
  if (provider === "bkash") cache = bkashCache;
  else if (provider === "nagad") cache = nagadCache;
  else if (provider === "rocket") cache = rocketCache;
  else {
    return res.status(404).json({ error: "Invalid provider specified" });
  }

  const txn = cache.find(t => t.transaction_id === transactionId);
  if (!txn) {
    return res.status(404).json({ error: "Transaction not found" });
  }

  // Update status
  const oldStatus = txn.case_status;
  txn.case_status = status;

  // Persist back to the CSV file to ensure durable state!
  try {
    const dbDir = path.join(process.cwd(), "db_files");
    const filePath = path.join(dbDir, `${provider}.csv`);
    fs.writeFileSync(filePath, jsonToCSV(cache, txnHeaders));
    console.log(`Updated CSV file ${provider}.csv after escalation/status modification`);
  } catch (error) {
    console.error("Failed to write updated transactions CSV to disk:", error);
  }

  logAudit(user.username, user.role, `ESCALATE_TXN_${transactionId}`, `${provider}_${status}`, "200_OK");

  res.json({
    success: true,
    message: `Transaction ${transactionId} updated from ${oldStatus} to ${status} successfully.`,
    transaction: txn
  });
});

// --- ANOMALY & ALERT COORDINATION WORKFLOW ENDPOINTS ---

app.get(["/anomalies/recent", "/api/anomalies/recent"], authenticateToken, (req: any, res) => {
  const user = req.user;
  const { provider, agentId, status, type, page = 1, limit = 50 } = req.query;

  // Compute breakdown counts for management or overall summaries
  const alertsArray = Object.values(anomalyDetector.activeAlerts) as StreamingAlert[];
  const totalCount = alertsArray.length;
  
  const bKashCount = alertsArray.filter(a => a.provider === "bkash").length;
  const nagadCount = alertsArray.filter(a => a.provider === "nagad").length;
  const rocketCount = alertsArray.filter(a => a.provider === "rocket").length;

  const openCount = alertsArray.filter(a => a.case_status === "OPEN").length;
  const ackCount = alertsArray.filter(a => a.case_status === "ACKNOWLEDGED").length;
  const escCount = alertsArray.filter(a => a.case_status === "ESCALATED").length;
  const resCount = alertsArray.filter(a => a.case_status === "RESOLVED").length;

  const summary = {
    totalCount,
    breakdownByProvider: { bkash: bKashCount, nagad: nagadCount, rocket: rocketCount },
    breakdownByStatus: { OPEN: openCount, ACKNOWLEDGED: ackCount, ESCALATED: escCount, RESOLVED: resCount }
  };

  // If user is MANAGEMENT, enforce aggregate-only rule!
  if (user.role === "MANAGEMENT") {
    logAudit(user.username, user.role, "GET_ANOMALIES_RECENT", "AGGREGATE_ONLY", "200_OK");
    return res.json({
      summaryOnly: true,
      summary,
      alerts: [],
      totalCount: 0
    });
  }

  // Row-level security filtering
  let filtered = alertsArray;

  if (user.role === "AGENT") {
    // Agents see alerts affecting their own shop
    filtered = filtered.filter(a => a.agent_id === user.scope);
  } else if (user.role === "PROVIDER_OPS" || user.role === "RISK_ANALYST") {
    // Provider Ops and Risk Analysts see their own scoped provider only
    if (user.scope !== "global") {
      filtered = filtered.filter(a => a.provider === user.scope);
    }
  } else if (user.role === "SHOP_OWNER" || user.role === "SYSTEM") {
    // Has full visibility
  } else {
    logAudit(user.username, user.role, "GET_ANOMALIES_RECENT", "FORBIDDEN_ROLE", "403_FORBIDDEN");
    return res.status(403).json({ error: "Access Denied. Your role is not authorized to view anomalies." });
  }

  // Apply search/filters
  if (provider) {
    filtered = filtered.filter(a => a.provider === provider);
  }
  if (agentId) {
    filtered = filtered.filter(a => a.agent_id === agentId);
  }
  if (status) {
    filtered = filtered.filter(a => a.case_status === status);
  }
  if (type) {
    filtered = filtered.filter(a => a.type === type);
  }

  // Sort descending by timestamp (newest first)
  filtered = [...filtered].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Pagination
  const startIdx = (Number(page) - 1) * Number(limit);
  const paginated = filtered.slice(startIdx, startIdx + Number(limit));

  logAudit(user.username, user.role, "GET_ANOMALIES_RECENT", user.scope, "200_OK");

  res.json({
    summary,
    alerts: paginated,
    totalCount: filtered.length,
    page: Number(page),
    limit: Number(limit)
  });
});

// Acknowledge Alert
app.post(["/alerts/:alert_id/acknowledge", "/api/alerts/:alert_id/acknowledge"], authenticateToken, (req: any, res) => {
  const user = req.user;
  const alertId = req.params.alert_id;
  const { notes = "" } = req.body;

  const alert = anomalyDetector.activeAlerts[alertId];
  if (!alert) {
    return res.status(404).json({ error: "Alert not found" });
  }

  // Security Check
  if (user.role === "AGENT" && alert.agent_id !== user.scope) {
    return res.status(403).json({ error: "Unauthorized to access this alert." });
  }
  if ((user.role === "PROVIDER_OPS" || user.role === "RISK_ANALYST") && user.scope !== "global" && alert.provider !== user.scope) {
    return res.status(403).json({ error: "Unauthorized to access alerts for this provider." });
  }

  // Update Status
  alert.case_status = "ACKNOWLEDGED";
  alert.auditable_history.push({
    timestamp: new Date().toISOString(),
    action: "ACKNOWLEDGE",
    actor: user.username,
    notes: notes || "Acknowledged via dashboard."
  });

  // Sync back to transaction case status
  syncTransactionStatus(alert.provider, alert.transaction_id, "UNDER_INVESTIGATION");

  logAudit(user.username, user.role, `ACKNOWLEDGE_ALERT_${alertId}`, alert.provider, "200_OK");
  res.json({ success: true, message: "Alert acknowledged successfully", alert });
});

// Escalate Alert
app.post(["/alerts/:alert_id/escalate", "/api/alerts/:alert_id/escalate"], authenticateToken, (req: any, res) => {
  const user = req.user;
  const alertId = req.params.alert_id;
  const { notes = "" } = req.body;

  // Only PROVIDER_OPS, RISK_ANALYST or SHOP_OWNER can escalate
  if (user.role !== "PROVIDER_OPS" && user.role !== "RISK_ANALYST" && user.role !== "SHOP_OWNER") {
    return res.status(403).json({ error: "Access Denied. Only Provider Ops, Compliance Analysts, or Shop Owners can escalate cases." });
  }

  const alert = anomalyDetector.activeAlerts[alertId];
  if (!alert) {
    return res.status(404).json({ error: "Alert not found" });
  }

  if (user.scope !== "global" && alert.provider !== user.scope) {
    return res.status(403).json({ error: "Access Denied. Cannot escalate alerts outside your provider scope." });
  }

  // Update Status
  alert.case_status = "ESCALATED";
  alert.owner = "RISK_ANALYST"; // Escalate to central risk analyst
  alert.auditable_history.push({
    timestamp: new Date().toISOString(),
    action: "ESCALATE",
    actor: user.username,
    notes: notes || "Escalated for senior compliance human review."
  });

  syncTransactionStatus(alert.provider, alert.transaction_id, "UNDER_INVESTIGATION");

  logAudit(user.username, user.role, `ESCALATE_ALERT_${alertId}`, alert.provider, "200_OK");
  res.json({ success: true, message: "Alert escalated to central Risk Compliance team successfully", alert });
});

// Resolve Alert
app.post(["/alerts/:alert_id/resolve", "/api/alerts/:alert_id/resolve"], authenticateToken, (req: any, res) => {
  const user = req.user;
  const alertId = req.params.alert_id;
  const { notes = "" } = req.body;

  // Only PROVIDER_OPS, RISK_ANALYST or SHOP_OWNER can resolve
  if (user.role !== "PROVIDER_OPS" && user.role !== "RISK_ANALYST" && user.role !== "SHOP_OWNER") {
    return res.status(403).json({ error: "Access Denied. Only Provider Ops, Compliance Analysts, or Shop Owners can resolve cases." });
  }

  const alert = anomalyDetector.activeAlerts[alertId];
  if (!alert) {
    return res.status(404).json({ error: "Alert not found" });
  }

  if (user.scope !== "global" && alert.provider !== user.scope) {
    return res.status(403).json({ error: "Access Denied. Cannot resolve alerts outside your provider scope." });
  }

  // Update Status
  alert.case_status = "RESOLVED";
  alert.auditable_history.push({
    timestamp: new Date().toISOString(),
    action: "RESOLVE",
    actor: user.username,
    notes: notes || "Resolved after manual phone-register inspection."
  });

  syncTransactionStatus(alert.provider, alert.transaction_id, "RESOLVED");

  logAudit(user.username, user.role, `RESOLVE_ALERT_${alertId}`, alert.provider, "200_OK");
  res.json({ success: true, message: "Alert resolved successfully", alert });
});

// Evidence and Uncertainty Endpoint
app.get(["/alerts/:alert_id/evidence", "/api/alerts/:alert_id/evidence"], authenticateToken, (req: any, res) => {
  const user = req.user;
  const alertId = req.params.alert_id;

  const alert = anomalyDetector.activeAlerts[alertId];
  if (!alert) {
    return res.status(404).json({ error: "Alert not found" });
  }

  // Verify Provider Isolation Boundaries: bKash alert must not be exposed to Nagad ops user!
  if (user.role === "AGENT" && alert.agent_id !== user.scope) {
    return res.status(403).json({ error: "Access Denied. You do not have permission to view evidence for other agents." });
  }
  if ((user.role === "PROVIDER_OPS" || user.role === "RISK_ANALYST") && user.scope !== "global" && alert.provider !== user.scope) {
    return res.status(403).json({ error: `Access Denied. Scoped user on '${user.scope}' cannot view sensitive evidence for '${alert.provider}' alerts.` });
  }
  if (user.role === "MANAGEMENT") {
    return res.status(403).json({ error: "Access Denied. Management role is restricted to aggregate metrics only. Individual case evidence logs are private." });
  }

  logAudit(user.username, user.role, `VIEW_ALERT_EVIDENCE_${alertId}`, alert.provider, "200_OK");

  res.json({
    alert_id: alert.alert_id,
    type: alert.type,
    severity: alert.severity,
    case_status: alert.case_status,
    owner: alert.owner,
    timestamp: alert.timestamp,
    agent_id: alert.agent_id,
    amount: alert.amount,
    provider: alert.provider,
    evidence: alert.evidence,
    auditable_history: alert.auditable_history
  });
});

// --- DYNAMIC SIMULATION & INTERACTIVE SANDBOX ENDPOINTS ---

// Get active anomaly detector parameters
app.get("/api/simulation/parameters", authenticateToken, (req: any, res) => {
  res.json({ config: anomalyDetector.config });
});

// Update active anomaly detector parameters dynamically
app.post("/api/simulation/parameters", authenticateToken, (req: any, res) => {
  const user = req.user;
  if (user.role !== "RISK_ANALYST" && user.role !== "PROVIDER_OPS" && user.role !== "SHOP_OWNER" && user.role !== "MANAGEMENT") {
    return res.status(403).json({ error: "Access Denied. Only authorized staff can adjust model sensitivity." });
  }

  const { config } = req.body;
  if (!config) {
    return res.status(400).json({ error: "Missing config updates." });
  }

  // Safely merge configurations
  anomalyDetector.config = {
    ...anomalyDetector.config,
    ...config
  };

  logAudit(user.username, user.role, "UPDATE_DETECTION_THRESHOLDS", "SYSTEM", "200_OK");

  res.json({
    success: true,
    message: "Risk sensitivity thresholds updated dynamically in-memory.",
    config: anomalyDetector.config
  });
});

// Real-time Event Injection Engine
app.post("/api/simulation/inject", authenticateToken, (req: any, res) => {
  const user = req.user;
  const { provider, agentId, type, amount, scenario } = req.body;

  if (user.role !== "RISK_ANALYST" && user.role !== "PROVIDER_OPS" && user.role !== "SHOP_OWNER" && user.role !== "AGENT") {
    return res.status(403).json({ error: "Access Denied. Only operators can run simulation injections." });
  }

  // Validate parameters
  if (!provider || !agentId || !type || !amount) {
    return res.status(400).json({ error: "Missing required parameters: provider, agentId, type, amount" });
  }

  if (provider !== "bkash" && provider !== "nagad" && provider !== "rocket") {
    return res.status(400).json({ error: "Invalid provider" });
  }

  // Find target cache
  let cache: Transaction[] = [];
  if (provider === "bkash") cache = bkashCache;
  else if (provider === "nagad") cache = nagadCache;
  else if (provider === "rocket") cache = rocketCache;

  // Generate dynamic transaction records
  const timestamp = new Date().toISOString();
  
  // Get latest balance
  const getLatestBal = (txns: Transaction[], seed: number) => {
    if (txns.length === 0) return seed;
    const sorted = [...txns].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return sorted[0].current_balance;
  };
  
  const currentBal = getLatestBal(cache, provider === "bkash" ? 100000 : provider === "nagad" ? 80000 : 50000);
  const transactionsToInsert: Transaction[] = [];

  if (scenario === "repeated_amount") {
    // Generate 5 identical transaction records within short intervals (2-minute offsets)
    let runningBal = currentBal;
    const count = anomalyDetector.config.repeatedCountThreshold || 5;
    const amt = Number(amount) >= anomalyDetector.config.repeatedMinAmount ? Number(amount) : anomalyDetector.config.repeatedMinAmount;
    
    for (let i = 0; i < count; i++) {
      const offsetMs = i * 2 * 60 * 1000;
      const tTime = new Date(Date.now() - (count - 1 - i) * 2 * 60 * 1000).toISOString();
      const openBal = runningBal;
      const curBal = type === "cash_in" ? openBal - amt : openBal + amt;
      runningBal = curBal;

      const txn: Transaction = {
        transaction_id: `SIM-REP-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
        agent_id: agentId,
        area: "Dhaka",
        timestamp: tTime,
        type: type as any,
        amount: amt,
        status: "SUCCESS",
        opening_balance: openBal,
        current_balance: curBal,
        event_flags: "HIGH_VELOCITY",
        case_status: "NONE",
        is_ground_truth_anomaly: true,
        anomaly_type: "repeated_amount"
      };
      transactionsToInsert.push(txn);
    }
  } else if (scenario === "sudden_burst") {
    // Generate burst count of rapid Cash-Outs in 1-minute intervals
    let runningBal = currentBal;
    const count = anomalyDetector.config.burstCountThreshold || 12;
    const amt = Number(amount);
    
    for (let i = 0; i < count; i++) {
      const offsetMs = i * 60 * 1000;
      const tTime = new Date(Date.now() - (count - 1 - i) * 60 * 1000).toISOString();
      const openBal = runningBal;
      const curBal = openBal + amt; // Cash out adds to provider e-money wallet
      runningBal = curBal;

      const txn: Transaction = {
        transaction_id: `SIM-BST-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
        agent_id: agentId,
        area: "Chittagong",
        timestamp: tTime,
        type: "cash_out",
        amount: amt,
        status: "SUCCESS",
        opening_balance: openBal,
        current_balance: curBal,
        event_flags: "MASS_WITHDRAWAL",
        case_status: "NONE",
        is_ground_truth_anomaly: true,
        anomaly_type: "sudden_burst"
      };
      transactionsToInsert.push(txn);
    }
  } else if (scenario === "feed_conflict") {
    // Induces an immediate opening balance ledger mismatch (discrepancy > 30k)
    const badOpeningBal = currentBal - 45000;
    const curBal = type === "cash_in" ? badOpeningBal - Number(amount) : badOpeningBal + Number(amount);
    
    const txn: Transaction = {
      transaction_id: `SIM-CON-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
      agent_id: agentId,
      area: "Sylhet",
      timestamp: timestamp,
      type: type as any,
      amount: Number(amount),
      status: "SUCCESS",
      opening_balance: badOpeningBal,
      current_balance: curBal,
      event_flags: "UNSYNCED_LEDGER",
      case_status: "NONE",
      is_ground_truth_anomaly: true,
      anomaly_type: "feed_conflict"
    };
    transactionsToInsert.push(txn);
  } else if (scenario === "unusual_volume") {
    // High amount to trigger robust Z-score
    const bigAmt = Number(amount) >= anomalyDetector.config.minUnusualVolumeAmount ? Number(amount) : (anomalyDetector.config.minUnusualVolumeAmount + 5000);
    const curBal = type === "cash_in" ? currentBal - bigAmt : currentBal + bigAmt;
    
    const txn: Transaction = {
      transaction_id: `SIM-VOL-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
      agent_id: agentId,
      area: "Rajshahi",
      timestamp: timestamp,
      type: type as any,
      amount: bigAmt,
      status: "SUCCESS",
      opening_balance: currentBal,
      current_balance: curBal,
      event_flags: "SPIKE_DETECTED",
      case_status: "NONE",
      is_ground_truth_anomaly: true,
      anomaly_type: "unusual_volume"
    };
    transactionsToInsert.push(txn);
  } else {
    // Normal single transaction
    const curBal = type === "cash_in" ? currentBal - Number(amount) : currentBal + Number(amount);
    const txn: Transaction = {
      transaction_id: `SIM-TXN-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
      agent_id: agentId,
      area: "Dhaka",
      timestamp: timestamp,
      type: type as any,
      amount: Number(amount),
      status: "SUCCESS",
      opening_balance: currentBal,
      current_balance: curBal,
      event_flags: "NORMAL",
      case_status: "NONE",
      is_ground_truth_anomaly: false,
      anomaly_type: null
    };
    transactionsToInsert.push(txn);
  }

  // Append to Cache
  cache.push(...transactionsToInsert);

  // Update CSV file to keep it fully synchronized
  try {
    const dbDir = path.join(process.cwd(), "db_files");
    const filePath = path.join(dbDir, `${provider}.csv`);
    fs.writeFileSync(filePath, jsonToCSV(cache, txnHeaders));
  } catch (error) {
    console.error("Failed to write simulated transactions to CSV:", error);
  }

  // Gather active baseline metrics for the streaming updates
  const baselinesLookup: Record<string, any> = {};
  const mergeBaselines = (baselines: Record<string, any>) => {
    for (const [k, v] of Object.entries(baselines)) {
      if (!baselinesLookup[k]) baselinesLookup[k] = { ...v };
    }
  };
  mergeBaselines(bkashModel.baselines);
  mergeBaselines(nagadModel.baselines);
  mergeBaselines(rocketModel.baselines);

  const alertsTriggered: StreamingAlert[] = [];

  for (const txn of transactionsToInsert) {
    // Update EWMA model baseline projections dynamically
    if (provider === "bkash") bkashModel.updateStreamingEWMA(txn.agent_id, txn.timestamp, txn.type, txn.amount);
    else if (provider === "nagad") nagadModel.updateStreamingEWMA(txn.agent_id, txn.timestamp, txn.type, txn.amount);
    else if (provider === "rocket") rocketModel.updateStreamingEWMA(txn.agent_id, txn.timestamp, txn.type, txn.amount);

    // Update physical Cash Drawer Ledger Cache
    const latestCash = drawerCache.length > 0 
      ? [...drawerCache].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0].current_cash 
      : 150000;
    
    const changeAmt = txn.amount;
    const openCash = latestCash;
    // cash_in: customer deposits physical cash -> cash drawer gains money
    // cash_out: customer withdraws physical cash -> cash drawer pays out money
    const curCash = txn.type === "cash_in" ? openCash + changeAmt : openCash - changeAmt;

    const drawerEntry: CashDrawerEntry = {
      entry_id: `DRW-SIM-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
      agent_id: txn.agent_id,
      timestamp: txn.timestamp,
      type: txn.type as any,
      amount: txn.amount,
      opening_cash: openCash,
      current_cash: curCash,
      provider_ref: provider,
      provider_txn_id: txn.transaction_id
    };
    drawerCache.push(drawerEntry);
    
    // Evaluate streaming metrics and check for anomalies
    const alert = anomalyDetector.processTransaction(txn, provider, baselinesLookup);
    if (alert) {
      alertsTriggered.push(alert);
    }
  }

  // Update Cash Drawer Ledger file on disk
  try {
    const dbDir = path.join(process.cwd(), "db_files");
    const drawerPath = path.join(dbDir, "cash_drawer_ledger.csv");
    const drawerHeaders = ["entry_id", "agent_id", "timestamp", "type", "amount", "opening_cash", "current_cash", "provider_ref", "provider_txn_id"];
    fs.writeFileSync(drawerPath, jsonToCSV(drawerCache, drawerHeaders));
  } catch (error) {
    console.error("Failed to write simulated cash drawer entry to disk:", error);
  }

  logAudit(user.username, user.role, `SIMULATION_INJECT_${scenario || "SINGLE_TXN"}`, `${provider}_${agentId}`, "200_OK");

  res.json({
    success: true,
    message: `Successfully injected ${transactionsToInsert.length} transaction(s) into ${provider.toUpperCase()} flow for ${agentId}.`,
    insertedCount: transactionsToInsert.length,
    alertsTriggeredCount: alertsTriggered.length,
    alertsTriggered,
    latestTransactions: transactionsToInsert
  });
});

// Helper to sync alert updates back to CSV database
function syncTransactionStatus(provider: string, txnId: string, caseStatus: string) {
  let cache: Transaction[] = [];
  if (provider === "bkash") cache = bkashCache;
  else if (provider === "nagad") cache = nagadCache;
  else if (provider === "rocket") cache = rocketCache;
  else return;

  const txn = cache.find(t => t.transaction_id === txnId);
  if (txn) {
    txn.case_status = caseStatus as any;
    try {
      const dbDir = path.join(process.cwd(), "db_files");
      const filePath = path.join(dbDir, `${provider}.csv`);
      fs.writeFileSync(filePath, jsonToCSV(cache, txnHeaders));
      console.log(`Synchronized transaction status in CSV for ${provider} - ${txnId}`);
    } catch (e) {
      console.error("Failed to write sync status in CSV:", e);
    }
  }
}

// --- LIQUIDITY FORECASTING API ENDPOINTS ---

// 4.1. Blended Liquidity Forecast (Provider & Cash Drawer)
app.get("/api/liquidity/forecast", authenticateToken, (req: any, res) => {
  const user = req.user;
  const agentId = (req.query.agentId as string) || "AGENT-001";
  const provider = (req.query.provider as string) || "bkash";
  const horizonHours = Number(req.query.horizonHours || 12);

  if (provider !== "bkash" && provider !== "nagad" && provider !== "rocket") {
    return res.status(400).json({ error: "Invalid provider specified" });
  }

  // RBAC Checks & Privacy Constraints:
  // - AGENT: can only forecast their own shop (user.scope).
  // - PROVIDER_OPS / RISK_ANALYST: can only query their scoped provider.
  if (user.role === "AGENT") {
    if (agentId !== user.scope) {
      logAudit(user.username, user.role, "GET_LIQUIDITY_FORECAST_DENIED", agentId, "403_FORBIDDEN");
      return res.status(403).json({ error: `Access Denied. Agents can only forecast their own shop '${user.scope}'.` });
    }
  } else if (user.role === "PROVIDER_OPS" || user.role === "RISK_ANALYST") {
    if (user.scope !== provider && user.scope !== "global") {
      logAudit(user.username, user.role, "GET_LIQUIDITY_FORECAST_DENIED", provider, "403_FORBIDDEN");
      return res.status(403).json({ error: `Access Denied. Your scope '${user.scope}' is unauthorized for provider '${provider}'.` });
    }
  }

  // Determine current simulation timestamp
  let simulationTime = req.query.timestamp as string;
  if (!simulationTime) {
    simulationTime = getLatestSimTime();
  }

  // Retrieve current provider balance and physical cash drawer balance
  const agentTxns = (provider === "bkash" ? bkashCache : provider === "nagad" ? nagadCache : rocketCache)
    .filter(t => t.agent_id === agentId);
  const latestBal = agentTxns.length > 0 
    ? [...agentTxns].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0].current_balance 
    : (provider === "bkash" ? 100000 : provider === "nagad" ? 80000 : 50000);

  const agentDrawer = drawerCache.filter(d => d.agent_id === agentId);
  const latestCash = agentDrawer.length > 0
    ? [...agentDrawer].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0].current_cash
    : 150000;

  // Last transaction timestamp for staleness calculations
  const sortedTxns = [...agentTxns].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const lastTxnTimeMs = sortedTxns.length > 0
    ? new Date(sanitizeTimestamp(sortedTxns[0].timestamp)).getTime()
    : new Date(sanitizeTimestamp(simulationTime)).getTime();

  // Run blended forecast simulation
  const forecast = sharedTower.forecastLiquidity(
    agentId,
    provider as "bkash" | "nagad" | "rocket",
    latestBal,
    latestCash,
    simulationTime,
    lastTxnTimeMs,
    false,
    horizonHours
  );

  logAudit(user.username, user.role, "GET_LIQUIDITY_FORECAST", `${agentId}_${provider}`, "200_OK");
  res.json(forecast);
});

// 4.2. Overall Shop Liquidity Health Alerts
app.get("/api/liquidity/overall", authenticateToken, (req: any, res) => {
  const user = req.user;

  let targetAgentId = req.query.agentId as string;
  if (user.role === "AGENT") {
    targetAgentId = user.scope; // bind agent to their own shop
  }

  const agentsList = targetAgentId
    ? [targetAgentId]
    : ["AGENT-001", "AGENT-002", "AGENT-003", "AGENT-004", "AGENT-005", "AGENT-006", "AGENT-007", "AGENT-008"];

  const simulationTime = getLatestSimTime();

  const result = agentsList.map(agentId => {
    const providers: Array<"bkash" | "nagad" | "rocket"> = ["bkash", "nagad", "rocket"];
    const providerAlerts = providers.map(p => {
      const agentTxns = (p === "bkash" ? bkashCache : p === "nagad" ? nagadCache : rocketCache)
        .filter(t => t.agent_id === agentId);
      const latestBal = agentTxns.length > 0 
        ? [...agentTxns].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0].current_balance 
        : (p === "bkash" ? 100000 : p === "nagad" ? 80000 : 50000);

      const agentDrawer = drawerCache.filter(d => d.agent_id === agentId);
      const latestCash = agentDrawer.length > 0
        ? [...agentDrawer].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0].current_cash
        : 150000;

      const sortedTxns = [...agentTxns].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      const lastTxnTimeMs = sortedTxns.length > 0
        ? new Date(sanitizeTimestamp(sortedTxns[0].timestamp)).getTime()
        : new Date(sanitizeTimestamp(simulationTime)).getTime();

      const fc = sharedTower.forecastLiquidity(
        agentId,
        p,
        latestBal,
        latestCash,
        simulationTime,
        lastTxnTimeMs,
        false,
        12
      );

      return {
        provider: p,
        balance: latestBal,
        shortageHour: fc.projectedShortageHour,
        shortageType: fc.projectedShortageType,
        alert: fc.alert
      };
    });

    const criticalAlerts = providerAlerts.filter(a => a.alert.status === "CRITICAL");
    const warningAlerts = providerAlerts.filter(a => a.alert.status === "WARNING");

    let agentStatus: "OK" | "WARNING" | "CRITICAL" = "OK";
    if (criticalAlerts.length > 0) agentStatus = "CRITICAL";
    else if (warningAlerts.length > 0) agentStatus = "WARNING";

    return {
      agentId,
      status: agentStatus,
      alerts: providerAlerts
    };
  });

  logAudit(user.username, user.role, "GET_OVERALL_LIQUIDITY_STATUS", targetAgentId || "ALL_SHOPS", "200_OK");
  res.json({ liquidityStatus: result });
});

// 5. READ AUDIT LOGS FOR EVIDENCE (MANAGEMENT or SHOP_OWNER ONLY)
app.get("/api/audit/logs", authenticateToken, (req: any, res) => {
  const user = req.user;
  
  if (user.role !== "MANAGEMENT" && user.role !== "SHOP_OWNER") {
    logAudit(user.username, user.role, "READ_AUDIT_LOGS", user.scope, "403_FORBIDDEN");
    return res.status(403).json({ error: "Access Denied. Audit Logs are restricted to Management and Shop Owners only." });
  }

  try {
    const auditFile = path.join(process.cwd(), "db_files", "audit_log.csv");
    if (!fs.existsSync(auditFile)) {
      return res.json({ logs: [], totalCount: 0 });
    }

    const content = fs.readFileSync(auditFile, "utf-8");
    const headers = ["audit_id", "timestamp", "username", "role", "action", "scope", "status", "hash"];
    const records = csvToJSON<any>(content, headers);
    
    // Sort descending (latest first)
    const sorted = [...records].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    
    res.json({
      logs: sorted.slice(0, 100), // Limit to latest 100 logs
      totalCount: records.length
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to read audit logs." });
  }
});

// --- AI COPILOT & REAL-TIME RISK ADVISORY ENDPOINTS (GEMINI & OPENAI INTEGRATION) ---

let geminiClient: any = null;
function getGeminiClient() {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not defined.");
    }
    geminiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });
  }
  return geminiClient;
}

async function callOpenAI(prompt: string, systemInstruction: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not defined.");
  }
  
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt }
      ],
      temperature: 0.7
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API failed with status ${response.status}: ${errorText}`);
  }
  
  const data = await response.json();
  return data.choices?.[0]?.message?.content;
}

function generateHeuristicAdvisoryReport(context: any): string {
  const { activeAlertsCount, activeAlerts, liquidity, riskThresholds } = context;
  const { physicalDrawerCash, bkash, nagad, rocket } = liquidity;

  // Determine risk level
  let riskLevel = "LOW";
  let riskReason = "System operations are within nominal baselines with stable liquidity and zero critical anomalies.";
  
  if (activeAlertsCount > 3 || physicalDrawerCash < 30000) {
    riskLevel = "HIGH";
    riskReason = "Immediate action required. Multiple concurrent transaction anomalies detected alongside severe physical cash drawer depletion.";
  } else if (activeAlertsCount > 0 || physicalDrawerCash < 70000) {
    riskLevel = "MEDIUM";
    riskReason = "Moderate attention required. Active anomaly alerts detected or physical cash buffer is operating below the recommended safety threshold.";
  }

  // Calculate total e-money
  const totalEMoney = bkash.balance + nagad.balance + rocket.balance;
  const grandTotalLiquidity = totalEMoney + physicalDrawerCash;

  // Recommendations
  const recommendations: string[] = [];
  if (physicalDrawerCash < 50000) {
    recommendations.push(`- **Physical Cash Replenishment**: Current physical drawer cash (${physicalDrawerCash.toLocaleString()} BDT) is below the minimum threshold. Initiate immediate vault withdrawal or coordinate with bank branch to secure physical banknotes.`);
  } else {
    recommendations.push(`- **Physical Cash Buffer**: Current physical drawer cash (${physicalDrawerCash.toLocaleString()} BDT) is adequate for standard operational velocity. Maintain current custody.`);
  }

  // Wallet imbalances
  if (bkash.balance > nagad.balance * 2) {
    recommendations.push(`- **Liquidity Rebalancing (bKash to Nagad)**: High concentration detected in bKash e-money (${bkash.balance.toLocaleString()} BDT). Recommend initiating a rebalancing transfer of ${Math.round((bkash.balance - nagad.balance) / 2).toLocaleString()} BDT to Nagad to optimize regional distribution.`);
  }
  if (nagad.balance > rocket.balance * 3) {
    recommendations.push(`- **Liquidity Rebalancing (Nagad to Rocket)**: Rocket wallet reserves are thin (${rocket.balance.toLocaleString()} BDT). Recommend shifting ${Math.round((nagad.balance - rocket.balance) / 3).toLocaleString()} BDT from Nagad e-money into Rocket to safeguard against customer payout runs.`);
  }

  if (activeAlertsCount > 0) {
    const alertTypes = Array.from(new Set(activeAlerts.map((a: any) => `'${a.type}'`))).join(', ');
    recommendations.push(`- **Audit and Verification**: ${activeAlertsCount} active risk alert(s) currently open. Risk operators must manually verify transactions flagged for ${alertTypes} before clearing daily settlements.`);
  }

  return `### FlowSense Live Strategic Advisory Report

---

#### 1. Executive Risk Level: **${riskLevel}**
*Advisory Status: Heuristics Fallback Active*
- **Assessment Summary**: ${riskReason}
- **Active Anomalies**: ${activeAlertsCount} open alerts detected.

---

#### 2. System Liquidity Assessment
- **Physical Cash Drawer**: **${physicalDrawerCash.toLocaleString()} BDT**
- **Total Digital E-Money**: **${totalEMoney.toLocaleString()} BDT**
  - **bKash**: ${bkash.balance.toLocaleString()} BDT (Volume: Cash-In ${bkash.cashInVolume.toLocaleString()} / Cash-Out ${bkash.cashOutVolume.toLocaleString()})
  - **Nagad**: ${nagad.balance.toLocaleString()} BDT (Volume: Cash-In ${nagad.cashInVolume.toLocaleString()} / Cash-Out ${nagad.cashOutVolume.toLocaleString()})
  - **Rocket**: ${rocket.balance.toLocaleString()} BDT (Volume: Cash-In ${rocket.cashInVolume.toLocaleString()} / Cash-Out ${rocket.cashOutVolume.toLocaleString()})
- **Aggregate Combined Assets**: **${grandTotalLiquidity.toLocaleString()} BDT**

*Liquidity Status Analysis*:
The physical-to-digital liquidity ratio stands at **${((physicalDrawerCash / Math.max(1, grandTotalLiquidity)) * 100).toFixed(1)}%** physical cash. ${
    physicalDrawerCash < 50000 
      ? "Warning: Physical cash reserve is dangerously depleted, restricting ability to process physical cash-out requests." 
      : "Nominal cash reserves are sufficient to absorb standard transactional velocity."
  }

---

#### 3. Risk Parameters Context
- **Robust Z-Score Threshold**: ${riskThresholds.zScoreThreshold} (Current live detector setting)
- **Consecutive Equal Amount Limit**: ${riskThresholds.repeatedCountThreshold} transactions
- **Sudden Burst Growth Window**: ${riskThresholds.burstWindowMins} minutes (Limit: ${riskThresholds.burstCountThreshold} events)
- **System Analysis State**: Operating under seasonally-adjusted baselines. Robust statistics are continuously recalculated chronologically to prevent false positives during peak festival periods.

---

#### 4. Concrete Recommended Rebalancing Protocols
${recommendations.join('\n')}

---
*Report compiled automatically by the local FlowSense Strategic Heuristics Engine. Operational metrics derived from live cryptographically checked transaction feeds.*`;
}

app.post("/api/ai/analyze", authenticateToken, async (req: any, res) => {
  const user = req.user;
  const { engine } = req.body;

  if (engine !== "gemini" && engine !== "openai") {
    return res.status(400).json({ error: "Invalid AI engine selected. Choose 'gemini' or 'openai'." });
  }

  try {
    const riskConfig = anomalyDetector.config;
    const activeAlertsList = Object.values(anomalyDetector.activeAlerts);
    const activeAlertsCount = activeAlertsList.length;
    
    const latestCash = drawerCache.length > 0 
      ? [...drawerCache].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0].current_cash 
      : 150000;
      
    const getProviderStats = (txns: Transaction[], seed: number) => {
      const successTxns = txns.filter(t => t.status === "SUCCESS");
      const latestBal = txns.length > 0 
        ? [...txns].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0].current_balance 
        : seed;
      return {
        count: successTxns.length,
        balance: latestBal,
        cashInVolume: successTxns.filter(t => t.type === "cash_in").reduce((sum, t) => sum + t.amount, 0),
        cashOutVolume: successTxns.filter(t => t.type === "cash_out").reduce((sum, t) => sum + t.amount, 0),
      };
    };

    const bkashStats = getProviderStats(bkashCache, 100000);
    const nagadStats = getProviderStats(nagadCache, 80000);
    const rocketStats = getProviderStats(rocketCache, 50000);

    const systemContext = {
      userRole: user.role,
      userScope: user.scope,
      activeAlertsCount,
      activeAlerts: activeAlertsList.slice(0, 5).map(a => ({
        alert_id: a.alert_id,
        provider: a.provider,
        agent_id: a.agent_id,
        type: a.type,
        amount: a.amount,
        severity: a.severity,
        details: a.evidence?.reason || a.evidence?.situation || "",
        status: a.case_status
      })),
      riskThresholds: riskConfig,
      liquidity: {
        physicalDrawerCash: latestCash,
        bkash: bkashStats,
        nagad: nagadStats,
        rocket: rocketStats
      }
    };

    const systemInstruction = `You are the FlowSense AI Copilot, an elite real-time MFS (Mobile Financial Services) Liquidity & Risk advisory intelligence agent.
Your objective is to provide professional, executive-level, and highly detailed analysis of the live system state, detecting risks and giving tactical rebalancing advice.
Provide bulleted, actionable recommendations on rebalancing bKash, Nagad, Rocket digital wallets, and optimizing physical Cash Drawer cash to handle velocity peaks.
Structure your report with:
1. Executive Risk Level (LOW / MEDIUM / HIGH) based on active alerts or cash drawer depletion.
2. System Liquidity Assessment (assessing e-money balances & physical cash drawer buffer).
3. Risk Parameters Context (validating current thresholds like robust Z-scores).
4. Concrete Recommended Rebalancing Protocols (with exact actions).
Maintain a strict, objective, and highly professional tone (no casual fluff, no exclamation marks). Respond in valid clean Markdown.`;

    const prompt = `System Current Live Context:
${JSON.stringify(systemContext, null, 2)}

Produce your Real-Time Strategic Advisory Report.`;

    let responseText = "";
    let usedModel = "";
    const GEMINI_MODELS = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];

    if (engine === "gemini") {
      let lastError: any = null;
      for (const modelName of GEMINI_MODELS) {
        try {
          console.log(`Attempting AI analysis with Gemini model: ${modelName}`);
          const ai = getGeminiClient();
          const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              systemInstruction: systemInstruction,
              temperature: 0.7
            }
          });
          responseText = response.text || "";
          if (responseText) {
            usedModel = `Gemini (${modelName})`;
            break;
          }
        } catch (err: any) {
          console.warn(`Gemini model ${modelName} failed:`, err.message || err);
          lastError = err;
        }
      }

      // Last resort fallback to OpenAI if Gemini fails and key is present
      if (!responseText && process.env.OPENAI_API_KEY) {
        try {
          console.log("All Gemini models failed. Falling back to OpenAI as last resort.");
          responseText = await callOpenAI(prompt, systemInstruction) || "";
          if (responseText) {
            usedModel = "OpenAI (gpt-4o-mini - Fallback)";
          }
        } catch (err: any) {
          console.error("OpenAI fallback also failed:", err);
        }
      }

      if (!responseText) {
        console.warn("All Gemini models and OpenAI fallback failed. Engaging FlowSense Heuristics Engine...");
        responseText = generateHeuristicAdvisoryReport(systemContext);
        usedModel = "FlowSense Heuristics Engine (Offline Fallback)";
      }
    } else {
      // User selected OpenAI
      try {
        responseText = await callOpenAI(prompt, systemInstruction) || "";
        usedModel = "OpenAI (gpt-4o-mini)";
      } catch (err: any) {
        console.warn("OpenAI selected but failed, trying Gemini as fallback:", err);
        let lastError = err;
        for (const modelName of GEMINI_MODELS) {
          try {
            const ai = getGeminiClient();
            const response = await ai.models.generateContent({
              model: modelName,
              contents: prompt,
              config: {
                systemInstruction: systemInstruction,
                temperature: 0.7
              }
            });
            responseText = response.text || "";
            if (responseText) {
              usedModel = `Gemini (${modelName} - Fallback)`;
              break;
            }
          } catch (gErr: any) {
            console.warn(`Fallback Gemini model ${modelName} failed:`, gErr);
          }
        }
        if (!responseText) {
          console.warn("OpenAI and all Gemini fallback models failed. Engaging FlowSense Heuristics Engine...");
          responseText = generateHeuristicAdvisoryReport(systemContext);
          usedModel = "FlowSense Heuristics Engine (Offline Fallback)";
        }
      }
    }

    logAudit(user.username, user.role, `AI_ANALYSIS_GENERATION_${engine.toUpperCase()}`, "SYSTEM", "200_OK");

    res.json({
      success: true,
      engine: engine,
      usedModel: usedModel,
      timestamp: new Date().toISOString(),
      analysis: responseText
    });

  } catch (error: any) {
    console.error("AI analysis route failed:", error);
    res.status(500).json({ error: error.message || "An unexpected error occurred during AI analysis." });
  }
});

// Serve frontend build static files / Vite dev middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Development Mode
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production Mode
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || "development"} mode`);
  });
}

startServer();
