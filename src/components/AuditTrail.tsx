import React, { useEffect, useState } from "react";
import { Database, RefreshCw, Copy, Check, Server } from "lucide-react";
import { AuditLogEntry } from "../types";

interface AuditTrailProps {
  token: string | null;
  refreshTrigger: number;
  onRefresh: () => void;
}

export default function AuditTrail({ token, refreshTrigger, onRefresh }: AuditTrailProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/audit/logs", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to fetch audit logs");
      }
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [token, refreshTrigger]);

  const handleCopy = (hash: string, id: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!token) return null;

  return (
    <div id="audit-trail-panel" className="bg-white border-2 border-[#141414] p-5 shadow-[4px_4px_0px_#141414] rounded-none text-[#141414]">
      <div className="flex items-center justify-between mb-4 border-b border-[#141414] pb-3">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-[#141414]" />
          <div>
            <h3 className="font-sans font-bold text-[#141414] text-base uppercase tracking-tight">Immutable Access Audit Trail</h3>
            <p className="text-[10px] text-slate-600 font-mono">File: db_files/audit_log.csv</p>
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-none bg-white hover:bg-slate-50 border border-[#141414] text-xs font-sans font-bold text-[#141414] transition-all disabled:opacity-50 shadow-[2px_2px_0px_#141414] active:translate-y-0.5 active:shadow-none cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#141414]" : "text-slate-600"}`} />
          Refresh Log
        </button>
      </div>

      <p className="font-sans text-xs text-slate-700 mb-4 leading-relaxed">
        The server generates an immutable record with a unique UUID, server UTC timestamp, scope, status, and a <strong className="text-[#141414] underline">SHA-256 HMAC signature</strong> whenever any transaction is accessed, filtered, or escalated. This ensures regulatory accountability.
      </p>

      {error ? (
        <div className="bg-rose-50 border-2 border-rose-800 text-rose-950 p-4 rounded-none text-xs font-sans flex items-center gap-2 font-bold">
          <Server className="w-4 h-4 shrink-0 text-rose-800" />
          <span>{error === "Access Denied. Audit Logs are restricted to Management and Shop Owners only." ? "Tenant Restriction: Audit logs are encrypted and restricted to high-privilege roles (Management & Shop Owners) only." : error}</span>
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-6 text-slate-600 font-serif text-sm italic">
          {loading ? "Decrypting and loading audit logs..." : "No recent audit records found."}
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[350px] overflow-y-auto rounded-none border border-[#141414]">
          <table className="w-full text-left border-collapse font-mono text-[11px]">
            <thead>
              <tr className="bg-[#141414] text-[#E4E3E0] border-b border-[#141414] font-bold tracking-wider italic uppercase text-[10px]">
                <th className="p-3 font-medium">Audit ID</th>
                <th className="p-3 font-medium">Timestamp (UTC)</th>
                <th className="p-3 font-medium">Caller (Role)</th>
                <th className="p-3 font-medium">Action</th>
                <th className="p-3 font-medium">Scope</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium text-right">Cryptographic Signature</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141414]/15 text-[#141414]">
              {logs.map((log) => {
                const isSuccess = log.status.includes("200");
                return (
                  <tr key={log.audit_id} className="hover:bg-[#E4E3E0]/30 transition-colors">
                    <td className="p-3 text-slate-700 font-bold">{log.audit_id}</td>
                    <td className="p-3 text-slate-600 text-[10px] whitespace-nowrap">
                      {log.timestamp.replace("T", " ").replace("Z", "")}
                    </td>
                    <td className="p-3">
                      <span className="text-[#141414] font-bold">{log.username}</span>
                      <span className="text-[9px] text-slate-600 block">({log.role})</span>
                    </td>
                    <td className="p-3 font-semibold text-[#141414]">{log.action}</td>
                    <td className="p-3 text-slate-700 font-bold">{log.scope}</td>
                    <td className="p-3">
                      <span className={`px-1.5 py-0.5 border text-[9px] font-bold ${
                        isSuccess ? "bg-emerald-50 text-emerald-900 border-emerald-800" : "bg-rose-50 text-rose-900 border-rose-800"
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="p-3 text-right text-[10px] text-slate-600 font-mono relative group">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="truncate max-w-[120px] select-all block cursor-pointer hover:text-[#141414] font-bold" title={log.hash}>
                          {log.hash}
                        </span>
                        <button
                          onClick={() => handleCopy(log.hash, log.audit_id)}
                          className="text-slate-500 hover:text-[#141414] p-0.5 rounded transition-colors cursor-pointer"
                          title="Copy SHA-256 HMAC Signature"
                        >
                          {copiedId === log.audit_id ? (
                            <Check className="w-3 h-3 text-emerald-800" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
