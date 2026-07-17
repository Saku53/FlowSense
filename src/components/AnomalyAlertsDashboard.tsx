import React, { useState, useEffect } from "react";
import { 
  ShieldAlert, 
  AlertTriangle, 
  CheckCircle, 
  ArrowRight, 
  User as UserIcon, 
  Search, 
  Filter, 
  Clock, 
  Lock,
  MessageSquare,
  Activity,
  ThumbsUp,
  FileCheck2,
  Calendar
} from "lucide-react";
import { User, StreamingAlert } from "../types";

interface Props {
  token: string | null;
  currentUser: User;
  onAlertAction: () => void; // Trigger callback to refresh audits or other components
}

export default function AnomalyAlertsDashboard({ token, currentUser, onAlertAction }: Props) {
  const [alerts, setAlerts] = useState<StreamingAlert[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<StreamingAlert | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  
  // Filters state
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [providerFilter, setProviderFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Interaction state
  const [actionNotes, setActionNotes] = useState("");
  const [submittingAction, setSubmittingAction] = useState<"ack" | "esc" | "res" | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load Alerts
  const fetchAlerts = async () => {
    if (!token) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const queryParams = new URLSearchParams();
      if (statusFilter !== "ALL") queryParams.append("status", statusFilter);
      if (providerFilter !== "ALL") queryParams.append("provider", providerFilter);
      if (typeFilter !== "ALL") queryParams.append("type", typeFilter);
      queryParams.append("page", page.toString());
      queryParams.append("limit", "15");

      const url = `/api/anomalies/recent?${queryParams.toString()}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error("Failed to fetch anomalies list");
      }

      const data = await res.json();
      if (data.summaryOnly) {
        setSummary(data.summary);
        setAlerts([]);
        setTotalCount(0);
      } else {
        setSummary(data.summary);
        setAlerts(data.alerts || []);
        setTotalCount(data.totalCount || 0);
        
        // Auto-select first alert if none selected and alerts exist
        if (data.alerts && data.alerts.length > 0 && !selectedAlertId) {
          setSelectedAlertId(data.alerts[0].alert_id);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load Alert Evidence when selection changes
  const fetchEvidence = async (alertId: string) => {
    if (!token) return;
    setEvidenceLoading(true);
    setSuccessMessage(null);
    try {
      const res = await fetch(`/api/alerts/${alertId}/evidence`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        let errMsg = "Failed to load alert evidence";
        try {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errData = await res.json();
            errMsg = errData.error || errMsg;
          } else {
            const textText = await res.text();
            if (textText.trim().startsWith("<")) {
              errMsg = `Alert details service offline (${res.status}).`;
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
        throw new Error("Malformed evidence payload received. Please retry.");
      }
      setSelectedAlert(data);
    } catch (err: any) {
      setSelectedAlert(null);
      setErrorMessage(err.message);
    } finally {
      setEvidenceLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [token, statusFilter, providerFilter, typeFilter, page, currentUser]);

  useEffect(() => {
    if (selectedAlertId) {
      fetchEvidence(selectedAlertId);
    } else {
      setSelectedAlert(null);
    }
  }, [selectedAlertId, token]);

  // Handle Coordination Actions
  const handleAlertAction = async (actionType: "acknowledge" | "escalate" | "resolve") => {
    if (!token || !selectedAlertId) return;
    
    const actionKey = actionType === "acknowledge" ? "ack" : actionType === "escalate" ? "esc" : "res";
    setSubmittingAction(actionKey);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/alerts/${selectedAlertId}/${actionType}`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ notes: actionNotes })
      });

      if (!res.ok) {
        let errMsg = `Failed to execute ${actionType} action.`;
        try {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errData = await res.json();
            errMsg = errData.error || errMsg;
          } else {
            const textText = await res.text();
            if (textText.trim().startsWith("<")) {
              errMsg = `Action service offline (${res.status}).`;
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
        throw new Error("Malformed action response received. Please retry.");
      }
      setSuccessMessage(`Success: Case ${selectedAlertId} state updated to ${data.alert.case_status}.`);
      setActionNotes("");
      
      // Refresh current alerts and reload current selection
      await fetchAlerts();
      await fetchEvidence(selectedAlertId);
      
      // Trigger outer callback to sync other sections
      onAlertAction();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSubmittingAction(null);
    }
  };

  // Human-readable titles for anomaly types
  const formatAnomalyType = (type: string) => {
    return type.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  };

  // Provider Styling helper
  const getProviderStyle = (provider: string) => {
    switch (provider) {
      case "bkash":
        return {
          bg: "bg-pink-50 border-pink-200 text-pink-950",
          badge: "bg-pink-100 text-pink-900 border-pink-300",
          text: "text-pink-800"
        };
      case "nagad":
        return {
          bg: "bg-orange-50 border-orange-200 text-orange-950",
          badge: "bg-orange-100 text-orange-900 border-orange-300",
          text: "text-orange-800"
        };
      case "rocket":
        return {
          bg: "bg-purple-50 border-purple-200 text-purple-950",
          badge: "bg-purple-100 text-purple-900 border-purple-300",
          text: "text-purple-800"
        };
      default:
        return {
          bg: "bg-slate-50 border-slate-200 text-slate-950",
          badge: "bg-slate-100 text-slate-900 border-slate-300",
          text: "text-slate-800"
        };
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "OPEN":
        return "bg-rose-100 text-rose-900 border-rose-400 font-extrabold";
      case "ACKNOWLEDGED":
        return "bg-amber-100 text-amber-900 border-amber-400 font-bold";
      case "ESCALATED":
        return "bg-purple-100 text-purple-900 border-purple-400 font-bold animate-pulse";
      case "RESOLVED":
        return "bg-emerald-100 text-emerald-950 border-emerald-400 font-bold";
      default:
        return "bg-slate-100 text-slate-900 border-slate-400";
    }
  };

  return (
    <div className="bg-white border-2 border-[#141414] p-5 shadow-[4px_4px_0px_#141414] flex flex-col gap-5 rounded-none text-[#141414]">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b-2 border-[#141414] pb-4 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-rose-50 border border-rose-800 text-rose-800 rounded-none shadow-[1px_1px_0px_#141414]">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-sans font-extrabold text-[#141414] text-base uppercase tracking-tight">
              Real-Time Streaming Anomaly Inbox & Case Coordination
            </h2>
            <p className="text-xs text-slate-600 font-serif italic mt-0.5">
              Powered by P² Quantile streaming estimators, Welford buffers, and seasonal-baseline demand scoring.
            </p>
          </div>
        </div>

        {/* Aggregate statistics view for all roles */}
        {summary && (
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-[10px] font-mono bg-rose-50 text-rose-950 border border-rose-800 px-2 py-1 font-bold">
              OPEN: {summary.breakdownByStatus.OPEN}
            </span>
            <span className="text-[10px] font-mono bg-amber-50 text-amber-950 border border-amber-800 px-2 py-1 font-bold">
              ACKED: {summary.breakdownByStatus.ACKNOWLEDGED}
            </span>
            <span className="text-[10px] font-mono bg-purple-50 text-purple-950 border border-purple-800 px-2 py-1 font-bold">
              ESCALATED: {summary.breakdownByStatus.ESCALATED}
            </span>
            <span className="text-[10px] font-mono bg-emerald-50 text-emerald-950 border border-emerald-800 px-2 py-1 font-bold">
              RESOLVED: {summary.breakdownByStatus.RESOLVED}
            </span>
          </div>
        )}
      </div>

      {/* Management Aggregate Only Notice */}
      {currentUser.role === "MANAGEMENT" ? (
        <div className="bg-purple-50 border border-purple-800 p-5 rounded-none text-xs text-purple-950 leading-relaxed shadow-[2px_2px_0px_rgba(20,20,20,0.05)]">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-4 h-4 text-purple-900 shrink-0" />
            <strong className="uppercase tracking-wider font-extrabold text-purple-900 text-sm">
              Antitrust Security Isolation Activated (Management Role)
            </strong>
          </div>
          <p className="mb-3">
            Your role claim of <strong>MANAGEMENT</strong> allows aggregate platform health oversight but strictly prohibits individual line-item transactions or specific case reviews to prevent collusive trading visibility under Bangladesh competitive directives.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 bg-white border border-purple-800 p-4 font-mono">
            <div>
              <span className="text-[9px] text-slate-500 block uppercase font-bold">Aggregate Anomaly Count</span>
              <span className="text-xl font-extrabold text-purple-950">{summary?.totalCount || 0} alerts detected</span>
            </div>
            <div>
              <span className="text-[9px] text-slate-500 block uppercase font-bold">Highest Provider Volatility</span>
              <span className="text-sm font-extrabold text-[#141414] uppercase">
                bKash ({summary?.breakdownByProvider.bkash || 0}) / Nagad ({summary?.breakdownByProvider.nagad || 0})
              </span>
            </div>
            <div>
              <span className="text-[9px] text-slate-500 block uppercase font-bold">Pending Compliance Queue</span>
              <span className="text-sm font-extrabold text-rose-800">
                {(summary?.breakdownByStatus.OPEN + summary?.breakdownByStatus.ESCALATED) || 0} urgent reviews
              </span>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Filters Bar */}
          <div className="bg-[#E4E3E0]/30 border border-[#141414] p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-slate-600" />
                <span className="font-bold text-slate-700 font-mono text-[10px] uppercase">Filter Workspace:</span>
              </div>
              
              {/* Status Filter */}
              <select 
                value={statusFilter} 
                onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                className="bg-white border border-[#141414] rounded-none px-2 py-1 text-xs font-mono font-bold focus:outline-none"
              >
                <option value="ALL">Status: All Cases</option>
                <option value="OPEN">Status: Open / New</option>
                <option value="ACKNOWLEDGED">Status: Acknowledged</option>
                <option value="ESCALATED">Status: Escalated</option>
                <option value="RESOLVED">Status: Resolved</option>
              </select>

              {/* Provider Filter (disabled if user is scoped to a provider) */}
              <select 
                value={providerFilter} 
                onChange={e => { setProviderFilter(e.target.value); setPage(1); }}
                disabled={currentUser.scope !== "global" && currentUser.role !== "AGENT" && currentUser.role !== "SHOP_OWNER"}
                className="bg-white border border-[#141414] rounded-none px-2 py-1 text-xs font-mono font-bold focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
              >
                <option value="ALL">Provider: All</option>
                <option value="bkash">bKash</option>
                <option value="nagad">Nagad</option>
                <option value="rocket">Rocket</option>
              </select>

              {/* Anomaly Type Filter */}
              <select 
                value={typeFilter} 
                onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
                className="bg-white border border-[#141414] rounded-none px-2 py-1 text-xs font-mono font-bold focus:outline-none"
              >
                <option value="ALL">Type: All Anomalies</option>
                <option value="repeated_amount">Repeated Limits / Structuring</option>
                <option value="sudden_burst">Sudden Burst / Velocity Run</option>
                <option value="provider_concentration">Provider Concentration</option>
                <option value="feed_conflict">Feed Ledger Mismatch</option>
                <option value="feed_delay">Injected Delay / Out-Of-Sync</option>
              </select>
            </div>

            <div className="text-[10px] font-mono text-slate-600 font-bold">
              Showing {alerts.length} of {totalCount} matching alerts
            </div>
          </div>

          {/* Core List & Review split layout */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 min-h-[480px]">
            {/* Left Column: Alerts List */}
            <div className="lg:col-span-2 flex flex-col gap-2 overflow-y-auto max-h-[500px] border border-[#141414] p-2 bg-[#E4E3E0]/10">
              {loading ? (
                <div className="text-center py-20 text-xs text-slate-600 italic font-serif">
                  Streaming alert pipeline...
                </div>
              ) : alerts.length === 0 ? (
                <div className="text-center py-20 bg-white border border-slate-200 text-xs text-slate-500 font-serif italic">
                  No active anomalies matching filters found in this viewport.
                </div>
              ) : (
                alerts.map((alert) => {
                  const style = getProviderStyle(alert.provider);
                  const isSelected = selectedAlertId === alert.alert_id;
                  return (
                    <button
                      key={alert.alert_id}
                      onClick={() => setSelectedAlertId(alert.alert_id)}
                      className={`text-left p-3.5 border-2 transition-all rounded-none flex flex-col gap-1.5 cursor-pointer hover:bg-slate-50 relative ${
                        isSelected 
                          ? "border-[#141414] bg-white shadow-[3px_3px_0px_#141414]" 
                          : "border-slate-300 bg-white/80"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`text-[8px] font-mono font-extrabold px-1.5 py-0.5 border uppercase rounded-none ${style.badge}`}>
                            {alert.provider}
                          </span>
                          <span className="font-mono text-[10px] font-extrabold text-slate-900">
                            {alert.alert_id}
                          </span>
                        </div>
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 border rounded-none uppercase ${getStatusBadge(alert.case_status)}`}>
                          {alert.case_status}
                        </span>
                      </div>

                      <div>
                        <h4 className="font-sans font-extrabold text-xs text-[#141414]">
                          {formatAnomalyType(alert.type)}
                        </h4>
                        <div className="flex items-center justify-between text-[10px] text-slate-600 mt-1 font-mono">
                          <span>Shop: {alert.agent_id}</span>
                          <span className="font-extrabold text-[#141414]">{alert.amount.toLocaleString()} BDT</span>
                        </div>
                      </div>

                      <div className="text-[9px] text-slate-500 font-mono flex items-center justify-between mt-1 border-t border-dashed border-slate-200 pt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {alert.timestamp.replace("T", " ").replace("Z", "").substring(5, 16)}
                        </span>
                        <span className="font-sans font-bold">Severity: {alert.severity}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Right Column: Case Details & Coordination panel */}
            <div className="lg:col-span-3 border border-[#141414] p-5 bg-white flex flex-col gap-4 relative">
              {evidenceLoading ? (
                <div className="text-center py-40 text-xs text-slate-600 italic font-serif">
                  Loading dynamic evidence logs...
                </div>
              ) : !selectedAlert ? (
                <div className="text-center py-40 text-xs text-slate-500 font-serif italic">
                  Select an alert from the checklist on the left to initiate manual coordination workflow.
                </div>
              ) : (
                <>
                  {/* Alert Header Detail */}
                  <div className="border-b-2 border-slate-100 pb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-extrabold px-2 py-0.5 bg-[#141414] text-white uppercase">
                          {selectedAlert.provider} Network
                        </span>
                        <h3 className="font-sans font-black text-slate-900 text-sm">
                          Case File: {selectedAlert.alert_id}
                        </h3>
                      </div>
                      <span className={`text-[10px] font-mono font-extrabold border-2 px-2 py-0.5 uppercase ${getStatusBadge(selectedAlert.case_status)}`}>
                        {selectedAlert.case_status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono text-[10px] text-slate-600 mt-2">
                      <div>
                        <span className="text-[8px] text-slate-500 block font-bold uppercase">Trigger Time</span>
                        <span className="text-slate-900 font-bold">{selectedAlert.timestamp.replace("T", " ").replace("Z", "")}</span>
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-500 block font-bold uppercase">MFS Agent ID</span>
                        <span className="text-slate-900 font-bold">{selectedAlert.agent_id}</span>
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-500 block font-bold uppercase">Transaction Reference</span>
                        <span className="text-[#141414] font-bold underline">{selectedAlert.transaction_id}</span>
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-500 block font-bold uppercase">Case Assignment</span>
                        <span className="text-rose-900 font-extrabold">{selectedAlert.owner || "UNASSIGNED"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Banglish Alert Copy & Context description */}
                  <div className="bg-rose-50 border-l-4 border-rose-800 p-4.5 rounded-none flex flex-col gap-2">
                    <div className="flex items-center gap-1.5">
                      <MessageSquare className="w-4 h-4 text-rose-800 shrink-0" />
                      <strong className="text-xs text-rose-950 uppercase tracking-wide font-sans font-bold">
                        Operators Dynamic Local Copy (Banglish / Bengali Alert Context)
                      </strong>
                    </div>
                    <p className="text-xs text-rose-950 font-serif italic leading-relaxed">
                      "{selectedAlert.evidence.situation}"
                    </p>
                  </div>

                  {/* Real-time calculated Evidence, Reason, Uncertainty & Safety instructions */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
                    <div className="bg-slate-50 p-4 border border-slate-200 rounded-none flex flex-col gap-1.5">
                      <span className="text-[10px] text-slate-500 font-mono font-bold uppercase block border-b border-slate-200 pb-1">
                        🔬 Statistical Reason & Z-Score Info
                      </span>
                      <p className="text-slate-800 font-medium">
                        {selectedAlert.evidence.reason}
                      </p>
                      <p className="text-slate-600 text-[11px] leading-relaxed mt-1 bg-white p-2 border border-slate-100 italic">
                        {selectedAlert.evidence.evidence}
                      </p>
                    </div>

                    <div className="bg-slate-50 p-4 border border-slate-200 rounded-none flex flex-col gap-1.5">
                      <span className="text-[10px] text-slate-500 font-mono font-bold uppercase block border-b border-slate-200 pb-1">
                        🎯 Uncertainty Bounds & Action Guide
                      </span>
                      <p className="text-amber-900 font-bold font-mono">
                        ⚠️ Uncertainty: {selectedAlert.evidence.uncertainty}
                      </p>
                      <p className="text-slate-800 leading-normal mt-1 border-t border-slate-200 pt-1">
                        <strong>Safety Next Steps:</strong>
                      </p>
                      <p className="text-slate-600 text-[11px] leading-relaxed italic bg-white p-2 border border-slate-100">
                        {selectedAlert.evidence.safetyNextStep}
                      </p>
                    </div>
                  </div>

                  {/* Coordination Workflow Action Forms */}
                  {selectedAlert.case_status !== "RESOLVED" && (
                    <div className="border-t-2 border-slate-100 pt-4 bg-[#E4E3E0]/20 p-4 border border-[#141414] rounded-none flex flex-col gap-3">
                      <h4 className="font-sans font-extrabold text-[#141414] text-xs uppercase tracking-wide">
                        Take Active Coordination Action
                      </h4>
                      <p className="text-[10px] text-slate-600 font-serif italic">
                        Input operational notes or validation findings. These notes are appended to the immutable security log.
                      </p>

                      <div className="flex flex-col gap-1.5">
                        <textarea
                          rows={2}
                          value={actionNotes}
                          onChange={e => setActionNotes(e.target.value)}
                          placeholder="Record voice-call register confirmations, cash-counting audits, or holiday justification here..."
                          className="bg-white border border-[#141414] rounded-none p-2 text-xs focus:outline-none"
                        />
                      </div>

                      <div className="flex gap-2">
                        {/* Acknowledge Button - Agent and Ops can use */}
                        {selectedAlert.case_status === "OPEN" && (
                          <button
                            onClick={() => handleAlertAction("acknowledge")}
                            disabled={submittingAction !== null}
                            className="bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white font-sans text-xs px-4 py-2 font-bold uppercase rounded-none transition-all cursor-pointer shadow-[1px_1px_0px_#141414]"
                          >
                            {submittingAction === "ack" ? "Updating..." : "Acknowledge Alert"}
                          </button>
                        )}

                        {/* Escalate Button - Ops/Risk only */}
                        {(currentUser.role === "PROVIDER_OPS" || currentUser.role === "RISK_ANALYST" || currentUser.role === "SHOP_OWNER") && 
                          selectedAlert.case_status !== "ESCALATED" && (
                          <button
                            onClick={() => handleAlertAction("escalate")}
                            disabled={submittingAction !== null}
                            className="bg-purple-700 hover:bg-purple-800 disabled:bg-purple-300 text-white font-sans text-xs px-4 py-2 font-bold uppercase rounded-none transition-all cursor-pointer shadow-[1px_1px_0px_#141414]"
                          >
                            {submittingAction === "esc" ? "Escalating..." : "Escalate to Central Risk"}
                          </button>
                        )}

                        {/* Resolve Button - Ops/Risk only */}
                        {(currentUser.role === "PROVIDER_OPS" || currentUser.role === "RISK_ANALYST" || currentUser.role === "SHOP_OWNER") && (
                          <button
                            onClick={() => handleAlertAction("resolve")}
                            disabled={submittingAction !== null}
                            className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-300 text-white font-sans text-xs px-4 py-2 font-bold uppercase rounded-none transition-all cursor-pointer shadow-[1px_1px_0px_#141414]"
                          >
                            {submittingAction === "res" ? "Resolving..." : "Resolve & Close"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Auditable Action Logs Stream */}
                  <div className="border-t border-slate-100 pt-3">
                    <span className="text-[10px] text-slate-500 font-mono font-bold uppercase block mb-2">
                      📜 Case Activity Audit Trail (Immutable)
                    </span>
                    <div className="flex flex-col gap-1.5 max-h-[120px] overflow-y-auto">
                      {selectedAlert.auditable_history && selectedAlert.auditable_history.length > 0 ? (
                        selectedAlert.auditable_history.map((log, idx) => (
                          <div key={idx} className="bg-slate-50 border border-slate-100 p-2 font-mono text-[9px] flex items-start gap-2">
                            <span className="text-slate-400 shrink-0">{log.timestamp.substring(11, 19)}</span>
                            <div className="flex-1">
                              <span className="font-extrabold text-[#141414] uppercase bg-slate-200 px-1 py-0.1 border border-slate-300 mr-1.5">
                                {log.action}
                              </span>
                              <span className="text-slate-600 font-bold">Actor: {log.actor}</span>
                              <p className="text-slate-700 font-sans text-[10px] mt-1 font-semibold leading-normal">
                                Notes: "{log.notes}"
                              </p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-[10px] text-slate-500 font-serif italic pl-2">
                          No historical edits recorded on this case yet.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Feedback Messages */}
                  {successMessage && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-800 text-emerald-950 text-xs font-mono font-bold">
                      {successMessage}
                    </div>
                  )}
                  {errorMessage && (
                    <div className="p-2.5 bg-rose-50 border border-rose-800 text-rose-950 text-xs font-mono font-bold animate-shake">
                      Error: {errorMessage}
                    </div>
                  )}

                  {/* Human-in-the-loop Guardrail */}
                  <div className="bg-cyan-50 border border-cyan-700 p-3 text-[10px] text-cyan-950 font-sans leading-relaxed">
                    <strong className="block mb-0.5 uppercase tracking-wide text-cyan-900 font-bold">
                      🚨 Human-in-the-loop Compliance Directive (Antitrust-Isolated View)
                    </strong>
                    These statistical anomaly alarms represent decision-support insights only. Automated frozen states on agent merchant wallets are <strong>strictly forbidden</strong>. Real operational disruptions require a human compliance analyst to verify physical book-registers or speak directly with operators to rule out false positives during holiday volumes.
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
