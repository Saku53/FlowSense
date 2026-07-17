import * as fs from "fs";
import * as path from "path";

// Seeded random number generator for 100% reproducibility
class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  // Returns [0, 1)
  next(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }
  // Returns integer in [min, max]
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  // Choose random element
  choice<T>(arr: T[]): T {
    return arr[this.nextInt(0, arr.length - 1)];
  }
}

// Model structures
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
  event_flags: string; // Comma separated
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

interface AgentShop {
  id: string;
  name: string;
  area: string;
  region: "Dhaka" | "Semi-Urban";
  initialBalances: { bkash: number; nagad: number; rocket: number; cash_drawer: number };
}

const AGENTS: AgentShop[] = [
  { id: "AGENT-001", name: "Maa Telecom", area: "Gulshan, Dhaka", region: "Dhaka", initialBalances: { bkash: 120000, nagad: 90000, rocket: 50000, cash_drawer: 150000 } },
  { id: "AGENT-002", name: "Roni Enterprise", area: "Motijheel, Dhaka", region: "Dhaka", initialBalances: { bkash: 250000, nagad: 150000, rocket: 80000, cash_drawer: 300000 } },
  { id: "AGENT-003", name: "Bismillah Store", area: "Dhanmondi, Dhaka", region: "Dhaka", initialBalances: { bkash: 150000, nagad: 100000, rocket: 60000, cash_drawer: 180000 } },
  { id: "AGENT-004", name: "Dhaka Telecom", area: "Mirpur, Dhaka", region: "Dhaka", initialBalances: { bkash: 180000, nagad: 110000, rocket: 70000, cash_drawer: 200000 } },
  { id: "AGENT-005", name: "Sreepur Bazar Agency", area: "Sreepur, Gazipur", region: "Semi-Urban", initialBalances: { bkash: 90000, nagad: 80000, rocket: 40000, cash_drawer: 120000 } },
  { id: "AGENT-006", name: "Mymensingh Mobile Corner", area: "Sadar, Mymensingh", region: "Semi-Urban", initialBalances: { bkash: 100000, nagad: 75000, rocket: 45000, cash_drawer: 130000 } },
  { id: "AGENT-007", name: "Tangail Digital Point", area: "Sadar, Tangail", region: "Semi-Urban", initialBalances: { bkash: 85000, nagad: 70000, rocket: 35000, cash_drawer: 110000 } },
  { id: "AGENT-008", name: "Gazipur Chowrasta Telecom", area: "Chowrasta, Gazipur", region: "Semi-Urban", initialBalances: { bkash: 140000, nagad: 95000, rocket: 55000, cash_drawer: 160000 } },
];

// Seeded Random Initializer
const rng = new SeededRandom(19711216); // Victory Day seed

// Bangladeshi Hijri holiday definitions
const HOLIDAYS = [
  { name: "Eid-ul-Fitr 2024", start: "2024-04-10", end: "2024-04-12", peak: "2024-04-11" },
  { name: "Eid-ul-Adha 2024", start: "2024-06-16", end: "2024-06-18", peak: "2024-06-17" },
  { name: "Eid-ul-Fitr 2025", start: "2025-03-30", end: "2025-04-01", peak: "2025-03-31" },
  { name: "Eid-ul-Adha 2025", start: "2025-06-06", end: "2025-06-08", peak: "2025-06-07" },
  { name: "Eid-ul-Fitr 2026", start: "2026-03-19", end: "2026-03-21", peak: "2026-03-20" },
  { name: "Eid-ul-Adha 2026", start: "2026-05-26", end: "2026-05-28", peak: "2026-05-27" },
];

function isWithinRange(dateStr: string, startStr: string, endStr: string): boolean {
  return dateStr >= startStr && dateStr <= endStr;
}

