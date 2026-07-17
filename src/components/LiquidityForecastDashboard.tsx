import React, { useState, useEffect, useRef } from "react";
import { 
  Sparkles, 
  ChevronRight, 
  AlertOctagon, 
  CheckCircle2, 
  TrendingUp, 
  DollarSign, 
  Cpu, 
  ShieldCheck, 
  Clock, 
  Calendar, 
  Info,
  HelpCircle
} from "lucide-react";
import { User } from "../types";

interface ProjectionStep {
  hour: number;
  balance: number;
  balanceMin: number;
  balanceMax: number;
  drawer: number;
  drawerMin: number;
  drawerMax: number;
}

interface ForecastResponse {
  provider: "bkash" | "nagad" | "rocket";
  confidence: number;
  reason: string;
  useFallback: boolean;
  currentBalance: number;
  currentCashDrawer: number;
  forecastRates: {
    cashInRate: number;
    cashOutRate: number;
    cashInRateRaw: number;
    cashOutRateRaw: number;
    baselineInRate: number;
    baselineOutRate: number;
  };
  projectedShortageHour: number | null;
  projectedShortageType: "NONE" | "EMONEY" | "DRAWER" | "BOTH";
  alert: {
    status: "OK" | "WARNING" | "CRITICAL";
    message: string;
    evidence: string;
    safetyNextStep: string;
  };
  projection: ProjectionStep[];
}

interface LiquidityForecastDashboardProps {
  token: string | null;
  currentUser: User | null;
}

