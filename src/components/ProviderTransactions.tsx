import React, { useEffect, useState } from "react";
import { AlertOctagon, ChevronLeft, ChevronRight, FileSpreadsheet, Zap } from "lucide-react";
import { Transaction } from "../types";

interface ProviderTransactionsProps {
  token: string | null;
  providerScope: string; // e.g. 'bkash', 'nagad', 'rocket' or 'global' (if management/owner)
  onEscalateTrigger: () => void;
}

export default function ProviderTransactions({ token, providerScope, onEscalateTrigger }: ProviderTransactionsProps) {
  const [provider, setProvider] = useState<"bkash" | "nagad" | "rocket">("bkash");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [isAnomalyOnly, setIsAnomalyOnly] = useState(false);
  const [agentFilter, setAgentFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active Transaction for Investigation Escalation Drawer
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    // If scope is specifically a provider, force set provider
    if (providerScope === "bkash" || providerScope === "nagad" || providerScope === "rocket") {
      setProvider(providerScope);
    }
  }, [providerScope]);

  const fetchTransactions = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        page: String(page),
        limit: "25"
      });
      if (isAnomalyOnly) {
        queryParams.append("isAnomaly", "true");
      }
      if (agentFilter) {
        queryParams.append("agentId", agentFilter);
      }
      if (typeFilter) {
        queryParams.append("type", typeFilter);
      }

      const res = await fetch(`/api/${provider}/transactions?${queryParams.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        let errMsg = "Failed to load transactions.";
        try {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errData = await res.json();
            errMsg = errData.error || errMsg;
          } else {
            const textText = await res.text();
            if (textText.trim().startsWith("<")) {
              errMsg = `Database Service offline (${res.status}). Please try again.`;
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
        throw new Error("Received malformed transaction data from server. Please retry.");
      }
      setTransactions(data.transactions || []);
      setTotalCount(data.totalCount || 0);
    } catch (err: any) {
      setError(err.message);
      setTransactions([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [token, provider, page, isAnomalyOnly, agentFilter, typeFilter]);

  // Reset page when filters change
  const handleFilterChange = (setter: (v: any) => void, val: any) => {
    setter(val);
    setPage(1);
  };

  const handleEscalate = async (status: "UNDER_INVESTIGATION" | "RESOLVED") => {
    if (!selectedTxn || !token) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch("/api/actions/escalate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          provider,
          transactionId: selectedTxn.transaction_id,
          status
        })
      });

      if (!res.ok) {
        let errMsg = "Failed to update review status.";
        try {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errData = await res.json();
            errMsg = errData.error || errMsg;
          } else {
            const textText = await res.text();
            if (textText.trim().startsWith("<")) {
              errMsg = `Service offline (${res.status}). Please try again.`;
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
        throw new Error("Received malformed response from server. Please retry.");
      }
      
      // Update local state
      setSelectedTxn(data.transaction);
      setTransactions(prev =>
        prev.map(t => (t.transaction_id === selectedTxn.transaction_id ? data.transaction : t))
      );
      
      // Notify parent to refresh audits
      onEscalateTrigger();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / 25));

  const isOpsOrRiskForCurrentProvider = () => {
    if (providerScope === "global" || providerScope === "all_agents") return true;
    return providerScope === provider;
  };

  const brandConfig = {
    bkash: {
      primaryColor: "#e2125d",
      accentBg: "bg-[#e2125d]/10",
      accentBadge: "bg-[#e2125d]/10 text-[#e2125d] border-[#e2125d]/30",
      cardStyle: "border-pink-800 shadow-pink-800",
      borderClass: "border-[#e2125d]",
      shadowClass: "shadow-[#e2125d]",
      title: "bKash Operations & Regulatory Ledger Console",
      subtitle: "Secured under strict bKash cryptographic API ledger isolation controls.",
      opsNotice: "🔐 PROPRIETARY DATA: Strictly restricted to bKash ops & authorized risk officers.",
      accentText: "text-[#e2125d]",
      buttonBg: "bg-[#e2125d] hover:bg-[#c00f4f] text-white border-[#e2125d] shadow-[#e2125d]/20"
    },
    nagad: {
      primaryColor: "#f57c20",
      accentBg: "bg-[#f57c20]/10",
      accentBadge: "bg-[#f57c20]/10 text-[#f57c20] border-[#f57c20]/30",
      cardStyle: "border-amber-700 shadow-amber-700",
      borderClass: "border-[#f57c20]",
      shadowClass: "shadow-[#f57c20]",
      title: "Nagad Post-Office Core Network Ledger",
      subtitle: "Government of Bangladesh Postal Division financial partnership protocol active.",
      opsNotice: "🔐 PROPRIETARY DATA: Row-level database filtering is active for Nagad Ops role.",
      accentText: "text-[#f57c20]",
      buttonBg: "bg-[#f57c20] hover:bg-[#d46615] text-white border-[#f57c20] shadow-[#f57c20]/20"
    },
    rocket: {
      primaryColor: "#8c2d82",
      accentBg: "bg-[#8c2d82]/10",
      accentBadge: "bg-[#8c2d82]/10 text-[#8c2d82] border-[#8c2d82]/30",
      cardStyle: "border-purple-800 shadow-purple-800",
      borderClass: "border-[#8c2d82]",
      shadowClass: "shadow-[#8c2d82]",
      title: "Rocket DBBL Bridge Security Ledger Console",
      subtitle: "Dutch-Bangla Bank Limited (DBBL) clearing house gateway active.",
      opsNotice: "🔐 PROPRIETARY DATA: Rocket transactions and ledger history are cryptographically isolated.",
      accentText: "text-[#8c2d82]",
      buttonBg: "bg-[#8c2d82] hover:bg-[#722069] text-white border-[#8c2d82] shadow-[#8c2d82]/20"
    }
  };

  const currentBrand = brandConfig[provider];

  return (
    <div id="provider-txns-panel" className={`bg-white border-2 p-5 flex flex-col gap-5 rounded-none text-[#141414] transition-all duration-300 ${currentBrand.borderClass} ${currentBrand.shadowClass}`} style={{ boxShadow: `4px 4px 0px ${currentBrand.primaryColor}` }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#141414]/15 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 border border-black rounded-none" style={{ backgroundColor: `${currentBrand.primaryColor}15`, color: currentBrand.primaryColor }}>
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-sans font-bold text-[#141414] text-base uppercase tracking-tight">{currentBrand.title}</h3>
            <p className="text-[11px] text-slate-600 font-serif italic mt-0.5">{currentBrand.subtitle}</p>
          </div>
        </div>

        {/* Provider selector tab if global/owner */}
        {(providerScope === "global" || providerScope === "all_agents") && (
          <div className="flex bg-[#E4E3E0] p-1 border border-[#141414] self-start sm:self-auto rounded-none">
            {(["bkash", "nagad", "rocket"] as const).map(p => {
              const isActive = provider === p;
              const pBrand = brandConfig[p];
              return (
                <button
                  key={p}
                  onClick={() => {
                    setProvider(p);
                    setPage(1);
                    setSelectedTxn(null);
                  }}
                  className={`px-3 py-1.5 font-sans text-xs font-extrabold capitalize transition-all rounded-none cursor-pointer`}
                  style={{
                    backgroundColor: isActive ? pBrand.primaryColor : "transparent",
                    color: isActive ? "#ffffff" : "#141414",
                    border: isActive ? `1px solid ${pBrand.primaryColor}` : "none"
                  }}
                >
                  {p}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {error ? (
        <div className="bg-rose-50 border-2 border-rose-800 text-rose-950 p-4 rounded-none text-xs font-sans flex items-center gap-2">
          <AlertOctagon className="w-4 h-4 shrink-0 text-rose-800" />
          <span className="font-bold">{error}</span>
        </div>
      ) : (
        <>
          {/* Filters controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-[#E4E3E0]/30 p-4 border border-[#141414] rounded-none shadow-[2px_2px_0px_rgba(20,20,20,0.05)]">
            <div className="flex flex-wrap items-center gap-3">
              {/* Agent Filter */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[#141414] font-bold uppercase tracking-wider font-mono">Filter Shop</label>
                <select
                  value={agentFilter}
                  onChange={e => handleFilterChange(setAgentFilter, e.target.value)}
                  className="bg-white border border-[#141414] rounded-none px-3 py-1.5 text-xs text-[#141414] font-sans focus:outline-none focus:border-[#141414] focus:ring-1 focus:ring-[#141414]"
                >
                  <option value="">All Shops</option>
                  <option value="AGENT-001">AGENT-001 (Gulshan)</option>
                  <option value="AGENT-002">AGENT-002 (Motijheel)</option>
                  <option value="AGENT-003">AGENT-003 (Dhanmondi)</option>
                  <option value="AGENT-004">AGENT-004 (Mirpur)</option>
                  <option value="AGENT-005">AGENT-005 (Sreepur)</option>
                  <option value="AGENT-006">AGENT-006 (Mymensingh)</option>
                  <option value="AGENT-007">AGENT-007 (Tangail)</option>
                  <option value="AGENT-008">AGENT-008 (Gazipur)</option>
                </select>
              </div>

              {/* Type Filter */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[#141414] font-bold uppercase tracking-wider font-mono">Transaction Type</label>
                <select
                  value={typeFilter}
                  onChange={e => handleFilterChange(setTypeFilter, e.target.value)}
                  className="bg-white border border-[#141414] rounded-none px-3 py-1.5 text-xs text-[#141414] font-sans focus:outline-none focus:border-[#141414] focus:ring-1 focus:ring-[#141414]"
                >
                  <option value="">All Types</option>
                  <option value="cash_in">Cash-In (Deposit)</option>
                  <option value="cash_out">Cash-Out (Withdrawal)</option>
                </select>
              </div>
            </div>

            {/* Toggle Anomaly Only */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleFilterChange(setIsAnomalyOnly, !isAnomalyOnly)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 border text-xs font-sans font-bold transition-all rounded-none ${
                  isAnomalyOnly
                    ? "bg-rose-100 border-rose-800 text-rose-950 shadow-[1px_1px_0px_#991b1b]"
                    : "bg-white border-[#141414] text-[#141414] hover:bg-slate-50"
                }`}
              >
                <AlertOctagon className="w-3.5 h-3.5" />
                Anomalies Only
              </button>
            </div>
          </div>

          {/* Database Table */}
          {loading ? (
            <div className="text-center py-20 text-[#141414]/70 font-serif text-sm italic">
              Querying isolated {provider} databases...
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-20 text-slate-600 font-serif text-sm italic border border-[#141414] rounded-none bg-[#E4E3E0]/20">
              No transactions found matching the security scope or filter parameters.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
              {/* Table list - spans 2 columns on lg */}
              <div className="lg:col-span-2 overflow-x-auto border border-[#141414] rounded-none">
                <table className="w-full text-left border-collapse font-sans text-xs">
                  <thead>
                    <tr className="bg-[#141414] text-[#E4E3E0] border-b border-[#141414] font-mono text-[10px] uppercase font-bold tracking-wider italic">
                      <th className="p-3">ID</th>
                      <th className="p-3">Shop</th>
                      <th className="p-3">Timestamp</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Amount</th>
                      <th className="p-3">Balances</th>
                      <th className="p-3 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#141414]/15 text-[#141414]">
                    {transactions.map(t => {
                      const isCashIn = t.type === "cash_in";
                      const isAnomaly = t.is_ground_truth_anomaly;
                      const isSelected = selectedTxn?.transaction_id === t.transaction_id;
                      return (
                        <tr
                          key={t.transaction_id}
                          onClick={() => isOpsOrRiskForCurrentProvider() && setSelectedTxn(t)}
                          className={`cursor-pointer transition-all ${
                            isSelected
                              ? "bg-[#141414]/10 font-bold border-l-4 border-l-[#141414]"
                              : isAnomaly
                              ? "bg-rose-50 hover:bg-rose-100 text-rose-950"
                              : "hover:bg-[#E4E3E0]/30"
                          }`}
                        >
                          <td className="p-3 font-mono font-bold text-slate-700">
                            <div className="flex items-center gap-1">
                              {isAnomaly && <AlertOctagon className="w-3 h-3 text-rose-700 shrink-0" />}
                              {t.transaction_id}
                            </div>
                          </td>
                          <td className="p-3 font-mono">{t.agent_id}</td>
                          <td className="p-3 font-mono text-[11px] text-slate-500">
                            {t.timestamp.replace("T", " ").replace("Z", "")}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 border text-[10px] uppercase font-mono font-bold ${
                              isCashIn ? "bg-emerald-50 text-emerald-900 border-emerald-800" : "bg-cyan-50 text-cyan-900 border-cyan-800"
                            }`}>
                              {isCashIn ? "In" : "Out"}
                            </span>
                          </td>
                          <td className="p-3 font-mono font-bold text-[#141414]">
                            {t.amount.toLocaleString()} BDT
                          </td>
                          <td className="p-3 font-mono text-[10px] text-slate-600">
                            <span className="block">Op: {t.opening_balance.toLocaleString()}</span>
                            <span className="block">Cl: {t.current_balance.toLocaleString()}</span>
                          </td>
                          <td className="p-3 text-right font-bold">
                            {isAnomaly ? (
                              <span className={`text-[10px] px-1.5 py-0.5 border font-bold uppercase tracking-tight ${
                                t.case_status === "PENDING_REVIEW"
                                  ? "bg-rose-100 text-rose-900 border-rose-800"
                                  : t.case_status === "UNDER_INVESTIGATION"
                                  ? "bg-amber-100 text-amber-900 border-amber-800"
                                  : "bg-emerald-100 text-emerald-900 border-emerald-800"
                              }`}>
                                {t.case_status.replace("_", " ")}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-mono">CLEARED</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Escalation Investigation Details panel - spans 1 column */}
              <div className="bg-white border border-[#141414] p-5 shadow-[4px_4px_0px_rgba(20,20,20,0.08)] flex flex-col gap-4 rounded-none">
                <h4 className="font-sans font-bold text-[#141414] text-sm border-b border-[#141414]/15 pb-2 flex items-center gap-1.5 uppercase tracking-wide">
                  <Zap className="w-4 h-4" style={{ color: currentBrand.primaryColor }} />
                  Investigation Workbench
                </h4>

                {!selectedTxn ? (
                  <div className="text-center py-12 text-slate-600 text-xs font-serif italic leading-relaxed">
                    Select a transaction from the list to inspect risk metadata, event flags, and initiate compliance actions.
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 text-xs font-sans">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 font-mono text-[10px] uppercase font-bold">Transaction ID</span>
                      <span className="font-mono text-[#141414] font-bold">{selectedTxn.transaction_id}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 font-mono text-[10px] uppercase font-bold">Agent Scope</span>
                      <span className="font-mono text-slate-800">{selectedTxn.agent_id} ({selectedTxn.area})</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 font-mono text-[10px] uppercase font-bold">Timestamp</span>
                      <span className="font-mono text-slate-800">{selectedTxn.timestamp}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 font-mono text-[10px] uppercase font-bold">Amount / Type</span>
                      <span className="font-mono font-bold text-[#141414]">{selectedTxn.amount.toLocaleString()} BDT ({selectedTxn.type})</span>
                    </div>

                    <div className="border-t border-[#141414]/15 pt-3 flex flex-col gap-2">
                      <span className="text-[10px] text-slate-600 uppercase font-mono font-bold">System Flags & Warnings</span>
                      {selectedTxn.event_flags ? (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedTxn.event_flags.split(",").map(f => (
                            <span key={f} className="bg-rose-100 text-rose-950 border border-rose-800 px-2 py-0.5 text-[10px] font-mono font-bold uppercase">
                              {f.replace("_", " ")}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-500 italic text-[11px] font-serif">No flags detected (Standard Activity)</span>
                      )}
                    </div>

                    {selectedTxn.is_ground_truth_anomaly && (
                      <div className="bg-rose-50 border-2 border-rose-800 p-3 text-rose-950 rounded-none shadow-[2px_2px_0px_rgba(153,27,27,0.15)]">
                        <div className="flex items-center gap-1.5 mb-1">
                          <AlertOctagon className="w-3.5 h-3.5 text-rose-800" />
                          <span className="font-bold text-[11px] uppercase tracking-wide">Ground Truth Anomaly</span>
                        </div>
                        <p className="text-[11px] text-rose-900 font-mono font-bold">
                          Type: {selectedTxn.anomaly_type?.toUpperCase()}
                        </p>
                        <p className="text-[10px] text-slate-700 mt-1.5 font-serif italic leading-relaxed">
                          This matches programmed ground truth models of malicious, offline, or structured transactions.
                        </p>
                      </div>
                    )}

                    <div className="border-t border-[#141414]/15 pt-3 flex flex-col gap-2.5">
                      <span className="text-[10px] text-slate-600 uppercase font-mono font-bold">Compliance Directives</span>
                      
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => handleEscalate("UNDER_INVESTIGATION")}
                          disabled={updatingStatus || selectedTxn.case_status === "UNDER_INVESTIGATION"}
                          className={`w-full disabled:bg-slate-200 disabled:text-slate-500 disabled:border-slate-300 border py-2 rounded-none font-sans font-extrabold text-xs transition-all shadow-[2px_2px_0px_rgba(20,20,20,0.1)] hover:scale-[1.01] ${currentBrand.buttonBg} cursor-pointer`}
                        >
                          {updatingStatus ? "Processing..." : `Escalate: Under Investigation`}
                        </button>
                        <button
                          onClick={() => handleEscalate("RESOLVED")}
                          disabled={updatingStatus || selectedTxn.case_status === "RESOLVED"}
                          className="w-full bg-emerald-800 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-500 disabled:border-slate-300 border border-emerald-900 py-2 rounded-none font-sans font-bold text-xs text-white transition-all shadow-[2px_2px_0px_rgba(20,20,20,0.1)] hover:scale-[1.01] cursor-pointer"
                        >
                          {updatingStatus ? "Processing..." : "Resolve Case"}
                        </button>
                      </div>
                      <p className="text-[9px] text-slate-500 leading-normal italic text-center font-serif mt-1">
                        Note: All directives are advisory. Automatic freezes, accusations, or financial penalties are strictly out of scope.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pagination Controls */}
          <div className="flex items-center justify-between border-t border-[#141414] pt-4 font-sans text-xs">
            <span className="text-slate-600">
              Showing {transactions.length} of <strong className="text-[#141414]">{totalCount}</strong> records
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-none bg-white hover:bg-slate-50 border border-[#141414] disabled:opacity-30 disabled:hover:bg-white transition-all shadow-[1px_1px_0px_#141414]"
              >
                <ChevronLeft className="w-4 h-4 text-[#141414]" />
              </button>
              <span className="text-[#141414] font-mono font-bold">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-none bg-white hover:bg-slate-50 border border-[#141414] disabled:opacity-30 disabled:hover:bg-white transition-all shadow-[1px_1px_0px_#141414]"
              >
                <ChevronRight className="w-4 h-4 text-[#141414]" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
