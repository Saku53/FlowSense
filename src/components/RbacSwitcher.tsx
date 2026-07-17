import React from "react";
import { Shield, User as UserIcon, HelpCircle, Key, Check } from "lucide-react";
import { User } from "../types";

interface RbacSwitcherProps {
  currentUser: User | null;
  activeToken: string | null;
  onLogin: (username: string) => Promise<void>;
  loading: boolean;
}

const SEEDED_PROFILES = [
  { username: "agent1", label: "Maa Telecom (Gulshan)", role: "AGENT", scope: "AGENT-001", badgeColor: "bg-emerald-100 text-emerald-900 border-emerald-800" },
  { username: "agent5", label: "Sreepur Agency (Semi-Urban)", role: "AGENT", scope: "AGENT-005", badgeColor: "bg-emerald-100 text-emerald-900 border-emerald-800" },
  { username: "bkash_ops", label: "bKash Ops Team", role: "PROVIDER_OPS", scope: "bkash", badgeColor: "bg-pink-100 text-pink-900 border-pink-800" },
  { username: "nagad_ops", label: "Nagad Ops Team", role: "PROVIDER_OPS", scope: "nagad", badgeColor: "bg-amber-100 text-amber-900 border-amber-800" },
  { username: "bkash_risk", label: "bKash Risk Compliance Analyst", role: "RISK_ANALYST", scope: "bkash", badgeColor: "bg-rose-100 text-rose-900 border-rose-800" },
  { username: "shop_owner", label: "Combined Agent Shop Owner", role: "SHOP_OWNER", scope: "all_agents", badgeColor: "bg-cyan-100 text-cyan-900 border-cyan-800" },
  { username: "management", label: "Cross-Provider Management", role: "MANAGEMENT", scope: "global", badgeColor: "bg-purple-100 text-purple-900 border-purple-800" },
];

export default function RbacSwitcher({ currentUser, activeToken, onLogin, loading }: RbacSwitcherProps) {
  return (
    <div id="rbac-switcher-panel" className="bg-white border-2 border-[#141414] p-5 shadow-[4px_4px_0px_#141414] h-full flex flex-col rounded-none">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-5 h-5 text-[#141414]" />
        <h3 className="font-sans font-bold text-[#141414] text-base uppercase tracking-tight">RBAC Control Center</h3>
      </div>
      
      <p className="font-serif italic text-xs text-[#141414]/80 mb-5 leading-relaxed">
        Select a seeded user profile below. This issues a simulated secure token containing roles & scope claims, immediately triggering server-side row-level filtering.
      </p>

      <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto max-h-[420px] pr-1">
        {SEEDED_PROFILES.map((profile) => {
          const isSelected = currentUser?.username === profile.username;
          return (
            <button
              id={`profile-btn-${profile.username}`}
              key={profile.username}
              onClick={() => !loading && onLogin(profile.username)}
              disabled={loading}
              className={`text-left w-full p-3 border transition-all flex flex-col gap-1.5 rounded-none ${
                isSelected
                  ? "bg-[#141414] border-2 border-[#141414] text-[#E4E3E0]"
                  : "bg-white hover:bg-slate-50 border border-[#141414] text-[#141414]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-sans font-bold text-xs tracking-tight uppercase">
                  {profile.label}
                </span>
                {isSelected && <Check className="w-4 h-4 text-[#E4E3E0]" />}
              </div>

              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] uppercase font-mono font-bold px-1.5 py-0.5 border ${
                  isSelected ? "bg-white/20 text-white border-white/45" : profile.badgeColor + " border-[#141414]/30"
                }`}>
                  {profile.role}
                </span>
                <span className={`text-[10px] font-mono ${isSelected ? "text-slate-300" : "text-slate-500"}`}>
                  Scope: {profile.scope}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {currentUser && activeToken && (
        <div className="mt-5 pt-4 border-t border-[#141414]">
          <div className="flex items-center gap-2 mb-2">
            <Key className="w-3.5 h-3.5 text-[#141414]" />
            <span className="font-sans font-bold text-xs text-[#141414] uppercase tracking-tight">Active Bearer Token Claims</span>
          </div>
          <div className="bg-[#141414] p-3 rounded-none border border-[#141414] font-mono text-[10px] text-[#E4E3E0] break-all select-all leading-normal relative overflow-hidden">
            <div className="absolute top-1 right-1 px-1 rounded bg-white/10 text-white text-[8px] uppercase">
              JWT payload
            </div>
            <p className="text-emerald-400 mb-1">"username": "{currentUser.username}"</p>
            <p className="text-cyan-400 mb-1">"role": "{currentUser.role}"</p>
            <p className="text-pink-400">"scope": "{currentUser.scope}"</p>
          </div>
          <p className="text-[10px] text-[#141414]/75 font-serif italic mt-2 text-center leading-relaxed">
            {currentUser.description}
          </p>
        </div>
      )}
    </div>
  );
}