export default function LiquidityForecastDashboard({ token, currentUser }: LiquidityForecastDashboardProps) {
  const [selectedAgent, setSelectedAgent] = useState("AGENT-001");
  const [selectedProvider, setSelectedProvider] = useState<"bkash" | "nagad" | "rocket">("bkash");
  const [selectedHorizon, setSelectedHorizon] = useState(12);
  const [loading, setLoading] = useState(false);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Chart Tooltip Hover State
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartRef = useRef<SVGSVGElement | null>(null);

  // List of agents based on user roles (agents are bound to their own scope)
  const availableAgents = currentUser?.role === "AGENT" 
    ? [currentUser.scope] 
    : ["AGENT-001", "AGENT-002", "AGENT-003", "AGENT-004", "AGENT-005", "AGENT-006", "AGENT-007", "AGENT-008"];

  // Available providers based on scope
  const availableProviders: Array<{ id: "bkash" | "nagad" | "rocket"; name: string }> = [
    { id: "bkash", name: "bKash" },
    { id: "nagad", name: "Nagad" },
    { id: "rocket", name: "Rocket" }
  ].filter(p => {
    if (currentUser?.role === "PROVIDER_OPS" || currentUser?.role === "RISK_ANALYST") {
      return currentUser.scope === "global" || currentUser.scope === p.id;
    }
    return true; // management, shop owners, agents can forecast all
  }) as any;

  // Auto-select valid provider if current selected one is filtered out
  useEffect(() => {
    if (availableProviders.length > 0 && !availableProviders.find(p => p.id === selectedProvider)) {
      setSelectedProvider(availableProviders[0].id);
    }
  }, [availableProviders, selectedProvider]);

  // Fetch forecast data
  const handleFetchForecast = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        agentId: selectedAgent,
        provider: selectedProvider,
        horizonHours: selectedHorizon.toString()
      });

      const res = await fetch(`/api/liquidity/forecast?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to generate forecast.");
      }

      const data = await res.json();
      setForecast(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
      setForecast(null);
    } finally {
      setLoading(false);
    }
  };

  // Run forecast on load or change
  useEffect(() => {
    if (token && currentUser) {
      // Set default agent to user scope if agent
      if (currentUser.role === "AGENT") {
        setSelectedAgent(currentUser.scope);
      }
      handleFetchForecast();
    }
  }, [token, currentUser, selectedAgent, selectedProvider, selectedHorizon]);

  // Handle Chart Hover Calculations
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (!chartRef.current || !forecast || forecast.projection.length === 0) return;
    const rect = chartRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    const padding = 50;
    const chartWidth = rect.width - 2 * padding;
    if (x < padding || x > rect.width - padding) {
      setHoverIndex(null);
      return;
    }

    const relativeX = x - padding;
    const index = Math.round((relativeX / chartWidth) * (forecast.projection.length - 1));
    if (index >= 0 && index < forecast.projection.length) {
      setHoverIndex(index);
    } else {
      setHoverIndex(null);
    }
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  // Custom SVG Chart Path Generators
  const renderSvgChart = () => {
    if (!forecast || forecast.projection.length === 0) return null;

    const width = 600;
    const height = 280;
    const padding = 50;
    const points = forecast.projection;

    // Find global max value to scale the Y axis
    const maxVal = Math.max(
      ...points.map(p => Math.max(p.balanceMax, p.drawerMax)),
      100000 // default minimum height
    ) * 1.05;

    const getX = (idx: number) => padding + (idx / (points.length - 1)) * (width - 2 * padding);
    const getY = (val: number) => height - padding - (val / maxVal) * (height - 2 * padding);

    // 1. Digital Balance Projected Path
    const balPointsStr = points.map((p, i) => `${getX(i)},${getY(p.balance)}`).join(" ");
    
    // 2. Digital Balance Confidence Area
    const balAreaPointsStr = [
      ...points.map((p, i) => `${getX(i)},${getY(p.balanceMax)}`),
      ...[...points].reverse().map((p, i) => `${getX(points.length - 1 - i)},${getY(p.balanceMin)}`)
    ].join(" ");

    // 3. Physical Cash Drawer Projected Path
    const drawerPointsStr = points.map((p, i) => `${getX(i)},${getY(p.drawer)}`).join(" ");

    // 4. Physical Cash Drawer Confidence Area
    const drawerAreaPointsStr = [
      ...points.map((p, i) => `${getX(i)},${getY(p.drawerMax)}`),
      ...[...points].reverse().map((p, i) => `${getX(points.length - 1 - i)},${getY(p.drawerMin)}`)
    ].join(" ");

    // Axis Labels
    const yTicks = [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal];

    return (
      <div className="relative w-full">
        <svg 
          ref={chartRef}
          viewBox={`0 0 ${width} ${height}`} 
          className="w-full h-auto bg-white border border-[#141414] shadow-inner select-none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Horizontal Gridlines */}
          {yTicks.map((tick, idx) => (
            <g key={idx}>
              <line 
                x1={padding} 
                y1={getY(tick)} 
                x2={width - padding} 
                y2={getY(tick)} 
                stroke="#141414" 
                strokeOpacity={idx === 0 ? 0.8 : 0.1}
                strokeDasharray={idx === 0 ? "none" : "3,3"}
              />
              <text 
                x={padding - 10} 
                y={getY(tick) + 4} 
                textAnchor="end" 
                className="font-mono text-[9px] fill-slate-500 font-bold"
              >
                {Math.round(tick).toLocaleString()}
              </text>
            </g>
          ))}

          {/* X Axis Labels */}
          {points.filter((_, idx) => idx % (points.length > 12 ? 4 : 2) === 0).map((p, idx) => (
            <g key={idx}>
              <line 
                x1={getX(p.hour - 1)} 
                y1={height - padding} 
                x2={getX(p.hour - 1)} 
                y2={height - padding + 5} 
                stroke="#141414"
              />
              <text 
                x={getX(p.hour - 1)} 
                y={height - padding + 16} 
                textAnchor="middle" 
                className="font-mono text-[9px] fill-slate-500 font-bold"
              >
                +{p.hour}h
              </text>
            </g>
          ))}

          {/* Shaded Area for Cash Drawer Confidence Bounds */}
          <polygon 
            points={drawerAreaPointsStr} 
            fill="rgb(16, 185, 129)" 
            fillOpacity={0.12} 
          />

          {/* Shaded Area for Digital Wallet Confidence Bounds */}
          <polygon 
            points={balAreaPointsStr} 
            fill="rgb(31, 41, 55)" 
            fillOpacity={0.10} 
          />

          {/* Dotted Cash Drawer Bounds Paths */}
          <polyline 
            points={points.map((p, i) => `${getX(i)},${getY(p.drawerMax)}`).join(" ")} 
            fill="none" 
            stroke="rgb(16, 185, 129)" 
            strokeDasharray="2,2" 
            strokeWidth={1} 
            strokeOpacity={0.4}
          />
          <polyline 
            points={points.map((p, i) => `${getX(i)},${getY(p.drawerMin)}`).join(" ")} 
            fill="none" 
            stroke="rgb(16, 185, 129)" 
            strokeDasharray="2,2" 
            strokeWidth={1} 
            strokeOpacity={0.4}
          />

          {/* Dotted Digital Wallet Bounds Paths */}
          <polyline 
            points={points.map((p, i) => `${getX(i)},${getY(p.balanceMax)}`).join(" ")} 
            fill="none" 
            stroke="#141414" 
            strokeDasharray="2,2" 
            strokeWidth={1} 
            strokeOpacity={0.3}
          />
          <polyline 
            points={points.map((p, i) => `${getX(i)},${getY(p.balanceMin)}`).join(" ")} 
            fill="none" 
            stroke="#141414" 
            strokeDasharray="2,2" 
            strokeWidth={1} 
            strokeOpacity={0.3}
          />

          {/* Physical Cash Drawer Projected Path */}
          <polyline 
            points={drawerPointsStr} 
            fill="none" 
            stroke="rgb(16, 185, 129)" 
            strokeWidth={2.5} 
            strokeLinecap="round"
          />

          {/* Digital Balance Projected Path */}
          <polyline 
            points={balPointsStr} 
            fill="none" 
            stroke="#141414" 
            strokeWidth={2.5} 
            strokeLinecap="round"
          />

          {/* Vertical Hover Indicator Line & Markers */}
          {hoverIndex !== null && hoverIndex < points.length && (
            <g>
              <line 
                x1={getX(hoverIndex)} 
                y1={padding} 
                x2={getX(hoverIndex)} 
                y2={height - padding} 
                stroke="#141414" 
                strokeWidth={1} 
                strokeDasharray="3,3"
              />
              {/* Digital balance marker */}
              <circle 
                cx={getX(hoverIndex)} 
                cy={getY(points[hoverIndex].balance)} 
                r={4} 
                fill="#141414" 
                stroke="white" 
                strokeWidth={1.5}
              />
              {/* Cash drawer marker */}
              <circle 
                cx={getX(hoverIndex)} 
                cy={getY(points[hoverIndex].drawer)} 
                r={4} 
                fill="rgb(16, 185, 129)" 
                stroke="white" 
                strokeWidth={1.5}
              />
            </g>
          )}
        </svg>

        {/* Hover Tooltip Render */}
        {hoverIndex !== null && hoverIndex < points.length && (
          <div className="absolute top-2 right-2 bg-[#141414] border border-[#141414] text-[#E4E3E0] p-3 font-mono text-[10px] leading-normal shadow-[3px_3px_0px_rgba(20,20,20,0.15)] flex flex-col gap-1.5 z-10 w-44">
            <div className="font-sans font-extrabold text-[#E4E3E0] border-b border-[#E4E3E0]/20 pb-1 flex items-center justify-between">
              <span>PROJECTION STATUS</span>
              <span>+{points[hoverIndex].hour} HOUR</span>
            </div>
            <div>
              <span className="block text-slate-400 font-bold uppercase text-[8px]">{forecast.provider.toUpperCase()} EMONEY</span>
              <span className="font-bold text-[11px] text-[#E4E3E0]">{points[hoverIndex].balance.toLocaleString()} BDT</span>
              <span className="block text-slate-400 text-[8px] font-bold">Range: [{points[hoverIndex].balanceMin.toLocaleString()} - {points[hoverIndex].balanceMax.toLocaleString()}]</span>
            </div>
            <div className="border-t border-[#E4E3E0]/15 pt-1">
              <span className="block text-emerald-400 font-bold uppercase text-[8px]">PHYSICAL CASH DRAWER</span>
              <span className="font-bold text-[11px] text-emerald-300">{points[hoverIndex].drawer.toLocaleString()} BDT</span>
              <span className="block text-emerald-400/70 text-[8px] font-bold">Range: [{points[hoverIndex].drawerMin.toLocaleString()} - {points[hoverIndex].drawerMax.toLocaleString()}]</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div id="forecast-dashboard-container" className="bg-white border-2 border-[#141414] p-5 shadow-[4px_4px_0px_#141414] flex flex-col gap-5 rounded-none text-[#141414]">
      
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#141414] pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-[#141414] text-[#E4E3E0] border border-[#141414] rounded-none">
            <Cpu className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="font-sans font-extrabold text-sm md:text-base text-[#141414] uppercase tracking-tight">
              Federated Liquidity Forecasting Engine
            </h2>
            <p className="text-xs text-slate-600 font-serif italic mt-0.5">
              Blends O(1) seasonal baselines with fast-timescale continuous EWMA streaming rates.
            </p>
          </div>
        </div>
        
        {/* Safe Badge */}
        <div className="flex items-center gap-1.5 self-start md:self-auto px-3 py-1.5 bg-emerald-50 text-emerald-950 border-2 border-emerald-800 text-[10px] font-mono font-bold uppercase rounded-none shadow-[2px_2px_0px_rgba(16,185,129,0.15)]">
          <ShieldCheck className="w-4 h-4 text-emerald-800" />
          Antitrust Compliant
        </div>
      </div>

      {/* Control Selector Bar */}
      <div className="bg-[#E4E3E0]/30 border border-[#141414] p-4 flex flex-col md:flex-row gap-4 items-end rounded-none shadow-[2px_2px_0px_rgba(20,20,20,0.03)]">
        
        <div className="flex flex-col gap-1 w-full md:w-1/3">
          <label className="text-[10px] text-slate-700 font-bold font-mono uppercase flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-slate-600" /> Agent Retail Shop
          </label>
          <select
            value={selectedAgent}
            disabled={currentUser?.role === "AGENT" || loading}
            onChange={e => setSelectedAgent(e.target.value)}
            className="w-full bg-white border border-[#141414] text-xs font-mono font-bold rounded-none px-3 py-2 text-[#141414] focus:outline-none cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
          >
            {availableAgents.map(id => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1 w-full md:w-1/3">
          <label className="text-[10px] text-slate-700 font-bold font-mono uppercase flex items-center gap-1">
            <DollarSign className="w-3.5 h-3.5 text-slate-600" /> Private MFS Provider
          </label>
          <select
            value={selectedProvider}
            disabled={loading || availableProviders.length <= 1}
            onChange={e => setSelectedProvider(e.target.value as any)}
            className="w-full bg-white border border-[#141414] text-xs font-sans font-bold rounded-none px-3 py-2 text-[#141414] focus:outline-none cursor-pointer disabled:opacity-75"
          >
            {availableProviders.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1 w-full md:w-1/3">
          <label className="text-[10px] text-slate-700 font-bold font-mono uppercase flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-slate-600" /> Forecast Look-Ahead
          </label>
          <select
            value={selectedHorizon}
            disabled={loading}
            onChange={e => setSelectedHorizon(Number(e.target.value))}
            className="w-full bg-white border border-[#141414] text-xs font-mono font-bold rounded-none px-3 py-2 text-[#141414] focus:outline-none cursor-pointer"
          >
            <option value={6}>6 Hours (Immediate Shift)</option>
            <option value={12}>12 Hours (Standard Day)</option>
            <option value={24}>24 Hours (Full Cycle)</option>
          </select>
        </div>

      </div>

      {/* Main Content Grid */}
      {error ? (
        <div className="text-center py-10 bg-rose-50 border-2 border-rose-800 text-rose-950 rounded-none p-5 shadow-[2px_2px_0px_rgba(225,29,72,0.1)] font-sans text-xs flex flex-col gap-2 items-center">
          <AlertOctagon className="w-8 h-8 text-rose-800" />
          <strong className="uppercase font-bold tracking-wider">Forecast Error Detected</strong>
          <span>{error}</span>
          <button 
            onClick={handleFetchForecast} 
            className="mt-2 bg-[#141414] text-white px-4 py-2 text-[10px] font-mono font-bold uppercase rounded-none hover:bg-slate-800 cursor-pointer"
          >
            Retry Simulation
          </button>
        </div>
      ) : loading ? (
        <div className="text-center py-20 bg-slate-50 border border-slate-300 rounded-none italic font-serif text-slate-600 text-xs flex flex-col gap-2.5 items-center justify-center">
          <Cpu className="w-7 h-7 text-[#141414] animate-spin" />
          <span>Simulating walk-forward parameters and blending EWMA rates...</span>
        </div>
      ) : forecast ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Panel: Alarms and Blended Parameter Analysis */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            
            {/* 1. Dynamic Alert Box */}
            <div className={`p-4.5 border-2 rounded-none shadow-[2px_2px_0px_rgba(20,20,20,0.05)] ${
              forecast.alert.status === "CRITICAL"
                ? "bg-rose-50/50 border-rose-800 text-rose-950"
                : forecast.alert.status === "WARNING"
                ? "bg-amber-50/50 border-amber-800 text-amber-950"
                : "bg-emerald-50/40 border-emerald-800 text-emerald-950"
            }`}>
              <div className="flex items-center gap-2 mb-2 border-b border-current pb-2">
                {forecast.alert.status === "CRITICAL" ? (
                  <AlertOctagon className="w-5 h-5 text-rose-800" />
                ) : forecast.alert.status === "WARNING" ? (
                  <AlertOctagon className="w-5 h-5 text-amber-800 animate-bounce" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-800" />
                )}
                <span className="font-sans font-extrabold text-[11px] uppercase tracking-wider">
                  Model Advisory: {forecast.alert.status}
                </span>
              </div>
              <p className="text-[11.5px] leading-relaxed font-bold font-sans">
                {forecast.alert.message}
              </p>
              <div className="mt-3 text-[10px] leading-relaxed flex flex-col gap-1.5 opacity-90 border-t border-current border-dashed pt-2.5">
                <div>
                  <span className="font-bold uppercase font-mono block text-[8px] text-slate-500">Statistical Evidence</span>
                  <span className="font-serif italic">{forecast.alert.evidence}</span>
                </div>
                <div className="mt-1">
                  <span className="font-bold uppercase font-mono block text-[8px] text-slate-500">Safety Directive Next Step</span>
                  <span className="font-sans font-bold text-[#141414]">{forecast.alert.safetyNextStep}</span>
                </div>
              </div>
            </div>

            {/* 2. Blended Confidence circular gauge indicator */}
            <div className="bg-white border border-[#141414] p-4 shadow-[2px_2px_0px_#141414] rounded-none flex items-center justify-between gap-4">
              <div className="flex-1">
                <span className="text-[9px] font-mono text-slate-600 font-bold uppercase block">Blended Confidence Index</span>
                <span className="text-base font-extrabold font-mono text-[#141414] block mt-0.5">
                  {Math.round(forecast.confidence * 100)}% Confidence
                </span>
                <p className="text-[9.5px] text-slate-500 font-serif italic leading-relaxed mt-1">
                  {forecast.reason}
                </p>
              </div>
              {/* Retro segmented confidence display */}
              <div className="flex flex-col items-center shrink-0 border border-[#141414] bg-slate-50 p-2 font-mono text-[10px] font-bold text-[#141414] w-20">
                <span className="text-[8px] text-slate-500 uppercase block mb-1">Status</span>
                <span className={`px-1.5 py-0.5 border text-[9px] uppercase ${
                  forecast.useFallback 
                    ? "bg-rose-100 text-rose-950 border-rose-800" 
                    : "bg-emerald-100 text-emerald-950 border-emerald-800"
                }`}>
                  {forecast.useFallback ? "FALLBACK" : "OPTIMAL"}
                </span>
              </div>
            </div>

            {/* 3. Rates Table comparing EWMA streaming rates and baselines */}
            <div className="bg-white border border-[#141414] p-4.5 shadow-[2px_2px_0px_#141414] rounded-none text-[#141414]">
              <h4 className="font-sans font-bold text-[#141414] text-[11px] uppercase tracking-wide mb-3 flex items-center gap-1">
                <TrendingUp className="w-4 h-4 text-emerald-800" />
                Underlying Model Rate Blending (BDT/hr)
              </h4>
              <div className="flex flex-col divide-y divide-[#141414]/15 font-mono text-[10px] leading-relaxed">
                <div className="py-2 flex items-center justify-between">
                  <span className="text-slate-600 font-sans">Confidence-Blended Inflow Rate</span>
                  <span className="font-bold text-[#141414]">{forecast.forecastRates.cashInRate.toLocaleString()} BDT</span>
                </div>
                <div className="py-2 flex items-center justify-between">
                  <span className="text-slate-600 font-sans">Confidence-Blended Outflow Rate</span>
                  <span className="font-bold text-[#141414]">{forecast.forecastRates.cashOutRate.toLocaleString()} BDT</span>
                </div>
                <div className="py-2 flex items-center justify-between bg-slate-50 px-1">
                  <span className="text-slate-500 font-sans text-[9px]">Streaming Fast EWMA Inflow</span>
                  <span className="text-slate-600 font-bold">{forecast.forecastRates.cashInRateRaw.toLocaleString()} BDT</span>
                </div>
                <div className="py-2 flex items-center justify-between bg-slate-50 px-1">
                  <span className="text-slate-500 font-sans text-[9px]">Streaming Fast EWMA Outflow</span>
                  <span className="text-slate-600 font-bold">{forecast.forecastRates.cashOutRateRaw.toLocaleString()} BDT</span>
                </div>
                <div className="py-2 flex items-center justify-between bg-[#E4E3E0]/15 px-1">
                  <span className="text-slate-500 font-sans text-[9px]">Local Historical Inflow Baseline</span>
                  <span className="text-slate-600 font-bold">{forecast.forecastRates.baselineInRate.toLocaleString()} BDT</span>
                </div>
                <div className="py-2 flex items-center justify-between bg-[#E4E3E0]/15 px-1">
                  <span className="text-slate-500 font-sans text-[9px]">Local Historical Outflow Baseline</span>
                  <span className="text-slate-600 font-bold">{forecast.forecastRates.baselineOutRate.toLocaleString()} BDT</span>
                </div>
              </div>
            </div>

          </div>

          {/* Right Panel: Svg Chart and Step-by-Step Data grid */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
                <Info className="w-3.5 h-3.5" /> Hover chart to query hour-by-hour projection details
              </span>
              <div className="flex gap-4 font-mono text-[9px] font-bold">
                <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 bg-[#141414] block" /> e-Money</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 bg-emerald-500 block" /> Cash Drawer</span>
              </div>
            </div>

            {/* Custom SVG Chart */}
            {renderSvgChart()}

            {/* Step-by-step Grid */}
            <div className="border border-[#141414] rounded-none overflow-hidden">
              <div className="bg-[#141414] px-4 py-2 font-mono text-[9px] text-[#E4E3E0] font-bold uppercase tracking-wider flex items-center justify-between">
                <span>Timeline Data Grid</span>
                <span>Interval Confidence Bounds: 95%</span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-left border-collapse text-[10px] font-mono leading-normal">
                  <thead className="bg-[#E4E3E0]/40 text-slate-700 uppercase font-bold sticky top-0 border-b border-[#141414] shadow-sm">
                    <tr>
                      <th className="p-2 pl-3">Hour</th>
                      <th className="p-2">e-Money Balance Projection</th>
                      <th className="p-2">Shared Drawer Cash Projection</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#141414]/10 text-slate-700">
                    {forecast.projection.map((step) => {
                      const isShortage = forecast.projectedShortageHour === step.hour;
                      return (
                        <tr 
                          key={step.hour} 
                          className={`hover:bg-[#E4E3E0]/15 transition-all ${
                            isShortage 
                              ? "bg-rose-50 text-rose-950 font-bold" 
                              : step.hour % 2 === 0 
                              ? "bg-white" 
                              : "bg-slate-50/50"
                          }`}
                        >
                          <td className="p-2 pl-3 font-bold text-slate-900 flex items-center gap-1">
                            +{step.hour}h {isShortage && <span className="text-[8px] bg-rose-800 text-white px-1 font-bold">SHORTAGE</span>}
                          </td>
                          <td className="p-2">
                            <span className="text-slate-900 font-extrabold">{step.balance.toLocaleString()} BDT</span>
                            <span className="text-[9px] text-slate-400 block font-normal">Range: [{step.balanceMin.toLocaleString()} - {step.balanceMax.toLocaleString()}]</span>
                          </td>
                          <td className="p-2">
                            <span className="text-emerald-800 font-extrabold">{step.drawer.toLocaleString()} BDT</span>
                            <span className="text-[9px] text-slate-400 block font-normal">Range: [{step.drawerMin.toLocaleString()} - {step.drawerMax.toLocaleString()}]</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

        </div>
      ) : (
        <div className="text-center py-10 bg-slate-50 border border-slate-300 rounded-none italic font-serif text-slate-600 text-xs">
          Select parameters above and run forecast query.
        </div>
      )}

    </div>
  );
}
