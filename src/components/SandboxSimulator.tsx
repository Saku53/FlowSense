import React, { useState, useEffect } from "react";
import { 
  Play, 
  Settings2, 
  Activity, 
  Sliders, 
  Terminal, 
  Sparkles, 
  AlertOctagon, 
  ShieldCheck, 
  ChevronDown, 
  ChevronUp,
  Cpu,
  RefreshCw,
  HelpCircle,
  TrendingDown
} from "lucide-react";
import { User } from "../types";

interface Props {
  token: string | null;
  currentUser: User;
  onSimulationTriggered: () => void;
}

export default function SandboxSimulator({ token, currentUser, onSimulationTriggered }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"injector" | "parameters">("injector");

  // Injector state
  const [selectedAgent, setSelectedAgent] = useState("AGENT-001");
  const [selectedProvider, setSelectedProvider] = useState<"bkash" | "nagad" | "rocket">("bkash");
  const [txType, setTxType] = useState<"cash_in" | "cash_out">("cash_out");
  const [amount, setAmount] = useState<number>(18500);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [simulationResponse, setSimulationResponse] = useState<any>(null);

  // Parameters tuning state
  const [zScore, setZScore] = useState<number>(4.5);
  const [minUnusualAmt, setMinUnusualAmt] = useState<number>(20000);
  const [repCount, setRepCount] = useState<number>(5);
  const [repWindow, setRepWindow] = useState<number>(20);
  const [repMinAmt, setRepMinAmt] = useState<number>(15000);
  const [burstCount, setBurstCount] = useState<number>(12);
  const [burstWindow, setBurstWindow] = useState<number>(45);
  const [savingParams, setSavingParams] = useState(false);

  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Available agents matching dropdown selections
  const agentsList = ["AGENT-001", "AGENT-002", "AGENT-003", "AGENT-004", "AGENT-005", "AGENT-006", "AGENT-007", "AGENT-008"];

  // Available providers matching roles or general access
  const providersList: Array<{ id: "bkash" | "nagad" | "rocket"; name: string }> = [
    { id: "bkash", name: "bKash" },
    { id: "nagad", name: "Nagad" },
    { id: "rocket", name: "Rocket" }
  ].filter(p => {
    if (currentUser.role === "PROVIDER_OPS" || currentUser.role === "RISK_ANALYST") {
      return currentUser.scope === "global" || currentUser.scope === p.id;
    }
    return true;
  }) as any;

  // Retrieve active parameters from the backend on load
  const fetchParameters = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/simulation/parameters", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setZScore(data.config.zScoreThreshold);
          setMinUnusualAmt(data.config.minUnusualVolumeAmount);
          setRepCount(data.config.repeatedCountThreshold);
          setRepWindow(data.config.repeatedWindowMins);
          setRepMinAmt(data.config.repeatedMinAmount);
          setBurstCount(data.config.burstCountThreshold);
          setBurstWindow(data.config.burstWindowMins);
        }
      }
    } catch (err) {
      console.error("Failed to load active simulation parameters", err);
    }
  };

  useEffect(() => {
    if (token) {
      fetchParameters();
    }
  }, [token]);

  // Handle Dynamic Sensitivity Parameters Adjustment
  const handleSaveParameters = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSavingParams(true);
    setNotification(null);
    try {
      const res = await fetch("/api/simulation/parameters", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          config: {
            zScoreThreshold: Number(zScore),
            minUnusualVolumeAmount: Number(minUnusualAmt),
            repeatedCountThreshold: Number(repCount),
            repeatedWindowMins: Number(repWindow),
            repeatedMinAmount: Number(repMinAmt),
            burstCountThreshold: Number(burstCount),
            burstWindowMins: Number(burstWindow)
          }
        })
      });

      if (!res.ok) {
        throw new Error("Failed to save dynamic parameters.");
      }

      const data = await res.json();
      setNotification({
        type: "success",
        message: "Sensitivity thresholds updated live! The model will adapt instantly."
      });
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setNotification({ type: "error", message: err.message });
    } finally {
      setSavingParams(false);
    }
  };

  // Run Scenario Simulation Injection
  const handleInject = async (scenario: string | null) => {
    if (!token) return;
    setIsSubmitting(true);
    setNotification(null);
    setSimulationResponse(null);

    try {
      const res = await fetch("/api/simulation/inject", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          provider: selectedProvider,
          agentId: selectedAgent,
          type: txType,
          amount: Number(amount),
          scenario: scenario
        })
      });

      if (!res.ok) {
        let errMsg = "Failed to inject simulated transaction sequence.";
        try {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errData = await res.json();
            errMsg = errData.error || errMsg;
          } else {
            const textText = await res.text();
            if (textText.trim().startsWith("<")) {
              errMsg = `Simulation service offline (${res.status}).`;
            } else {
              errMsg = `Error (${res.status}): ${textText.substring(0, 100)}`;
            }
          }
        } catch (parseErr) {
          errMsg = `HTTP error ${res.status}`;
        }
        throw new Error(errMsg);
      }

      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        throw new Error("Received malformed simulation response. Please retry.");
      }
      setSimulationResponse(data);
      setNotification({
        type: "success",
        message: `Simulation Completed! Injected ${data.insertedCount} rows successfully.`
      });
      
      // Trigger outer refresh
      onSimulationTriggered();
    } catch (err: any) {
      setNotification({ type: "error", message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="dynamic-simulation-sandbox" className="bg-white border-2 border-[#141414] shadow-[4px_4px_0px_#141414] rounded-none">
      {/* Header Bar */}
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 bg-[#F1EFEA] hover:bg-[#EAE7E0] transition-colors border-b-2 border-[#141414] rounded-none text-left cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <Cpu className="w-5 h-5 text-[#141414] animate-pulse" />
          <div>
            <h3 className="font-sans font-black text-sm text-[#141414] uppercase tracking-wide flex items-center gap-2">
              FlowSense Interactive Sandbox & Simulator
              <span className="bg-emerald-800 text-white text-[9px] font-mono px-1.5 py-0.5 font-bold uppercase rounded-none border border-[#141414]">
                Live
              </span>
            </h3>
            <p className="text-[11px] text-slate-600 font-sans mt-0.5">
              Inject custom MFS traffic, test threat scenarios, and tune anomaly detection thresholds in real-time.
            </p>
          </div>
        </div>
        <div>
          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </button>

      {/* Expanded Sandbox Panel */}
      {isExpanded && (
        <div className="p-4 md:p-5 flex flex-col gap-4">
          
          {/* Notification Bar */}
          {notification && (
            <div className={`p-3 border-2 font-mono text-xs flex items-center justify-between rounded-none ${
              notification.type === "success" 
                ? "bg-emerald-50 border-emerald-800 text-emerald-950" 
                : "bg-rose-50 border-rose-800 text-rose-950"
            }`}>
              <div className="flex items-center gap-2">
                <span className="font-bold">{notification.type === "success" ? "✓ SUCCESS:" : "⚠ ERROR:"}</span>
                <span>{notification.message}</span>
              </div>
              <button onClick={() => setNotification(null)} className="font-bold hover:underline">Dismiss</button>
            </div>
          )}

          {/* Tab Selector */}
          <div className="flex border-b border-[#141414] gap-2">
            <button
              onClick={() => setActiveTab("injector")}
              className={`px-4 py-2 text-xs font-mono font-bold uppercase tracking-tight border-t-2 border-x-2 rounded-none -mb-px transition-all cursor-pointer ${
                activeTab === "injector"
                  ? "bg-white border-[#141414] text-[#141414] border-b-white"
                  : "bg-[#F1EFEA] border-transparent text-slate-600 hover:text-[#141414] hover:bg-[#EAE7E0]"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Play className="w-3.5 h-3.5" />
                Live Event Injector
              </span>
            </button>
            <button
              onClick={() => setActiveTab("parameters")}
              className={`px-4 py-2 text-xs font-mono font-bold uppercase tracking-tight border-t-2 border-x-2 rounded-none -mb-px transition-all cursor-pointer ${
                activeTab === "parameters"
                  ? "bg-white border-[#141414] text-[#141414] border-b-white"
                  : "bg-[#F1EFEA] border-transparent text-slate-600 hover:text-[#141414] hover:bg-[#EAE7E0]"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" />
                Risk Parameters Tuning
              </span>
            </button>
          </div>

          {/* TAB 1: EVENT INJECTOR */}
          {activeTab === "injector" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              
              {/* Left Settings inputs */}
              <div className="lg:col-span-5 flex flex-col gap-3.5 border-r border-[#141414] pr-0 lg:pr-5">
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-1 flex items-center gap-1">
                  <Settings2 className="w-4 h-4" />
                  Base Transaction Settings
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-600 font-bold uppercase mb-1">Target Agent</label>
                    <div className="relative">
                      <select
                        value={selectedAgent}
                        onChange={(e) => setSelectedAgent(e.target.value)}
                        className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs font-mono font-bold text-[#141414] rounded-none appearance-none focus:outline-none"
                      >
                        {agentsList.map(id => (
                          <option key={id} value={id}>{id}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-slate-600 font-bold uppercase mb-1">MFS Provider</label>
                    <select
                      value={selectedProvider}
                      onChange={(e: any) => setSelectedProvider(e.target.value)}
                      className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs font-mono font-bold text-[#141414] rounded-none appearance-none focus:outline-none"
                    >
                      {providersList.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-600 font-bold uppercase mb-1">TXN Type</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setTxType("cash_in")}
                        className={`flex-1 py-1.5 border text-xs font-mono font-bold uppercase rounded-none transition-colors ${
                          txType === "cash_in"
                            ? "bg-[#141414] text-white border-[#141414]"
                            : "bg-white text-slate-600 border-[#141414] hover:bg-slate-50"
                        }`}
                      >
                        Cash In
                      </button>
                      <button
                        onClick={() => setTxType("cash_out")}
                        className={`flex-1 py-1.5 border text-xs font-mono font-bold uppercase rounded-none transition-colors ${
                          txType === "cash_out"
                            ? "bg-[#141414] text-white border-[#141414]"
                            : "bg-white text-slate-600 border-[#141414] hover:bg-slate-50"
                        }`}
                      >
                        Cash Out
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-slate-600 font-bold uppercase mb-1">Amount (BDT)</label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(Math.max(10, Number(e.target.value)))}
                      className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs font-mono font-bold text-[#141414] rounded-none focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mt-2 bg-[#F1EFEA] p-3 border border-[#141414]">
                  <div className="flex gap-1.5 items-center text-[10px] font-mono font-bold text-[#141414] mb-1">
                    <Activity className="w-3.5 h-3.5" />
                    SYSTEM EFFECTS EXPLAINER:
                  </div>
                  <p className="text-[10px] text-slate-700 leading-relaxed font-sans">
                    {txType === "cash_in" 
                      ? "Depositing money to customer wallet drains the agent's digital provider balance and increases their physical drawer cash."
                      : "Withdrawing customer cash increases the agent's digital provider balance and drains physical drawer cash."
                    }
                  </p>
                </div>
              </div>

              {/* Threat Scenario Action Buttons */}
              <div className="lg:col-span-7 flex flex-col gap-3">
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1">
                  <Play className="w-4 h-4 text-emerald-800" />
                  Select Simulation Scenario
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  
                  {/* Scenario 0: Standard Benign */}
                  <button
                    disabled={isSubmitting}
                    onClick={() => handleInject(null)}
                    className="flex flex-col text-left p-3 border border-[#141414] hover:bg-slate-50 hover:shadow-[2px_2px_0px_#141414] transition-all group disabled:opacity-50 cursor-pointer rounded-none"
                  >
                    <span className="text-xs font-bold font-sans text-slate-900 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                      1. Standard Benign Traffic
                    </span>
                    <span className="text-[10px] text-slate-500 mt-1">
                      Inject a single successful, compliant transaction to simulate standard daily operations.
                    </span>
                  </button>

                  {/* Scenario 1: Structuring (Repeated Amount) */}
                  <button
                    disabled={isSubmitting}
                    onClick={() => handleInject("repeated_amount")}
                    className="flex flex-col text-left p-3 border border-[#141414] hover:bg-rose-50 hover:border-rose-900 hover:shadow-[2px_2px_0px_#9f1239] transition-all group disabled:opacity-50 cursor-pointer rounded-none"
                  >
                    <span className="text-xs font-bold font-sans text-rose-950 flex items-center gap-1">
                      <AlertOctagon className="w-3.5 h-3.5 text-rose-800 animate-pulse" />
                      2. Structuring (Smurfing)
                    </span>
                    <span className="text-[10px] text-slate-600 mt-1">
                      Auto-inject {repCount} identical transactions of {repMinAmt.toLocaleString()} BDT back-to-back, triggering a structural smurfing alarm.
                    </span>
                  </button>

                  {/* Scenario 2: Sudden Cash Run Burst */}
                  <button
                    disabled={isSubmitting}
                    onClick={() => handleInject("sudden_burst")}
                    className="flex flex-col text-left p-3 border border-[#141414] hover:bg-rose-50 hover:border-rose-900 hover:shadow-[2px_2px_0px_#9f1239] transition-all group disabled:opacity-50 cursor-pointer rounded-none"
                  >
                    <span className="text-xs font-bold font-sans text-rose-950 flex items-center gap-1">
                      <TrendingDown className="w-3.5 h-3.5 text-rose-800" />
                      3. Sudden Cash Run Burst
                    </span>
                    <span className="text-[10px] text-slate-600 mt-1">
                      Inject {burstCount} sequential Cash-Out requests in {burstWindow} minutes to simulate a sudden, severe cash drawer drainage burst.
                    </span>
                  </button>

                  {/* Scenario 3: Ledger Gap / Feed Conflict */}
                  <button
                    disabled={isSubmitting}
                    onClick={() => handleInject("feed_conflict")}
                    className="flex flex-col text-left p-3 border border-[#141414] hover:bg-rose-50 hover:border-rose-900 hover:shadow-[2px_2px_0px_#9f1239] transition-all group disabled:opacity-50 cursor-pointer rounded-none"
                  >
                    <span className="text-xs font-bold font-sans text-rose-950 flex items-center gap-1">
                      <AlertOctagon className="w-3.5 h-3.5 text-rose-800" />
                      4. Ledger Gap / Feed Mismatch
                    </span>
                    <span className="text-[10px] text-slate-600 mt-1">
                      Force a balance gap inconsistency of BDT 45,000 between sequential blocks to test cryptographic ledger audits.
                    </span>
                  </button>

                  {/* Scenario 4: Extreme Unusual Volume */}
                  <button
                    disabled={isSubmitting}
                    onClick={() => handleInject("unusual_volume")}
                    className="flex flex-col text-left p-3 border border-[#141414] hover:bg-amber-50 hover:border-amber-900 hover:shadow-[2px_2px_0px_#b45309] transition-all group disabled:opacity-50 cursor-pointer rounded-none col-span-1 sm:col-span-2"
                  >
                    <span className="text-xs font-bold font-sans text-amber-950 flex items-center gap-1">
                      <AlertOctagon className="w-3.5 h-3.5 text-amber-800" />
                      5. Statistical Volume Spiker (High Robust Z-Score)
                    </span>
                    <span className="text-[10px] text-slate-600 mt-1">
                      Inject a single transaction of {Math.max(amount, minUnusualAmt + 5000).toLocaleString()} BDT, violating seasonal Expected Value baseline and robust Z-score limits.
                    </span>
                  </button>

                </div>

                {/* Output Terminal feedback */}
                {simulationResponse && (
                  <div className="mt-2 bg-[#141414] text-emerald-400 p-3 font-mono text-[10px] border border-[#141414] overflow-x-auto max-h-[140px] flex flex-col gap-1 shadow-inner">
                    <div className="flex items-center justify-between border-b border-slate-700 pb-1 text-slate-400 mb-1">
                      <span className="flex items-center gap-1">
                        <Terminal className="w-3 h-3 text-emerald-400" />
                        SIMULATION ENGINE OUTPUT TERMINAL
                      </span>
                      <span>100% SUCCESS</span>
                    </div>
                    <div>&gt; [SYSTEM] Connected to Stream Pipeline: {selectedProvider.toUpperCase()} | {selectedAgent}</div>
                    <div>&gt; [LEDGER] Inserted {simulationResponse.insertedCount} transactions successfully.</div>
                    {simulationResponse.alertsTriggeredCount > 0 ? (
                      <div className="text-rose-400 font-bold">
                        &gt; [ALERT] TRIGGERED {simulationResponse.alertsTriggeredCount} STREAMING ALERTS! 
                        {simulationResponse.alertsTriggered.map((a: any) => ` [${a.type.toUpperCase()} ID: ${a.alert_id}]`)}
                      </div>
                    ) : (
                      <div className="text-emerald-300">&gt; [MODEL] Zero anomalies triggered. Robust Z-score within normal bounds.</div>
                    )}
                    <div>&gt; [FORECAST] EWMAs re-computed. Dynamic forecast charts updated in real-time.</div>
                  </div>
                )}

              </div>

            </div>
          )}

          {/* TAB 2: PARAMETERS TUNING */}
          {activeTab === "parameters" && (
            <form onSubmit={handleSaveParameters} className="flex flex-col gap-4">
              <div className="bg-[#F1EFEA] p-3.5 border border-[#141414]">
                <div className="flex gap-1.5 items-center text-xs font-mono font-bold text-[#141414] mb-1">
                  <Sliders className="w-4 h-4 text-[#141414]" />
                  STATESTLESS ONLINE ESTIMATOR THRESHOLDS
                </div>
                <p className="text-[11px] text-slate-700 leading-relaxed font-sans">
                  The FlowSense streaming engine processes transactions as they arrive in $O(1)$-amortized time without full physical database sweeps. You can live-adjust baseline Z-scores, MAD, and windows.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                
                {/* Section A: Statistical & unusual volume */}
                <div className="flex flex-col gap-4 border-r border-transparent md:border-[#141414] pr-0 md:pr-5">
                  <div className="text-xs font-bold text-[#141414] uppercase tracking-wide border-b border-slate-200 pb-1">
                    Statistical Outlier Sensitivity
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-mono font-bold text-[#141414] mb-1">
                      <span className="flex items-center gap-1">
                        Robust Z-Score Threshold
                        <HelpCircle className="w-3.5 h-3.5 text-slate-400" title="Number of Median Absolute Deviations (MAD) away from seasonal baselines before alerting" />
                      </span>
                      <span>{zScore} MADs</span>
                    </div>
                    <input
                      type="range"
                      min="2.0"
                      max="7.0"
                      step="0.1"
                      value={zScore}
                      onChange={(e) => setZScore(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-none appearance-none cursor-pointer accent-[#141414]"
                    />
                    <span className="text-[10px] text-slate-500 font-sans block mt-1">
                      Lower values are hyper-sensitive (flag more false positives). Higher values flag only massive spikes.
                    </span>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-mono font-bold text-[#141414] mb-1">
                      <span>Minimum Outlier Volume (BDT)</span>
                      <span>{minUnusualAmt.toLocaleString()} BDT</span>
                    </div>
                    <input
                      type="number"
                      value={minUnusualAmt}
                      onChange={(e) => setMinUnusualAmt(Math.max(100, Number(e.target.value)))}
                      className="w-full bg-white border border-[#141414] px-2.5 py-1.5 text-xs font-mono font-bold text-[#141414] rounded-none focus:outline-none"
                    />
                  </div>
                </div>

                {/* Section B: Structuring & Velocity Bursts */}
                <div className="flex flex-col gap-4">
                  <div className="text-xs font-bold text-[#141414] uppercase tracking-wide border-b border-slate-200 pb-1">
                    Threat & Structuring Limits
                  </div>

                  {/* Structuring */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-1">
                      <label className="block text-[10px] font-mono text-slate-600 font-bold uppercase mb-1">Structuring Count</label>
                      <input
                        type="number"
                        value={repCount}
                        onChange={(e) => setRepCount(Math.max(2, Number(e.target.value)))}
                        className="w-full bg-white border border-[#141414] px-2 py-1 text-xs font-mono font-bold text-[#141414] rounded-none focus:outline-none"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-[10px] font-mono text-slate-600 font-bold uppercase mb-1">Window (Mins)</label>
                      <input
                        type="number"
                        value={repWindow}
                        onChange={(e) => setRepWindow(Math.max(1, Number(e.target.value)))}
                        className="w-full bg-white border border-[#141414] px-2 py-1 text-xs font-mono font-bold text-[#141414] rounded-none focus:outline-none"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-[10px] font-mono text-slate-600 font-bold uppercase mb-1">Min Value (BDT)</label>
                      <input
                        type="number"
                        value={repMinAmt}
                        onChange={(e) => setRepMinAmt(Math.max(100, Number(e.target.value)))}
                        className="w-full bg-white border border-[#141414] px-2 py-1 text-xs font-mono font-bold text-[#141414] rounded-none focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Velocity Bursts */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-mono text-slate-600 font-bold uppercase mb-1">Burst Withdrawal Count</label>
                      <input
                        type="number"
                        value={burstCount}
                        onChange={(e) => setBurstCount(Math.max(2, Number(e.target.value)))}
                        className="w-full bg-white border border-[#141414] px-2.5 py-1 text-xs font-mono font-bold text-[#141414] rounded-none focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono text-slate-600 font-bold uppercase mb-1">Burst Window (Mins)</label>
                      <input
                        type="number"
                        value={burstWindow}
                        onChange={(e) => setBurstWindow(Math.max(1, Number(e.target.value)))}
                        className="w-full bg-white border border-[#141414] px-2.5 py-1 text-xs font-mono font-bold text-[#141414] rounded-none focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

              </div>

              {/* Save Button */}
              <button
                type="submit"
                disabled={savingParams}
                className="self-end px-5 py-2.5 bg-[#141414] text-white border-2 border-[#141414] shadow-[2px_2px_0px_#141414] active:translate-y-0.5 active:shadow-[1px_1px_0px_#141414] font-mono text-xs font-bold uppercase tracking-wider rounded-none cursor-pointer transition-all hover:bg-slate-900 flex items-center gap-1.5 mt-2"
              >
                {savingParams ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sliders className="w-3.5 h-3.5" />}
                {savingParams ? "Saving Dynamic Model Config..." : "Apply Sensitivity Thresholds Live"}
              </button>
            </form>
          )}

        </div>
      )}
    </div>
  );
}