function getDayHolidayMultiplier(dateStr: string): { multiplier: number; festival: string | null } {
  for (const h of HOLIDAYS) {
    if (isWithinRange(dateStr, h.start, h.end)) {
      if (dateStr === h.peak) return { multiplier: 4.5, festival: h.name };
      return { multiplier: 3.0, festival: h.name };
    }
    // Days leading up to Eid (5 days before) are very busy
    const date = new Date(dateStr);
    const startDate = new Date(h.start);
    const diffTime = startDate.getTime() - date.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays > 0 && diffDays <= 5) {
      return { multiplier: 2.0 + (5 - diffDays) * 0.4, festival: `Pre-${h.name}` };
    }
  }
  return { multiplier: 1.0, festival: null };
}

// Generate full transaction history
export function generateEcosystemData() {
  const bkashTransactions: Transaction[] = [];
  const nagadTransactions: Transaction[] = [];
  const rocketTransactions: Transaction[] = [];
  const cashDrawerLedger: CashDrawerEntry[] = [];

  // Track running balances
  const balances: Record<string, { bkash: number; nagad: number; rocket: number; cash_drawer: number }> = {};
  for (const agent of AGENTS) {
    balances[agent.id] = { ...agent.initialBalances };
  }

  // Time window setup: 2 years (from 2024-07-17 to 2026-07-17)
  const startDate = new Date("2024-07-17T00:00:00Z");
  const endDate = new Date("2026-07-17T00:00:00Z");

  // Keep track of transaction counts
  let bkashTxnCounter = 100000;
  let nagadTxnCounter = 200000;
  let rocketTxnCounter = 300000;
  let drawerCounter = 500000;

  // Let's create an array of all days
  const days: string[] = [];
  let currentDay = new Date(startDate);
  while (currentDay <= endDate) {
    days.push(currentDay.toISOString().split("T")[0]);
    currentDay.setDate(currentDay.getDate() + 1);
  }

  console.log(`Generating data for ${days.length} days across 8 agents...`);

  // Target anomalies tracker
  const injectedAnomalies: { provider: string; agent: string; date: string; type: string }[] = [];
  let anomalyCount = 0;

  // Determine anomaly slots randomly but spread out over the 2 years
  // We want exactly 50 anomalies total
  const anomalyDays = new Set<string>();
  while (anomalyDays.size < 40) {
    anomalyDays.add(rng.choice(days));
  }

  for (const dayStr of days) {
    const { multiplier: holidayMult, festival } = getDayHolidayMultiplier(dayStr);
    const dateObj = new Date(dayStr);
    const dayOfWeek = dateObj.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 4 = Thu, 5 = Fri, 6 = Sat
    
    // Weekly seasonality multipliers
    let weeklyMult = 1.0;
    if (dayOfWeek === 4) weeklyMult = 1.4; // Thursday peak
    if (dayOfWeek === 5) weeklyMult = 1.25; // Friday peak
    if (dayOfWeek === 0) weeklyMult = 0.85; // Sunday drop

    // Monthly seasonality multipliers
    const dayOfMonth = dateObj.getUTCDate();
    let monthlyMult = 1.0;
    if (dayOfMonth >= 1 && dayOfMonth <= 5) {
      monthlyMult = 1.5; // Salary peak
    } else if (dayOfMonth >= 25) {
      monthlyMult = 0.75; // Late month trough
    }

    const finalDayMultiplier = holidayMult * weeklyMult * monthlyMult;

    for (const agent of AGENTS) {
      // Sparser transactions in semi-urban areas generally, but higher cash-outs before holidays
      let areaMult = agent.region === "Dhaka" ? 1.2 : 0.8;
      if (festival && agent.region === "Semi-Urban") {
        // Semi-urban sees massive cash-out spikes before festivals due to inward remittances
        areaMult = 1.8;
      }

      // Base transaction rate: 3-5 transactions per day per agent, scaled by multipliers
      // Keeping it sparse to avoid multi-megabyte file bloat, while maintaining high fidelity
      const baseCount = rng.nextInt(2, 4);
      const targetCount = Math.max(1, Math.round(baseCount * finalDayMultiplier * areaMult));

      // Current agent state
      const agentBalances = balances[agent.id];

      // Rebalance cash drawer if it gets dangerously low or high
      // Real agents deposit excess cash to the bank or withdraw cash to keep operations smooth.
      if (agentBalances.cash_drawer < 30000) {
        // Withdraw from bank to replenish cash drawer
        const rebalanceAmt = rng.nextInt(80000, 150000);
        const timestamp = `${dayStr}T08:15:00Z`;
        const opening = agentBalances.cash_drawer;
        agentBalances.cash_drawer += rebalanceAmt;
        cashDrawerLedger.push({
          entry_id: `DRW-REB-${++drawerCounter}`,
          agent_id: agent.id,
          timestamp,
          type: "rebalance",
          amount: rebalanceAmt,
          opening_cash: opening,
          current_cash: agentBalances.cash_drawer,
          provider_ref: "bank",
          provider_txn_id: null,
        });
      } else if (agentBalances.cash_drawer > 400000) {
        // Deposit cash to bank to clear clutter
        const rebalanceAmt = rng.nextInt(150000, 250000);
        const timestamp = `${dayStr}T08:15:00Z`;
        const opening = agentBalances.cash_drawer;
        agentBalances.cash_drawer -= rebalanceAmt;
        cashDrawerLedger.push({
          entry_id: `DRW-REB-${++drawerCounter}`,
          agent_id: agent.id,
          timestamp,
          type: "rebalance",
          amount: rebalanceAmt * -1,
          opening_cash: opening,
          current_cash: agentBalances.cash_drawer,
          provider_ref: "bank",
          provider_txn_id: null,
        });
      }

      // Rebalance provider balances if they run dry (e-money rebalancing)
      for (const prov of ["bkash", "nagad", "rocket"] as const) {
        if (agentBalances[prov] < 15000) {
          const topUp = rng.nextInt(50000, 100000);
          agentBalances[prov] += topUp;
          // In real agent shop, e-money top-up is a payment from drawer or external bank
          // Let's record a cash drawer withdrawal to represent cash to e-money exchange
          const timestamp = `${dayStr}T08:20:00Z`;
          if (agentBalances.cash_drawer >= topUp) {
            const opening = agentBalances.cash_drawer;
            agentBalances.cash_drawer -= topUp;
            cashDrawerLedger.push({
              entry_id: `DRW-EM-${++drawerCounter}`,
              agent_id: agent.id,
              timestamp,
              type: "rebalance",
              amount: topUp * -1,
              opening_cash: opening,
              current_cash: agentBalances.cash_drawer,
              provider_ref: prov,
              provider_txn_id: `REB-${prov.toUpperCase()}-${topUp}`,
            });
          }
        }
      }

      // Generate regular transactions for this day
      for (let i = 0; i < targetCount; i++) {
        // Operating hours: 8:00 to 22:00. Sparse overnight.
        const isOvernight = rng.next() < 0.05; // 5% chance of overnight
        let hour = rng.nextInt(8, 21);
        if (isOvernight) {
          hour = rng.next() < 0.5 ? rng.nextInt(22, 23) : rng.nextInt(0, 7);
        }
        const minute = rng.choice([0, 15, 30, 45]);
        const second = rng.nextInt(0, 59);
        const timestamp = `${dayStr}T${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}:${second.toString().padStart(2, "0")}Z`;

        // Select provider based on typical market share: bKash (55%), Nagad (30%), Rocket (15%)
        const roll = rng.next();
        let provider: "bkash" | "nagad" | "rocket" = "bkash";
        if (roll > 0.55 && roll <= 0.85) provider = "nagad";
        else if (roll > 0.85) provider = "rocket";

        // Select type: Cash Out (withdrawals, 60%) is slightly more common than Cash In (deposits, 40%)
        const typeRoll = rng.next();
        const type: "cash_in" | "cash_out" = typeRoll < 0.4 ? "cash_in" : "cash_out";

        // Transaction limits in Bangladesh: 25,000 BDT max per transaction. Avg txn is 1,500 - 8,000 BDT
        const amount = rng.choice([500, 1000, 1500, 2000, 3000, 5000, 8000, 10000, 15000, 20000, 25000]);

        // Validate balances
        const currentProviderBal = agentBalances[provider];
        if (type === "cash_in" && currentProviderBal < amount) {
          // Skip or convert to cash_out if agent runs out of digital liquidity
          continue;
        }

        // Apply transaction
        const opBal = currentProviderBal;
        let currBal = currentProviderBal;

        if (type === "cash_in") {
          currBal = opBal - amount;
          agentBalances[provider] = currBal;
          // Drawer cash increases
          const drwOpening = agentBalances.cash_drawer;
          agentBalances.cash_drawer += amount;
          
          const txnId = `${provider.substring(0, 2).toUpperCase()}-TXN-${provider === "bkash" ? ++bkashTxnCounter : provider === "nagad" ? ++nagadTxnCounter : ++rocketTxnCounter}`;
          const txn: Transaction = {
            transaction_id: txnId,
            agent_id: agent.id,
            area: agent.area,
            timestamp,
            type,
            amount,
            status: "SUCCESS",
            opening_balance: opBal,
            current_balance: currBal,
            event_flags: "",
            case_status: "NONE",
            is_ground_truth_anomaly: false,
            anomaly_type: null,
          };

          if (provider === "bkash") bkashTransactions.push(txn);
          else if (provider === "nagad") nagadTransactions.push(txn);
          else rocketTransactions.push(txn);

          cashDrawerLedger.push({
            entry_id: `DRW-TXN-${++drawerCounter}`,
            agent_id: agent.id,
            timestamp,
            type: "cash_in",
            amount,
            opening_cash: drwOpening,
            current_cash: agentBalances.cash_drawer,
            provider_ref: provider,
            provider_txn_id: txnId,
          });
        } else {
          // cash_out
          currBal = opBal + amount;
          agentBalances[provider] = currBal;
          // Drawer cash decreases
          const drwOpening = agentBalances.cash_drawer;
          agentBalances.cash_drawer -= amount;

          const txnId = `${provider.substring(0, 2).toUpperCase()}-TXN-${provider === "bkash" ? ++bkashTxnCounter : provider === "nagad" ? ++nagadTxnCounter : ++rocketTxnCounter}`;
          const txn: Transaction = {
            transaction_id: txnId,
            agent_id: agent.id,
            area: agent.area,
            timestamp,
            type,
            amount,
            status: "SUCCESS",
            opening_balance: opBal,
            current_balance: currBal,
            event_flags: "",
            case_status: "NONE",
            is_ground_truth_anomaly: false,
            anomaly_type: null,
          };

          if (provider === "bkash") bkashTransactions.push(txn);
          else if (provider === "nagad") nagadTransactions.push(txn);
          else rocketTransactions.push(txn);

          cashDrawerLedger.push({
            entry_id: `DRW-TXN-${++drawerCounter}`,
            agent_id: agent.id,
            timestamp,
            type: "cash_out",
            amount: amount * -1,
            opening_cash: drwOpening,
            current_cash: agentBalances.cash_drawer,
            provider_ref: provider,
            provider_txn_id: txnId,
          });
        }
      }
    }

    // INJECT 50 GROUND-TRUTH ANOMALIES
    // If this day is marked as an anomaly day, and we still have budget, let's inject a realistic anomaly pattern!
    if (anomalyDays.has(dayStr) && anomalyCount < 50) {
      // Pick a random agent and provider for the anomaly
      const agent = rng.choice(AGENTS);
      const provider = rng.choice(["bkash", "nagad", "rocket"] as const);
      const agentBalances = balances[agent.id];
      const hour = rng.nextInt(10, 18);
      const anomalyTypes = ["repeated_amount", "sudden_burst", "provider_concentration", "feed_delay", "feed_conflict"];
      const currentAnomalyType = anomalyTypes[anomalyCount % anomalyTypes.length];

      if (currentAnomalyType === "repeated_amount") {
        // Inject 5 identical cash-out transactions of 25,000 BDT within a 20-minute window
        // Indicating a potential structuring exploit or illicit transaction consolidation.
        const baseTxnId = provider === "bkash" ? bkashTxnCounter : provider === "nagad" ? nagadTxnCounter : rocketTxnCounter;
        for (let idx = 1; idx <= 5; idx++) {
          const timestamp = `${dayStr}T${hour}:1${idx}:00Z`;
          const opBal = agentBalances[provider];
          const amount = 25000;
          const currBal = opBal + amount;
          agentBalances[provider] = currBal;

          const drwOpening = agentBalances.cash_drawer;
          agentBalances.cash_drawer -= amount;

          const txnId = `${provider.substring(0, 2).toUpperCase()}-TXN-${provider === "bkash" ? ++bkashTxnCounter : provider === "nagad" ? ++nagadTxnCounter : ++rocketTxnCounter}`;
          const txn: Transaction = {
            transaction_id: txnId,
            agent_id: agent.id,
            area: agent.area,
            timestamp,
            type: "cash_out",
            amount,
            status: "SUCCESS",
            opening_balance: opBal,
            current_balance: currBal,
            event_flags: "structured_volume,repeated_limit",
            case_status: "PENDING_REVIEW",
            is_ground_truth_anomaly: true,
            anomaly_type: "repeated_amount",
          };

          if (provider === "bkash") bkashTransactions.push(txn);
          else if (provider === "nagad") nagadTransactions.push(txn);
          else rocketTransactions.push(txn);

          cashDrawerLedger.push({
            entry_id: `DRW-TXN-${++drawerCounter}`,
            agent_id: agent.id,
            timestamp,
            type: "cash_out",
            amount: amount * -1,
            opening_cash: drwOpening,
            current_cash: agentBalances.cash_drawer,
            provider_ref: provider,
            provider_txn_id: txnId,
          });
        }
        injectedAnomalies.push({ provider, agent: agent.id, date: dayStr, type: "repeated_amount" });
        anomalyCount++;
      } 
      else if (currentAnomalyType === "sudden_burst") {
        // Inject a rapid velocity spike of 12 cash-out transactions of moderate sizes within 45 minutes
        // Depleting cash drawer to an extreme degree.
        for (let idx = 1; idx <= 12; idx++) {
          const timestamp = `${dayStr}T${hour}:${idx.toString().padStart(2, "0")}:30Z`;
          const opBal = agentBalances[provider];
          const amount = rng.choice([8000, 10000, 12000]);
          const currBal = opBal + amount;
          agentBalances[provider] = currBal;

          const drwOpening = agentBalances.cash_drawer;
          agentBalances.cash_drawer -= amount;

          const txnId = `${provider.substring(0, 2).toUpperCase()}-TXN-${provider === "bkash" ? ++bkashTxnCounter : provider === "nagad" ? ++nagadTxnCounter : ++rocketTxnCounter}`;
          const txn: Transaction = {
            transaction_id: txnId,
            agent_id: agent.id,
            area: agent.area,
            timestamp,
            type: "cash_out",
            amount,
            status: "SUCCESS",
            opening_balance: opBal,
            current_balance: currBal,
            event_flags: "velocity_burst,drawer_depletion",
            case_status: "PENDING_REVIEW",
            is_ground_truth_anomaly: true,
            anomaly_type: "sudden_burst",
          };

          if (provider === "bkash") bkashTransactions.push(txn);
          else if (provider === "nagad") nagadTransactions.push(txn);
          else rocketTransactions.push(txn);

          cashDrawerLedger.push({
            entry_id: `DRW-TXN-${++drawerCounter}`,
            agent_id: agent.id,
            timestamp,
            type: "cash_out",
            amount: amount * -1,
            opening_cash: drwOpening,
            current_cash: agentBalances.cash_drawer,
            provider_ref: provider,
            provider_txn_id: txnId,
          });
        }
        injectedAnomalies.push({ provider, agent: agent.id, date: dayStr, type: "sudden_burst" });
        anomalyCount++;
      }
      else if (currentAnomalyType === "provider_concentration") {
        // High concentration anomaly: inside a 2-hour window, Nagad has 10 transactions, bKash has 0, Rocket has 0
        // Indicating a sudden single-provider exploit or extreme promotional abuse.
        for (let idx = 1; idx <= 8; idx++) {
          const timestamp = `${dayStr}T${hour}:${(idx * 10).toString().padStart(2, "0")}:00Z`;
          const opBal = agentBalances["nagad"];
          const amount = 15000;
          const currBal = opBal + amount;
          agentBalances["nagad"] = currBal;

          const drwOpening = agentBalances.cash_drawer;
          agentBalances.cash_drawer -= amount;

          const txnId = `NA-TXN-${++nagadTxnCounter}`;
          const txn: Transaction = {
            transaction_id: txnId,
            agent_id: agent.id,
            area: agent.area,
            timestamp,
            type: "cash_out",
            amount,
            status: "SUCCESS",
            opening_balance: opBal,
            current_balance: currBal,
            event_flags: "provider_spike,monopoly_imbalance",
            case_status: "PENDING_REVIEW",
            is_ground_truth_anomaly: true,
            anomaly_type: "provider_concentration",
          };

          nagadTransactions.push(txn);

          cashDrawerLedger.push({
            entry_id: `DRW-TXN-${++drawerCounter}`,
            agent_id: agent.id,
            timestamp,
            type: "cash_out",
            amount: amount * -1,
            opening_cash: drwOpening,
            current_cash: agentBalances.cash_drawer,
            provider_ref: "nagad",
            provider_txn_id: txnId,
          });
        }
        injectedAnomalies.push({ provider: "nagad", agent: agent.id, date: dayStr, type: "provider_concentration" });
        anomalyCount++;
      }
      else if (currentAnomalyType === "feed_delay") {
        // Late processing delay: transaction happens at 23:30 (night), but isn't pushed to feed until next day at 08:30
        // Marked with status SUCCESS but flagged as delayed.
        const txnId = `${provider.substring(0, 2).toUpperCase()}-TXN-${provider === "bkash" ? ++bkashTxnCounter : provider === "nagad" ? ++nagadTxnCounter : ++rocketTxnCounter}`;
        const txnTime = `${dayStr}T23:30:00Z`;
        const feedTime = `${dayStr}T08:30:00Z`; // logged late

        const opBal = agentBalances[provider];
        const amount = 22000;
        const currBal = opBal - amount; // cash_in
        agentBalances[provider] = currBal;

        const drwOpening = agentBalances.cash_drawer;
        agentBalances.cash_drawer += amount;

        const txn: Transaction = {
          transaction_id: txnId,
          agent_id: agent.id,
          area: agent.area,
          timestamp: txnTime,
          type: "cash_in",
          amount,
          status: "DELAYED",
          opening_balance: opBal,
          current_balance: currBal,
          event_flags: "feed_delay,offline_transaction",
          case_status: "PENDING_REVIEW",
          is_ground_truth_anomaly: true,
          anomaly_type: "feed_delay",
        };

        if (provider === "bkash") bkashTransactions.push(txn);
        else if (provider === "nagad") nagadTransactions.push(txn);
        else rocketTransactions.push(txn);

        cashDrawerLedger.push({
          entry_id: `DRW-TXN-${++drawerCounter}`,
          agent_id: agent.id,
          timestamp: txnTime,
          type: "cash_in",
          amount,
          opening_cash: drwOpening,
          current_cash: agentBalances.cash_drawer,
          provider_ref: provider,
          provider_txn_id: txnId,
        });

        injectedAnomalies.push({ provider, agent: agent.id, date: dayStr, type: "feed_delay" });
        anomalyCount++;
      }
      else if (currentAnomalyType === "feed_conflict") {
        // Feed conflict/Mismatched Balance:
        // A transaction states its opening balance as X, but the actual preceding transaction closed at Y (X != Y)
        // This is a direct sign of a manual override, server sync bug, or split-second account spoof.
        const txnId1 = `${provider.substring(0, 2).toUpperCase()}-TXN-${provider === "bkash" ? ++bkashTxnCounter : provider === "nagad" ? ++nagadTxnCounter : ++rocketTxnCounter}`;
        const timestamp1 = `${dayStr}T${hour}:40:00Z`;
        const timestamp2 = `${dayStr}T${hour}:42:00Z`;

        const opBal = agentBalances[provider];
        const amount = 10000;
        const currBal = opBal + amount; // cash_out
        agentBalances[provider] = currBal;

        const drwOpening = agentBalances.cash_drawer;
        agentBalances.cash_drawer -= amount;

        const txn1: Transaction = {
          transaction_id: txnId1,
          agent_id: agent.id,
          area: agent.area,
          timestamp: timestamp1,
          type: "cash_out",
          amount,
          status: "SUCCESS",
          opening_balance: opBal,
          current_balance: currBal,
          event_flags: "",
          case_status: "NONE",
          is_ground_truth_anomaly: false,
          anomaly_type: null,
        };

        if (provider === "bkash") bkashTransactions.push(txn1);
        else if (provider === "nagad") nagadTransactions.push(txn1);
        else rocketTransactions.push(txn1);

        cashDrawerLedger.push({
          entry_id: `DRW-TXN-${++drawerCounter}`,
          agent_id: agent.id,
          timestamp: timestamp1,
          type: "cash_out",
          amount: amount * -1,
          opening_cash: drwOpening,
          current_cash: agentBalances.cash_drawer,
          provider_ref: provider,
          provider_txn_id: txnId1,
        });

        // Next transaction has a conflict! It has opening_balance !== previous current_balance
        const txnId2 = `${provider.substring(0, 2).toUpperCase()}-TXN-${provider === "bkash" ? ++bkashTxnCounter : provider === "nagad" ? ++nagadTxnCounter : ++rocketTxnCounter}`;
        const conflictOpening = currBal - 50000; // Tampered! Discrepancy of 50,000 BDT
        const currBal2 = conflictOpening + amount;
        agentBalances[provider] = currBal2; // update system to sync with database

        const drwOpening2 = agentBalances.cash_drawer;
        agentBalances.cash_drawer -= amount;

        const txn2: Transaction = {
          transaction_id: txnId2,
          agent_id: agent.id,
          area: agent.area,
          timestamp: timestamp2,
          type: "cash_out",
          amount,
          status: "SUCCESS",
          opening_balance: conflictOpening, // mismatch!
          current_balance: currBal2,
          event_flags: "balance_mismatch,feed_conflict",
          case_status: "PENDING_REVIEW",
          is_ground_truth_anomaly: true,
          anomaly_type: "feed_conflict",
        };

        if (provider === "bkash") bkashTransactions.push(txn2);
        else if (provider === "nagad") nagadTransactions.push(txn2);
        else rocketTransactions.push(txn2);

        cashDrawerLedger.push({
          entry_id: `DRW-TXN-${++drawerCounter}`,
          agent_id: agent.id,
          timestamp: timestamp2,
          type: "cash_out",
          amount: amount * -1,
          opening_cash: drwOpening2,
          current_cash: agentBalances.cash_drawer,
          provider_ref: provider,
          provider_txn_id: txnId2,
        });

        injectedAnomalies.push({ provider, agent: agent.id, date: dayStr, type: "feed_conflict" });
        anomalyCount++;
      }
    }
  }

  console.log(`Generated totals:`);
  console.log(`- bKash: ${bkashTransactions.length} transactions`);
  console.log(`- Nagad: ${nagadTransactions.length} transactions`);
  console.log(`- Rocket: ${rocketTransactions.length} transactions`);
  console.log(`- Cash Drawer: ${cashDrawerLedger.length} ledger entries`);
  console.log(`- Injected Ground-Truth Anomalies: ${anomalyCount}`);

  // Convert to CSV strings
  const toCSV = (data: any[], headers: string[]) => {
    const csvRows = [headers.join(",")];
    for (const row of data) {
      const values = headers.map(header => {
        const val = row[header];
        if (val === null || val === undefined) return "";
        // If string contains comma, wrap in quotes
        const valStr = String(val);
        if (valStr.includes(",") || valStr.includes("\"") || valStr.includes("\n")) {
          return `"${valStr.replace(/"/g, '""')}"`;
        }
        return valStr;
      });
      csvRows.push(values.join(","));
    }
    return csvRows.join("\n");
  };

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

  const drawerHeaders = [
    "entry_id",
    "agent_id",
    "timestamp",
    "type",
    "amount",
    "opening_cash",
    "current_cash",
    "provider_ref",
    "provider_txn_id"
  ];

  const dir = path.join(process.cwd(), "db_files");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(path.join(dir, "bkash.csv"), toCSV(bkashTransactions, txnHeaders));
  fs.writeFileSync(path.join(dir, "nagad.csv"), toCSV(nagadTransactions, txnHeaders));
  fs.writeFileSync(path.join(dir, "rocket.csv"), toCSV(rocketTransactions, txnHeaders));
  fs.writeFileSync(path.join(dir, "cash_drawer_ledger.csv"), toCSV(cashDrawerLedger, drawerHeaders));

  // Seed sample users with their credentials and role claims
  // (In real apps, passwords would be hashed. For this prototype, a simple demo auth is implemented)
  const users = [
    { username: "agent1", password: "password123", role: "AGENT", scope: "AGENT-001", description: "Agent for Maa Telecom (Gulshan)" },
    { username: "agent2", password: "password123", role: "AGENT", scope: "AGENT-002", description: "Agent for Roni Enterprise (Motijheel)" },
    { username: "agent5", password: "password123", role: "AGENT", scope: "AGENT-005", description: "Agent for Sreepur Bazar Agency (Semi-Urban)" },
    { username: "bkash_ops", password: "password123", role: "PROVIDER_OPS", scope: "bkash", description: "bKash Operations Team member" },
    { username: "nagad_ops", password: "password123", role: "PROVIDER_OPS", scope: "nagad", description: "Nagad Operations Team member" },
    { username: "rocket_ops", password: "password123", role: "PROVIDER_OPS", scope: "rocket", description: "Rocket Operations Team member" },
    { username: "bkash_risk", password: "password123", role: "RISK_ANALYST", scope: "bkash", description: "bKash Risk Compliance Analyst" },
    { username: "management", password: "password123", role: "MANAGEMENT", scope: "global", description: "Cross-provider Management Dashboard user (aggregated only)" },
    { username: "shop_owner", password: "password123", role: "SHOP_OWNER", scope: "all_agents", description: "Agent Shop Owner of all 8 locations (full combined drawer details)" }
  ];
  fs.writeFileSync(path.join(dir, "users.json"), JSON.stringify(users, null, 2));

  // Generate the anomalies log for DATA_NOTES.md
  return {
    anomalies: injectedAnomalies,
    totalAnomalies: anomalyCount,
    bkashCount: bkashTransactions.length,
    nagadCount: nagadTransactions.length,
    rocketCount: rocketTransactions.length,
    drawerCount: cashDrawerLedger.length,
  };
}

// If run directly
if (process.argv[1] && process.argv[1].endsWith("generate-data.ts")) {
  const result = generateEcosystemData();
  console.log("SUCCESSFULLY GENERATED DATA!");
}
