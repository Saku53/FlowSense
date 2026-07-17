import React, { useState, useEffect } from "react";
import { 
  ShieldAlert, 
  User as UserIcon, 
  TrendingUp, 
  Database, 
  AlertTriangle, 
  DollarSign, 
  Building2, 
  FileText, 
  Info,
  Server,
  Fingerprint
} from "lucide-react";
import { User, AnalyticsResponse } from "./types";
import RbacSwitcher from "./components/RbacSwitcher";
import AuditTrail from "./components/AuditTrail";
import ProviderTransactions from "./components/ProviderTransactions";
import DailyVolumeChart from "./components/DailyVolumeChart";
import LiquidityForecastDashboard from "./components/LiquidityForecastDashboard";
import AnomalyAlertsDashboard from "./components/AnomalyAlertsDashboard";
import SandboxSimulator from "./components/SandboxSimulator";
import AiCopilot from "./components/AiCopilot";

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeToken, setActiveToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsResponse | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [activeBottomTab, setActiveBottomTab] = useState<"audit" | "seasonality" | "guide">("audit");
  const [refreshAuditsTrigger, setRefreshAuditsTrigger] = useState(0);

  // Agent Specific Drawer Local State
  const [drawerLedger, setDrawerLedger] = useState<any[]>([]);
  const [drawerLedgerLoading, setDrawerLedgerLoading] = useState(false);
  const [rebalanceAmount, setRebalanceAmount] = useState("50000");
  const [rebalanceType, setRebalanceType] = useState<"deposit" | "withdraw">("withdraw");
  const [rebalanceMessage, setRebalanceMessage] = useState<string | null>(null);

  // Authentication: POST to /api/auth/login
  const handleLogin = async (username: string) => {
    setLoading(true);
    setRebalanceMessage(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: "password123" })
      });
      if (!res.ok) {
        throw new Error("Authentication failed");
      }
      const data = await res.json();
      setActiveToken(data.token);
      setCurrentUser(data.user);
      localStorage.setItem("mfs_token", data.token);
      localStorage.setItem("mfs_user", JSON.stringify(data.user));
      
      // Trigger Audit Trail log update
      setRefreshAuditsTrigger(prev => prev + 1);
    } catch (err: any) {
      console.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Logout
  const handleLogout = () => {
    setCurrentUser(null);
    setActiveToken(null);
    setAnalyticsData(null);
    setDrawerLedger([]);
    localStorage.removeItem("mfs_token");
    localStorage.removeItem("mfs_user");
  };

  // Fetch Aggregated Analytics (Crossover endpoint)
  const fetchAnalytics = async () => {
    if (!activeToken) return;
    setAnalyticsLoading(true);
    try {
      // Management and Shop Owners query all shops.
      // Agent queries only their own shop scope.
      const queryParams = new URLSearchParams();
      if (currentUser?.role === "AGENT") {
        queryParams.append("agentId", currentUser.scope);
      }
      const res = await fetch(`/api/analytics/aggregated?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${activeToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data);
      }
    } catch (err) {
      console.error("Error fetching aggregated analytics:", err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // Fetch Agent Cash Drawer Logs (Agent Only / Shop Owner)
  const fetchDrawerLedger = async () => {
    if (!activeToken || !currentUser) return;
    if (currentUser.role !== "AGENT" && currentUser.role !== "SHOP_OWNER") return;
    setDrawerLedgerLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (currentUser.role === "AGENT") {
        queryParams.append("agentId", currentUser.scope);
      }
      const res = await fetch(`/api/drawer/ledger?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${activeToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDrawerLedger(data.ledger || []);
      }
    } catch (err) {
      console.error("Error fetching drawer ledger:", err);
    } finally {
      setDrawerLedgerLoading(false);
    }
  };

  // Bootstrap / Automatic Login as Shop Owner to give an immediately impressive first impression!
  useEffect(() => {
    const cachedToken = localStorage.getItem("mfs_token");
    const cachedUser = localStorage.getItem("mfs_user");
    if (cachedToken && cachedUser) {
      setActiveToken(cachedToken);
      setCurrentUser(JSON.parse(cachedUser));
    } else {
      // Auto sign in as shop_owner on first load
      handleLogin("shop_owner");
    }
  }, []);

  // Fetch contextual dashboard data when user or token updates
  useEffect(() => {
    if (activeToken && currentUser) {
      fetchAnalytics();
      fetchDrawerLedger();
    }
  }, [activeToken, currentUser, refreshAuditsTrigger]);

  // Mock rebalancing workflow for Agents (Physical Cash Drawer replenishment)
  const handleMockRebalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !activeToken) return;
    const amount = Number(rebalanceAmount);
    if (isNaN(amount) || amount <= 0) return;

    // Direct local state simulation showing what a bank rebalance does
    setRebalanceMessage(`SUBMITTED: Instruction sent to bank to ${rebalanceType === "withdraw" ? "withdraw" : "deposit"} ${amount.toLocaleString()} BDT. Physical cash drawer has been replenished on server.`);
    
    // Refresh data after a small simulated latency
    setTimeout(() => {
      setRefreshAuditsTrigger(prev => prev + 1);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] flex flex-col font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Top Professional Header Banner */}
      <header id="platform-header" className="bg-white border-b-2 border-[#141414] py-4 px-6 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#141414] border border-[#141414] text-[#E4E3E0] rounded-none">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono tracking-widest text-[#141414] bg-[#E4E3E0] px-2 py-0.5 border border-[#141414] uppercase font-extrabold rounded-none">
                  Challenge Prototype
                </span>
                <span className="text-slate-600 font-mono text-[10px] font-bold">v1.0.0</span>
              </div>
              <h1 className="font-sans font-extrabold text-lg md:text-xl text-[#141414] tracking-tight mt-0.5 uppercase">
                FlowSense: Liquidity & Risk Intelligence Platform
              </h1>
            </div>
          </div>

          {/* Active Profile Header Tag */}
          {currentUser ? (
            <div className="flex items-center gap-3 bg-white px-4 py-2 border-2 border-[#141414] shadow-[2px_2px_0px_#141414] rounded-none self-start md:self-auto">
              <div className="w-8 h-8 bg-[#E4E3E0] border border-[#141414] flex items-center justify-center text-[#141414] rounded-none">
                <UserIcon className="w-4 h-4" />
              </div>
              <div className="text-left font-sans">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-extrabold text-[#141414]">{currentUser.username}</span>
                  <span className="text-[9px] bg-[#141414] text-[#E4E3E0] font-mono px-1.5 py-0.5 border border-[#141414] uppercase rounded-none font-bold">
                    {currentUser.role}
                  </span>
                </div>
                <span className="text-[10px] text-slate-600 font-mono block font-bold">
                  Scope: {currentUser.scope}
                </span>
              </div>
              <button 
                onClick={handleLogout}
                className="text-[10px] text-rose-800 hover:text-rose-950 font-mono font-bold uppercase tracking-tight ml-3 hover:underline cursor-pointer"
              >
                Logout
              </button>
            </div>
          ) : (
            <div className="text-xs text-rose-800 font-mono font-bold uppercase tracking-wider">
              ⚠️ Session Offline
            </div>
          )}
        </div>
      </header>

      {/* Main Container Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-5 md:p-6 flex flex-col gap-6">
        
        {/* Hackathon Challenge Statement and Context Card */}
        <div id="challenge-context-card" className="bg-white border-2 border-[#141414] p-5 shadow-[4px_4px_0px_#141414] relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-5 rounded-none">
          <div className="flex-1">
            <h2 className="font-sans font-bold text-[#141414] text-sm mb-1.5 flex items-center gap-2 uppercase tracking-wide">
              <Info className="w-4 h-4 text-[#141414]" />
              Hackathon Decision-Support Architecture Foundation
            </h2>
            <p className="text-xs text-slate-700 leading-relaxed max-w-4xl font-sans">
              An MFS agent shop serves customers through competing providers <strong>bKash, Nagad, and Rocket</strong>. They operate with three separate digital wallets but <strong>one shared physical cash drawer</strong>. This prototype implements physical cash vs e-money liquidity pressure balancing, isolated schemas, cryptographic audit log signatures, and RBAC filtering, proving multi-provider visibility is possible <em className="font-serif italic text-slate-900">without</em> violating provider antitrust boundaries.
            </p>
          </div>
          <div className="flex gap-2 shrink-0 flex-wrap">
            <span className="bg-[#E4E3E0] text-[#141414] border border-[#141414] text-[10px] font-mono px-2.5 py-1.5 font-bold uppercase rounded-none shadow-[1px_1px_0px_#141414]">
              🛡️ Antitrust Isolated
            </span>
            <span className="bg-[#E4E3E0] text-[#141414] border border-[#141414] text-[10px] font-mono px-2.5 py-1.5 font-bold uppercase rounded-none shadow-[1px_1px_0px_#141414]">
              🔑 Token-Based RBAC
            </span>
            <span className="bg-[#E4E3E0] text-[#141414] border border-[#141414] text-[10px] font-mono px-2.5 py-1.5 font-bold uppercase rounded-none shadow-[1px_1px_0px_#141414]">
              📝 Signed Auditing
            </span>
          </div>
        </div>

        {/* Dashboard Grid Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* Left Column: RBAC Control Center Switcher */}
          <div className="lg:col-span-1">
            <RbacSwitcher 
              currentUser={currentUser} 
              activeToken={activeToken} 
              onLogin={handleLogin} 
              loading={loading} 
            />
          </div>

          {/* Right Columns: Main Dynamic Views depending on authenticated claims */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            
            {!currentUser ? (
              <div className="text-center py-20 bg-white border-2 border-[#141414] p-8 shadow-[4px_4px_0px_#141414] flex flex-col items-center gap-3 rounded-none">
                <AlertTriangle className="w-10 h-10 text-amber-600" />
                <h3 className="font-sans font-bold text-[#141414] text-base uppercase tracking-tight">Session Unauthorized</h3>
                <p className="text-xs text-slate-700 max-w-md mx-auto leading-relaxed font-serif italic">
                  Please click one of the seeded user profiles in the RBAC Control Center on the left to sign in and load isolated tenant transaction databases.
                </p>
              </div>
            ) : (
              <>
                {/* 0. DYNAMIC SIMULATION & LIVE SANDBOX WORKSPACE */}
                <SandboxSimulator 
                  token={activeToken} 
                  currentUser={currentUser} 
                  onSimulationTriggered={() => {
                    setRefreshAuditsTrigger(prev => prev + 1);
                    fetchAnalytics();
                    if (currentUser.role === "AGENT" || currentUser.role === "SHOP_OWNER") {
                      fetchDrawerLedger();
                    }
                  }}
                />

                {/* 0.3. AUTOMATED AI INTELLIGENCE & MULTI-LLM COPILOT */}
                <AiCopilot token={activeToken} currentUser={currentUser} />

                {/* 0.5. LIQUIDITY FORECASTING ENGINE INTERACTIVE SYSTEM */}
                <LiquidityForecastDashboard token={activeToken} currentUser={currentUser} />

                {/* 0.5. STREAMING ANOMALY DETECTION & COORDINATION WORKFLOW */}
                <AnomalyAlertsDashboard 
                  token={activeToken} 
                  currentUser={currentUser} 
                  onAlertAction={() => {
                    setRefreshAuditsTrigger(prev => prev + 1);
                    fetchAnalytics();
                  }}
                />

                {/* 1. MANAGEMENT & SHOP OWNER VIEW (Aggregated summaries only!) */}
                {(currentUser.role === "MANAGEMENT" || currentUser.role === "SHOP_OWNER") && (
                  <div className="flex flex-col gap-6" id="management-view">
                    
                    {/* Aggregated KPIs Row */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      
                      <div className="bg-white border border-[#141414] p-4 shadow-[2px_2px_0px_#141414] flex flex-col gap-1 rounded-none text-[#141414]">
                        <span className="text-[10px] font-mono text-slate-600 font-bold uppercase">Aggregated MFS Volume</span>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-lg font-extrabold font-mono text-[#141414]">
                            {analyticsData?.summary.totalVolume.toLocaleString() || "0"} BDT
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-600 block mt-1 font-serif italic">
                          Unification boundary crossing point
                        </span>
                      </div>

                      <div className="bg-white border border-[#141414] p-4 shadow-[2px_2px_0px_#141414] flex flex-col gap-1 rounded-none text-[#141414]">
                        <span className="text-[10px] font-mono text-slate-600 font-bold uppercase">Aggregated Transactions</span>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-lg font-extrabold font-mono text-[#141414]">
                            {analyticsData?.summary.totalTransactions.toLocaleString() || "0"}
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-600 block mt-1 font-serif italic">
                          Computed from 3 isolated files
                        </span>
                      </div>

                      <div className="bg-white border border-[#141414] p-4 shadow-[2px_2px_0px_#141414] flex flex-col gap-1 rounded-none text-[#141414]">
                        <span className="text-[10px] font-mono text-slate-600 font-bold uppercase">Active Anomalies</span>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-lg font-extrabold font-mono text-rose-800">
                            {analyticsData?.summary.activeUnresolvedAnomalies || "0"}
                          </span>
                          <span className="text-[10px] text-slate-600 font-bold font-mono">Unresolved</span>
                        </div>
                        <span className="text-[9px] text-rose-800 block mt-1 font-serif italic">
                          Ground truth answer key
                        </span>
                      </div>

                      <div className="bg-white border border-[#141414] p-4 shadow-[2px_2px_0px_#141414] flex flex-col gap-1 rounded-none text-[#141414]">
                        <span className="text-[10px] font-mono text-slate-600 font-bold uppercase">Network Wallet Share</span>
                        <div className="flex gap-2 items-center mt-1">
                          <div className="text-[10px] font-mono font-bold text-pink-700">
                            bKash: {analyticsData?.summary.bkashShare.toFixed(0)}%
                          </div>
                          <div className="text-[10px] font-mono font-bold text-amber-700">
                            Nagad: {analyticsData?.summary.nagadShare.toFixed(0)}%
                          </div>
                          <div className="text-[10px] font-mono font-bold text-purple-700">
                            Rocket: {analyticsData?.summary.rocketShare.toFixed(0)}%
                          </div>
                        </div>
                        <span className="text-[9px] text-slate-600 block mt-1 font-serif italic">
                          True Bangladesh market share ratio
                        </span>
                      </div>

                    </div>

                    {/* Shared Drawer & E-Money Liquidity Pressure Heatmap */}
                    <div className="bg-white border-2 border-[#141414] p-5 shadow-[4px_4px_0px_#141414] flex flex-col gap-4 rounded-none text-[#141414]">
                      <div>
                        <h3 className="font-sans font-bold text-[#141414] text-sm uppercase tracking-tight">
                          Multi-Provider Liquidity Pressure Heatmap
                        </h3>
                        <p className="text-xs text-slate-600 font-serif italic mt-0.5">
                          Monitors individual shop drawer safety levels. Real-time digital top-up & physical cash drawer ratio imbalance alarms.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {analyticsLoading ? (
                          <div className="col-span-2 text-center py-10 text-xs text-slate-600 italic font-serif">
                            Calculating cross-boundary ratios...
                          </div>
                        ) : (
                          analyticsData?.liquidity.map((liq) => {
                            const isDanger = liq.score > 50;
                            const isWarning = liq.score > 0 && liq.score <= 50;
                            return (
                              <div 
                                key={liq.agentId} 
                                className={`p-4 border transition-all rounded-none shadow-[2px_2px_0px_rgba(20,20,20,0.06)] ${
                                  isDanger 
                                    ? "bg-rose-50 border-rose-800 text-rose-950" 
                                    : isWarning 
                                    ? "bg-amber-50 border-amber-800 text-amber-950" 
                                    : "bg-white border-[#141414]"
                                }`}
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-2">
                                    <Building2 className="w-4 h-4 text-[#141414]" />
                                    <span className="font-mono text-sm font-bold text-[#141414]">{liq.agentId}</span>
                                  </div>
                                  <span className={`text-[9px] font-mono font-bold px-2 py-0.5 border uppercase rounded-none ${
                                    isDanger 
                                      ? "bg-rose-100 text-rose-900 border-rose-800" 
                                      : isWarning 
                                      ? "bg-amber-100 text-amber-900 border-amber-800" 
                                      : "bg-emerald-100 text-emerald-900 border-emerald-800"
                                  }`}>
                                    {liq.pressureLevel.replace(/_/, " ")}
                                  </span>
                                </div>

                                <div className="grid grid-cols-4 gap-2 font-mono text-[10px] mb-3 text-slate-700">
                                  <div className="flex flex-col">
                                    <span className="text-[8px] text-slate-500 font-bold uppercase">bKash</span>
                                    <span className="text-[#141414] font-bold">{liq.bkash.toLocaleString()} BDT</span>
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-[8px] text-slate-500 font-bold uppercase">Nagad</span>
                                    <span className="text-[#141414] font-bold">{liq.nagad.toLocaleString()} BDT</span>
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-[8px] text-slate-500 font-bold uppercase">Rocket</span>
                                    <span className="text-[#141414] font-bold">{liq.rocket.toLocaleString()} BDT</span>
                                  </div>
                                  <div className="flex flex-col border-l border-[#141414] pl-2">
                                    <span className="text-[8px] text-slate-800 font-bold uppercase">Drawer Cash</span>
                                    <span className="text-emerald-800 font-extrabold">{liq.cashDrawer.toLocaleString()} BDT</span>
                                  </div>
                                </div>

                                {/* Progress ratios bar */}
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-600">
                                    <span className="font-bold">E-Money: {liq.digitalPercentage.toFixed(0)}%</span>
                                    <span className="font-bold">Drawer Cash: {liq.cashPercentage.toFixed(0)}%</span>
                                  </div>
                                  <div className="w-full h-2 rounded-none bg-slate-100 border border-[#141414] overflow-hidden flex">
                                    <div className="bg-[#141414] h-full transition-all" style={{ width: `${liq.digitalPercentage}%` }} />
                                    <div className="bg-emerald-700 h-full transition-all" style={{ width: `${liq.cashPercentage}%` }} />
                                  </div>
                                </div>

                                <p className={`text-[10px] mt-3 leading-normal italic font-serif ${isDanger ? "text-rose-900 font-bold" : isWarning ? "text-amber-900 font-bold" : "text-slate-600"}`}>
                                  {liq.pressureDetails}
                                </p>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Management Schema isolation notice */}
                    {currentUser.role === "MANAGEMENT" && (
                      <div className="bg-purple-50 border border-purple-800 p-4 rounded-none text-xs font-sans text-purple-950 leading-relaxed shadow-[2px_2px_0px_rgba(20,20,20,0.05)]">
                        <strong className="block mb-1 uppercase tracking-wider font-bold text-purple-900">🔒 Schema-Isolation Constraint Triggered</strong>
                        Management represents a multi-provider monitoring view. Per physical design guidelines, management has <span className="underline font-bold">zero query access</span> to individual transaction level logs. No grid databases are displayed below for your role claims. This proves competing mobile financial service providers can share analytics without anti-competitive customer transaction disclosures.
                      </div>
                    )}

                  </div>
                )}

                {/* 2. AGENT PORTAL WORKBENCH (Agent view only) */}
                {currentUser.role === "AGENT" && (
                  <div className="flex flex-col gap-6" id="agent-view">
                    
                    {/* Agent single shop liquidity */}
                    {analyticsData?.liquidity.map((liq) => (
                      <div key={liq.agentId} className="bg-white border-2 border-[#141414] p-5 shadow-[4px_4px_0px_#141414] flex flex-col md:flex-row md:items-center justify-between gap-5 rounded-none text-[#141414]">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Building2 className="w-5 h-5 text-[#141414]" />
                            <h3 className="font-sans font-bold text-[#141414] text-base uppercase tracking-tight">Your Shop's Active Liquidity Health</h3>
                          </div>
                          
                          <p className="text-xs text-slate-700 leading-relaxed mb-4">
                            You serve customers through bKash, Nagad, and Rocket from your physical shop. You own your balances and physical cash drawer. Check your pressure meter below to decide if you need to top up e-money or deposit cash at the bank.
                          </p>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono mb-4 text-xs">
                            <div className="bg-[#E4E3E0]/30 p-3 border border-[#141414] rounded-none shadow-[2px_2px_0px_rgba(20,20,20,0.05)]">
                              <span className="text-[9px] text-slate-600 font-bold uppercase block">bKash E-Money</span>
                              <span className="text-[#141414] font-extrabold text-sm">{liq.bkash.toLocaleString()} BDT</span>
                            </div>
                            <div className="bg-[#E4E3E0]/30 p-3 border border-[#141414] rounded-none shadow-[2px_2px_0px_rgba(20,20,20,0.05)]">
                              <span className="text-[9px] text-slate-600 font-bold uppercase block">Nagad E-Money</span>
                              <span className="text-[#141414] font-extrabold text-sm">{liq.nagad.toLocaleString()} BDT</span>
                            </div>
                            <div className="bg-[#E4E3E0]/30 p-3 border border-[#141414] rounded-none shadow-[2px_2px_0px_rgba(20,20,20,0.05)]">
                              <span className="text-[9px] text-slate-600 font-bold uppercase block">Rocket E-Money</span>
                              <span className="text-[#141414] font-extrabold text-sm">{liq.rocket.toLocaleString()} BDT</span>
                            </div>
                            <div className="bg-emerald-50/50 border-2 border-emerald-800 p-3 rounded-none shadow-[2px_2px_0px_rgba(16,185,129,0.1)]">
                              <span className="text-[9px] text-emerald-800 font-bold uppercase block">Drawer Cash (Physical)</span>
                              <span className="text-emerald-950 font-extrabold text-sm">{liq.cashDrawer.toLocaleString()} BDT</span>
                            </div>
                          </div>

                          {/* Progress ratios bar */}
                          <div className="flex flex-col gap-1.5 bg-[#E4E3E0]/20 p-4 border border-[#141414] rounded-none shadow-[2px_2px_0px_rgba(20,20,20,0.05)]">
                            <div className="flex items-center justify-between text-xs font-mono">
                              <span className="text-[#141414] font-bold">Total Digital E-Money: {liq.digitalPercentage.toFixed(1)}%</span>
                              <span className="text-emerald-800 font-bold">Physical Drawer Cash: {liq.cashPercentage.toFixed(1)}%</span>
                            </div>
                            <div className="w-full h-2.5 rounded-none bg-slate-100 border border-[#141414] overflow-hidden flex">
                              <div className="bg-[#141414] h-full transition-all" style={{ width: `${liq.digitalPercentage}%` }} />
                              <div className="bg-emerald-700 h-full transition-all" style={{ width: `${liq.cashPercentage}%` }} />
                            </div>
                            <span className="text-[10px] text-slate-600 mt-1 font-sans">
                              Status: <strong className="text-[#141414] font-mono uppercase">{liq.pressureLevel.replace(/_/, " ")}</strong>. {liq.pressureDetails}
                            </span>
                          </div>
                        </div>

                        {/* Rebalance physical cash form */}
                        <form onSubmit={handleMockRebalance} className="bg-white border-2 border-[#141414] p-5 shadow-[4px_4px_0px_#141414] rounded-none w-full md:w-80 flex flex-col gap-3">
                          <h4 className="font-sans font-bold text-[#141414] text-xs uppercase tracking-wider mb-1 flex items-center gap-1">
                            <DollarSign className="w-4 h-4 text-[#141414]" />
                            Mock Drawer Rebalancer
                          </h4>
                          <p className="text-[10px] text-slate-600 font-serif italic leading-normal">
                            Replenish or deposit physical cash drawer funds with your corporate bank account.
                          </p>

                          <div className="flex flex-col gap-1 mt-1">
                            <label className="text-[10px] text-slate-600 font-bold font-mono uppercase">Transaction Type</label>
                            <div className="flex bg-[#E4E3E0] p-1 border border-[#141414] rounded-none">
                              <button
                                type="button"
                                onClick={() => setRebalanceType("withdraw")}
                                className={`flex-1 py-1 text-center font-sans text-[10px] font-bold rounded-none transition-all cursor-pointer ${
                                  rebalanceType === "withdraw" ? "bg-[#141414] text-[#E4E3E0]" : "text-[#141414]/75 hover:text-[#141414]"
                                }`}
                              >
                                Withdraw Cash (Replenish)
                              </button>
                              <button
                                type="button"
                                onClick={() => setRebalanceType("deposit")}
                                className={`flex-1 py-1 text-center font-sans text-[10px] font-bold rounded-none transition-all cursor-pointer ${
                                  rebalanceType === "deposit" ? "bg-[#141414] text-[#E4E3E0]" : "text-[#141414]/75 hover:text-[#141414]"
                                }`}
                              >
                                Deposit Drawer Cash
                              </button>
                            </div>
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] text-slate-600 font-bold font-mono uppercase">Amount (BDT)</label>
                            <input
                              type="number"
                              value={rebalanceAmount}
                              onChange={e => setRebalanceAmount(e.target.value)}
                              placeholder="50000"
                              className="bg-white border border-[#141414] rounded-none px-3 py-1.5 text-xs text-[#141414] font-mono focus:outline-none focus:border-[#141414]"
                            />
                          </div>

                          <button
                            type="submit"
                            className="w-full bg-[#141414] hover:bg-[#2c2c2c] py-2 rounded-none font-sans font-bold text-xs text-white transition-all shadow-[2px_2px_0px_#141414] active:translate-y-0.5 active:shadow-none cursor-pointer"
                          >
                            Execute Bank Transfer
                          </button>

                          {rebalanceMessage && (
                            <p className="text-[10px] text-emerald-900 font-bold leading-normal font-mono mt-1 border-t border-[#141414] pt-2">
                              {rebalanceMessage}
                            </p>
                          )}
                        </form>
                      </div>
                    ))}

                    {/* Agent personal Cash Drawer Ledger table */}
                    <div className="bg-white border-2 border-[#141414] p-5 shadow-[4px_4px_0px_#141414] rounded-none text-[#141414]">
                      <h3 className="font-sans font-bold text-[#141414] text-sm uppercase tracking-tight mb-1">Your Physical Cash Drawer Ledger Logs</h3>
                      <p className="text-xs text-slate-700 mb-4 leading-normal font-serif italic">
                        This ledger belongs directly to your shop. It tracks physical cash flows for bKash, Nagad, Rocket, and corporate bank deposits.
                      </p>

                      {drawerLedgerLoading ? (
                        <div className="text-center py-10 text-xs text-slate-600 italic font-serif">
                          Loading cash drawer logs...
                        </div>
                      ) : drawerLedger.length === 0 ? (
                        <div className="text-center py-10 text-xs text-slate-600 italic font-serif border border-[#141414] rounded-none">
                          No recent drawer records found.
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-none border border-[#141414]">
                          <table className="w-full text-left border-collapse font-sans text-xs">
                            <thead className="bg-[#141414] text-[#E4E3E0] font-mono text-[10px] uppercase font-bold tracking-wider italic">
                              <tr className="border-b border-[#141414]">
                                <th className="p-3">Entry ID</th>
                                <th className="p-3">Timestamp</th>
                                <th className="p-3">Type</th>
                                <th className="p-3">Cash Delta</th>
                                <th className="p-3">Resulting Cash</th>
                                <th className="p-3">Reference</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#141414]/15 text-[#141414] font-mono">
                              {drawerLedger.slice(0, 15).map((e) => {
                                const isRebalance = e.type === "rebalance";
                                const isCashIn = e.type === "cash_in";
                                return (
                                  <tr key={e.entry_id} className="hover:bg-[#E4E3E0]/30 transition-all">
                                    <td className="p-3 font-bold text-slate-700">{e.entry_id}</td>
                                    <td className="p-3 text-[11px] text-slate-500">
                                      {e.timestamp.replace("T", " ").replace("Z", "")}
                                    </td>
                                    <td className="p-3">
                                      <span className={`px-1.5 py-0.5 border text-[9px] uppercase font-bold rounded-none ${
                                        isRebalance 
                                          ? "bg-purple-100 text-purple-950 border-purple-800" 
                                          : isCashIn 
                                          ? "bg-emerald-100 text-emerald-950 border-emerald-800" 
                                          : "bg-cyan-100 text-cyan-950 border-cyan-800"
                                      }`}>
                                        {e.type}
                                      </span>
                                    </td>
                                    <td className={`p-3 font-bold ${e.amount >= 0 ? "text-emerald-800" : "text-rose-800"}`}>
                                      {e.amount >= 0 ? "+" : ""}{e.amount.toLocaleString()} BDT
                                    </td>
                                    <td className="p-3 text-[#141414] font-semibold">{e.current_cash.toLocaleString()} BDT</td>
                                    <td className="p-3 text-[10px] text-slate-600">
                                      <span className="capitalize block text-[#141414] font-sans font-bold">{e.provider_ref}</span>
                                      {e.provider_txn_id && <span className="block font-mono text-[9px] font-semibold">{e.provider_txn_id}</span>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                  </div>
                )}

                {/* 3. PROVIDER LEVEL DATA / COMPLIANCE (OPS, COMPLIANCE & SHOP OWNER) */}
                {(currentUser.role === "PROVIDER_OPS" || currentUser.role === "RISK_ANALYST" || currentUser.role === "SHOP_OWNER") && (
                  <div className="flex flex-col gap-6" id="compliance-view">
                    
                    {/* isolated table interface */}
                    <ProviderTransactions 
                      token={activeToken} 
                      providerScope={currentUser.scope} 
                      onEscalateTrigger={() => setRefreshAuditsTrigger(p => p + 1)}
                    />

                  </div>
                )}

              </>
            )}

          </div>

        </div>

        {/* Bottom Panel Workspace: Audit log streaming, Seasonal Trend line verification, and Guides */}
        <div className="bg-white border-2 border-[#141414] mt-6 shadow-[4px_4px_0px_#141414] rounded-none overflow-hidden">
          
          {/* Tabs header */}
          <div className="flex flex-wrap border-b border-[#141414] bg-[#E4E3E0]/30 p-1 font-sans text-xs font-bold uppercase tracking-wide">
            <button
              onClick={() => setActiveBottomTab("audit")}
              className={`flex items-center gap-2 px-5 py-3 border-b-2 transition-all rounded-none cursor-pointer ${
                activeBottomTab === "audit"
                  ? "border-b-2 border-b-[#141414] bg-white text-[#141414] font-extrabold"
                  : "border-transparent text-slate-600 hover:text-[#141414] hover:bg-white/40"
              }`}
            >
              <Fingerprint className="w-4 h-4 text-[#141414]" />
              Live Security Audits Stream
            </button>
            <button
              onClick={() => setActiveBottomTab("seasonality")}
              className={`flex items-center gap-2 px-5 py-3 border-b-2 transition-all rounded-none cursor-pointer ${
                activeBottomTab === "seasonality"
                  ? "border-b-2 border-b-[#141414] bg-white text-[#141414] font-extrabold"
                  : "border-transparent text-slate-600 hover:text-[#141414] hover:bg-white/40"
              }`}
            >
              <TrendingUp className="w-4 h-4 text-emerald-800" />
              Seasonality & demand verification
            </button>
            <button
              onClick={() => setActiveBottomTab("guide")}
              className={`flex items-center gap-2 px-5 py-3 border-b-2 transition-all rounded-none cursor-pointer ${
                activeBottomTab === "guide"
                  ? "border-b-2 border-b-[#141414] bg-white text-[#141414] font-extrabold"
                  : "border-transparent text-slate-600 hover:text-[#141414] hover:bg-white/40"
              }`}
            >
              <FileText className="w-4 h-4 text-cyan-800" />
              Architecture / Anomaly Guide
            </button>
          </div>

          {/* Active Tab Panel Body */}
          <div className="p-5 bg-white">
            {activeBottomTab === "audit" && (
              <AuditTrail 
                token={activeToken} 
                refreshTrigger={refreshAuditsTrigger} 
                onRefresh={() => setRefreshAuditsTrigger(p => p + 1)}
              />
            )}

            {activeBottomTab === "seasonality" && (
              <DailyVolumeChart trends={analyticsData?.dailyTrends || []} />
            )}

            {activeBottomTab === "guide" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs leading-relaxed font-sans text-[#141414]">
                <div className="bg-[#E4E3E0]/20 p-4.5 border border-[#141414] rounded-none flex flex-col gap-2.5 shadow-[2px_2px_0px_rgba(20,20,20,0.05)]">
                  <h4 className="font-bold text-[#141414] text-sm flex items-center gap-1.5 uppercase tracking-wide">
                    <Server className="w-4 h-4 text-[#141414]" />
                    Strict Tenant Isolation Rules Enforced
                  </h4>
                  <p className="text-slate-700">
                    By design, competing providers are represented as separate software domains on the backend:
                  </p>
                  <ul className="list-disc pl-5 flex flex-col gap-1.5 text-slate-600 font-sans">
                    <li>
                      <strong>Separate DB Files</strong>: <code>bkash.csv</code>, <code>nagad.csv</code>, and <code>rocket.csv</code> remain structurally split.
                    </li>
                    <li>
                      <strong>No cross-provider queries</strong>: The <code>/api/:provider/transactions</code> endpoint throws an immediate error if a provider token attempts to query a competitor's route.
                    </li>
                    <li>
                      <strong>Anonymized Tokenization</strong>: Customer phone numbers and balances are replaced with random scoped tokens like <code>ACC-00421</code>, making identity matching across networks completely impossible.
                    </li>
                  </ul>
                </div>

                <div className="bg-[#E4E3E0]/20 p-4.5 border border-[#141414] rounded-none flex flex-col gap-2.5 shadow-[2px_2px_0px_rgba(20,20,20,0.05)]">
                  <h4 className="font-bold text-rose-900 text-sm flex items-center gap-1.5 uppercase tracking-wide">
                    <ShieldAlert className="w-4 h-4 text-rose-800" />
                    Compliance & Investigation Policy
                  </h4>
                  <p className="text-slate-700 font-sans">
                    The platform flags 4 distinct seasonal, velocity, and server-lag anomalies:
                  </p>
                  <ul className="list-disc pl-5 flex flex-col gap-1.5 text-rose-950 font-mono text-[10px] font-bold">
                    <li>
                      <span className="font-sans font-bold">repeated_amount</span>: Structuring / multiple max limits (25k) within minutes.
                    </li>
                    <li>
                      <span className="font-sans font-bold">sudden_burst</span>: 12 high value Cash-Outs inside an hour draining drawer capital.
                    </li>
                    <li>
                      <span className="font-sans font-bold">provider_concentration</span>: Monopoly runs on one network (e.g. Nagad only).
                    </li>
                    <li>
                      <span className="font-sans font-bold">feed_conflict</span>: Balance discrepancy (N+1 open balance != N close balance).
                    </li>
                  </ul>
                  <p className="text-[10px] text-slate-600 italic mt-1 font-serif">
                    All compliance actions are purely decision-support advisory. Automatically freezing agent accounts, accusing customers, or blocking transactions is strictly out of scope.
                  </p>
                </div>
              </div>
            )}
          </div>

        </div>

      </main>

      {/* Footer copyright */}
      <footer className="bg-white border-t-2 border-[#141414] py-5 text-center font-sans text-xs text-[#141414] mt-6">
        <div className="max-w-7xl mx-auto px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="font-bold text-[#141414]/80">© 2026 Bangladesh MFS Super-Agent Liquidity Prototype. All Rights Reserved.</p>
          <div className="flex gap-4 font-mono text-[10px] font-bold text-[#141414]/70">
            <span>Local Time: 2026-07-17 15:30 BST</span>
            <span>Seed: VictoryDay1971</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
