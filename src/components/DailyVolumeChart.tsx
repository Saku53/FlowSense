import React from "react";
import { TrendingUp, Sparkles } from "lucide-react";
import { DailyTrend } from "../types";

interface DailyVolumeChartProps {
  trends: DailyTrend[];
}

export default function DailyVolumeChart({ trends }: DailyVolumeChartProps) {
  return (
    <div id="daily-volume-chart-panel" className="bg-white border-2 border-[#141414] p-5 shadow-[4px_4px_0px_#141414] flex flex-col gap-4 rounded-none text-[#141414]">
      <div className="flex items-center justify-between border-b border-[#141414] pb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[#141414]" />
          <div>
            <h3 className="font-sans font-bold text-[#141414] text-base uppercase tracking-tight">Verify Seasonal Demand Patterns</h3>
            <p className="text-xs text-slate-600 font-serif italic">2-Year Temporal Series (2024-07-17 to 2026-07-17)</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 bg-[#141414] text-[#E4E3E0] border border-[#141414] text-[10px] font-mono font-bold uppercase rounded-none">
          <Sparkles className="w-3 h-3" /> Fully Compiled
        </div>
      </div>

      <p className="font-sans text-xs text-slate-700 leading-relaxed">
        The chart below shows the daily transaction volume across the three providers. The data model simulates authentic Bangladeshi consumer cycles: Weekly peaks (Thursday pay-outs), Monthly peaks (1st-5th salary disbursement), and dramatic national spikes matching the actual lunar shifts of <strong className="text-[#141414]">Eid-ul-Fitr</strong> and <strong className="text-[#141414]">Eid-ul-Adha</strong>.
      </p>

      {/* Seasonal Chart PNG Embedding */}
      <div className="relative border border-[#141414] bg-white p-2 aspect-[16/9] flex items-center justify-center rounded-none shadow-[2px_2px_0px_rgba(20,20,20,0.05)]">
        <img
          src="/daily_volume.png"
          alt="MFS Seasonal Daily Volume Chart (2-Year Series)"
          className="w-full h-full object-cover rounded-none"
          referrerPolicy="no-referrer"
        />
        <div className="absolute bottom-4 left-4 bg-[#141414] px-3 py-1.5 border border-[#141414] text-[10px] font-mono text-[#E4E3E0] rounded-none">
          🔍 Click to inspect original PNG in separate tab
        </div>
        <a
          href="/daily_volume.png"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 bg-transparent"
          title="Open daily volume chart in full size"
        />
      </div>

      {/* Mini data metrics verification */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-2">
        <div className="bg-[#E4E3E0]/30 p-3.5 border border-[#141414] rounded-none flex flex-col gap-1 shadow-[2px_2px_0px_rgba(20,20,20,0.05)]">
          <span className="text-[10px] text-slate-600 font-mono font-bold uppercase">Weekly Peak Multiplier</span>
          <span className="font-sans font-bold text-[#141414] text-sm">1.40x Thursday Rushes</span>
          <span className="text-[9px] text-slate-600 leading-relaxed font-serif italic">Reflects pre-weekend commute wallet withdrawals.</span>
        </div>
        <div className="bg-[#E4E3E0]/30 p-3.5 border border-[#141414] rounded-none flex flex-col gap-1 shadow-[2px_2px_0px_rgba(20,20,20,0.05)]">
          <span className="text-[10px] text-slate-600 font-mono font-bold uppercase">Salary Peak Multiplier</span>
          <span className="font-sans font-bold text-[#141414] text-sm">1.50x Days 1-5 Cycle</span>
          <span className="text-[9px] text-slate-600 leading-relaxed font-serif italic">High physical cash depletion across all agent shops.</span>
        </div>
        <div className="bg-[#E4E3E0]/30 p-3.5 border border-[#141414] rounded-none flex flex-col gap-1 shadow-[2px_2px_0px_rgba(20,20,20,0.05)]">
          <span className="text-[10px] text-slate-600 font-mono font-bold uppercase">Eid-ul-Adha & Eid-ul-Fitr</span>
          <span className="font-sans font-bold text-[#141414] text-sm">4.50x Festival Peaks</span>
          <span className="text-[9px] text-slate-600 leading-relaxed font-serif italic">Includes pre-Eid shopping velocity boosts (+2.0x-3.6x).</span>
        </div>
      </div>
    </div>
  );
}
