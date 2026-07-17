import React, { useState } from "react";
import { 
  Sparkles, 
  Brain, 
  Bot, 
  Zap, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  LineChart,
  HelpCircle,
  TrendingUp,
  Cpu
} from "lucide-react";
import { User } from "../types";

interface Props {
  token: string | null;
  currentUser: User;
}

export default function AiCopilot({ token, currentUser }: Props) {
  const [engine, setEngine] = useState<"gemini" | "openai">("gemini");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAiReport = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ engine })
      });

      if (!res.ok) {
        let errorMessage = "Failed to generate AI analysis.";
        try {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const data = await res.json();
            errorMessage = data.error || errorMessage;
          } else {
            const textText = await res.text();
            // If it's HTML, show a clean user-friendly server error message
            if (textText.trim().startsWith("<")) {
              errorMessage = `Server Error (${res.status}): The AI copilot engine is temporarily offline. Please verify that server is active or try again.`;
            } else {
              errorMessage = `Server Error (${res.status}): ${textText.substring(0, 150)}`;
            }
          }
        } catch (parseErr) {
          errorMessage = `Server Error status ${res.status}`;
        }
        throw new Error(errorMessage);
      }

      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        throw new Error("Received malformed response from AI server. Please retry.");
      }
      setReport(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred while communicating with the AI cluster.");
    } finally {
      setLoading(false);
    }
  };

  // Ultra-clean custom renderer to format raw Markdown strings without dependency bloat
  const renderParsedMarkdown = (text: string) => {
    if (!text) return null;
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      // Headers
      if (line.startsWith("### ")) {
        return (
          <h5 key={idx} className="font-sans font-extrabold text-xs text-[#141414] uppercase tracking-wider mt-4 mb-1 border-b border-dashed border-slate-300 pb-0.5">
            {line.replace("### ", "")}
          </h5>
        );
      }
      if (line.startsWith("## ")) {
        return (
          <h4 key={idx} className="font-sans font-black text-xs text-slate-800 uppercase tracking-widest mt-5 mb-1.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-[#141414]"></span>
            {line.replace("## ", "")}
          </h4>
        );
      }
      if (line.startsWith("# ")) {
        return (
          <h3 key={idx} className="font-sans font-black text-sm text-[#141414] uppercase tracking-wider mt-6 mb-2 border-b-2 border-[#141414] pb-1">
            {line.replace("# ", "")}
          </h3>
        );
      }
      // Bullet points
      if (line.startsWith("- ") || line.startsWith("* ")) {
        const cleanLine = line.replace(/^[-*]\s+/, "");
        return (
          <div key={idx} className="flex gap-2 pl-2 my-1 items-start text-xs text-slate-800 font-sans leading-relaxed">
            <span className="text-[#141414] font-bold mt-0.5">•</span>
            <span>{parseBoldText(cleanLine)}</span>
          </div>
        );
      }
      // Numbered lists
      if (/^\d+\.\s+/.test(line)) {
        const cleanLine = line.replace(/^\d+\.\s+/, "");
        const num = line.match(/^\d+/)![0];
        return (
          <div key={idx} className="flex gap-2 pl-2 my-1 items-start text-xs text-slate-800 font-sans leading-relaxed">
            <span className="font-mono font-black text-slate-900 text-[10px] bg-slate-200 px-1 py-0.2 rounded-none border border-slate-400">{num}</span>
            <span>{parseBoldText(cleanLine)}</span>
          </div>
        );
      }
      // Empty lines
      if (!line.trim()) {
        return <div key={idx} className="h-2"></div>;
      }
      // Standard Paragraph
      return (
        <p key={idx} className="text-xs text-slate-700 leading-relaxed font-sans my-1">
          {parseBoldText(line)}
        </p>
      );
    });
  };

  // Parse inline bold tags like **text**
  const parseBoldText = (text: string) => {
    const parts = text.split(/\*\*([^*]+)\*\*/g);
    if (parts.length === 1) return text;
    return parts.map((part, idx) => {
      if (idx % 2 === 1) {
        return <strong key={idx} className="font-black text-slate-950 bg-slate-50 border-b border-slate-300 px-0.5">{part}</strong>;
      }
      return part;
    });
  };

  return (
    <div id="ai-copilot-workspace" className="bg-white border-2 border-[#141414] shadow-[4px_4px_0px_#141414] rounded-none">
      {/* Header Desk */}
      <div className="bg-[#141414] text-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-[#141414]">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
          <div>
            <h3 className="font-sans font-black text-sm uppercase tracking-wider flex items-center gap-1.5">
              FlowSense AI Copilot & Risk Advisor
            </h3>
            <p className="text-[10px] text-slate-400 font-mono">
              REAL-TIME RISK & PORTFOLIO LIQUIDITY INTELLIGENCE
            </p>
          </div>
        </div>

        {/* Engine Switcher */}
        <div className="flex border border-slate-700 p-0.5 rounded-none bg-slate-900 self-start sm:self-center">
          <button
            onClick={() => setEngine("gemini")}
            className={`px-3 py-1 text-[10px] font-mono font-bold uppercase transition-all rounded-none cursor-pointer ${
              engine === "gemini"
                ? "bg-white text-[#141414]"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Google Gemini
          </button>
          <button
            onClick={() => setEngine("openai")}
            className={`px-3 py-1 text-[10px] font-mono font-bold uppercase transition-all rounded-none cursor-pointer ${
              engine === "openai"
                ? "bg-white text-[#141414]"
                : "text-slate-400 hover:text-white"
            }`}
          >
            OpenAI GPT
          </button>
        </div>
      </div>

      <div className="p-4 md:p-5 flex flex-col gap-4">
        {/* Intro explanatory row */}
        <div className="bg-[#F1EFEA] border border-[#141414] p-3 text-xs text-[#141414] flex items-start gap-3">
          <Brain className="w-5 h-5 text-indigo-950 mt-0.5 shrink-0" />
          <div className="font-sans leading-relaxed">
            <span className="font-bold uppercase block text-[10px] font-mono tracking-wide mb-0.5 text-slate-800">
              Multi-LLM Risk Intelligence Engine
            </span>
            Evaluate real-time transaction velocities, seasonal EWMAs, active anomaly parameters, and the balance of physical/e-money drawer cash instantly. Toggle between Gemini and OpenAI models to review and cross-validate automated compliance alerts.
          </div>
        </div>

        {/* Main controls & actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-dashed border-slate-300 pb-4">
          <div className="flex flex-col gap-1 text-left self-start sm:self-center">
            <div className="text-[10px] font-mono text-slate-600 uppercase tracking-wide font-bold">
              Target Scope Evaluated
            </div>
            <div className="text-xs text-slate-900 font-bold font-sans flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-slate-800" />
              Agent & Control Tower Local Databases ({currentUser.role})
            </div>
          </div>

          <button
            onClick={fetchAiReport}
            disabled={loading}
            className="w-full sm:w-auto px-5 py-3 bg-[#141414] text-white border-2 border-[#141414] shadow-[3px_3px_0px_#141414] hover:bg-slate-900 active:translate-y-0.5 active:shadow-[1px_1px_0px_#141414] font-mono text-xs font-bold uppercase tracking-wider rounded-none cursor-pointer transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                Inference in progress...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-400" />
                Generate Tactical Advisory Report
              </>
            )}
          </button>
        </div>

        {/* Error Block */}
        {error && (
          <div className="bg-rose-50 border-2 border-rose-800 p-4 font-mono text-xs text-rose-950 flex flex-col gap-2 rounded-none">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle className="w-4 h-4 text-rose-800" />
              CRITICAL API EXCEPTION:
            </div>
            <p className="font-sans leading-relaxed">{error}</p>
            <span className="text-[10px] text-slate-500 mt-1">
              Ensure that your secret keys are configured correctly and that you have active internet connection in the runtime environment.
            </span>
          </div>
        )}

        {/* Loading Indicator */}
        {loading && (
          <div className="py-12 flex flex-col items-center justify-center gap-3 bg-slate-50 border border-slate-200">
            <div className="relative">
              <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin"></div>
              <Sparkles className="w-5 h-5 text-amber-500 absolute top-3.5 left-3.5 animate-pulse" />
            </div>
            <p className="text-xs font-mono font-bold uppercase tracking-widest text-slate-600 animate-pulse mt-2">
              Querying {engine === "gemini" ? "Google Gemini" : "OpenAI GPT"} Desk...
            </p>
            <p className="text-[10px] text-slate-500 max-w-sm text-center px-4 font-serif italic">
              "Gathering live cash drawer status, compiling active anomaly parameters, calculating provider run metrics, and auditing transaction logs..."
            </p>
          </div>
        )}

        {/* Dynamic AI Output Report */}
        {report && !loading && (
          <div className="flex flex-col gap-4 animate-fade-in">
            {/* Metadata ribbon */}
            <div className="bg-slate-900 text-slate-200 p-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 rounded-none text-[10px] font-mono">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                REPORT SIGNED: {report.usedModel ? report.usedModel.toUpperCase() : `${report.engine.toUpperCase()}_COGNITIVE_COV`}
              </span>
              <span>TIMESTAMP: {new Date(report.timestamp).toLocaleString()}</span>
            </div>

            {/* Rendered content */}
            <div className="p-5 bg-[#FAF9F6] border border-slate-300 text-left font-sans shadow-inner max-h-[500px] overflow-y-auto rounded-none flex flex-col gap-3">
              {renderParsedMarkdown(report.analysis)}
            </div>

            {/* Regulatory Disclaimer */}
            <p className="text-[9px] text-slate-500 font-serif leading-relaxed text-center px-4 italic border-t border-dashed border-slate-200 pt-3">
              Notice: The strategic advisory reports generated by the FlowSense AI Copilot represent probabilistic automated recommendations computed over in-memory transaction logs and seasonal statistical estimators. Final risk authorization and capital rebalancing remain the sole responsibility of certified human analysts.
            </p>
          </div>
        )}

        {/* Static State Placeholder */}
        {!report && !loading && !error && (
          <div className="py-10 text-center border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center gap-2.5">
            <Bot className="w-8 h-8 text-slate-400" />
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider font-sans">
              No Report Active
            </div>
            <p className="text-[11px] text-slate-500 max-w-xs font-serif italic">
              Click the button above to generate a real-time risk compliance and cash rebalancing advisory report using the selected AI engine.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
