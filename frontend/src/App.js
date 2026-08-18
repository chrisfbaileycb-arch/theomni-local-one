import { useEffect, useState } from "react";
import "@/App.css";
import { Toaster } from "sonner";
import {
  LayoutDashboard, Clapperboard, TrendingUp, Sparkles, UtensilsCrossed,
  Users, LogOut, Crown, Gift, Database, Brain, Layers, Printer
} from "lucide-react";
import Overview from "@/sections/Overview";
import Dashboard from "@/sections/Dashboard";
import ContentDirector from "@/sections/ContentDirector";
import Executioner from "@/sections/Executioner";
import Maximizer from "@/sections/Maximizer";
import Team from "@/sections/Team";
import AttributionHub from "@/sections/AttributionHub";
import LongitudinalKnowledge from "@/sections/LongitudinalKnowledge";
import MultiTrackStrategy from "@/sections/MultiTrackStrategy";
import PrintStudio from "@/sections/PrintStudio";
import OperatorCopilot from "@/components/OperatorCopilot";
import { getOverview, getApprovals } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";

const NAV = [
  { id: "overview", label: "Command Center", icon: LayoutDashboard },
  { id: "printstudio", label: "Print & QR Studio", icon: Printer },
  { id: "attribution", label: "Attribution Hub & CSVs", icon: Database },
  { id: "knowledge", label: "Knowledge Base", icon: Brain },
  { id: "multitrack", label: "Multi-Track Campaigns", icon: Layers },
  { id: "dashboard", label: "Spin & Vouchers", icon: Gift },
  { id: "executioner", label: "Content Executioner", icon: TrendingUp },
  { id: "maximizer", label: "Customer Maximizer", icon: Sparkles },
  { id: "content", label: "Content Director", icon: Clapperboard },
  { id: "team", label: "Team & Approvals", icon: Users },
];

function App() {
  const [active, setActive] = useState("overview");
  const [brand, setBrand] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const { user, logout } = useAuth();

  useEffect(() => { getOverview().then((d) => setBrand(d.brand)).catch(() => {}); }, []);
  useEffect(() => {
    getApprovals().then((d) => setPendingCount(user?.role === "owner" ? d.pendingCount : 0)).catch(() => {});
  }, [active, user]);

  return (
    <div
      className="App w-screen h-screen overflow-hidden flex flex-row"
      style={{
        background: "var(--bone)",
        height: "100vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "row"
      }}
    >
      <Toaster position="top-right" richColors />

      {/* Left Navigation Sidebar */}
      <aside
        className="w-56 lg:w-60 shrink-0 border-r hidden md:flex flex-col h-screen overflow-y-auto select-none"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="p-5 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--primary)" }}>
              <UtensilsCrossed size={16} color="#fff" />
            </div>
            <div>
              <div className="serif text-lg leading-none" style={{ fontWeight: 600 }}>OmniLocal #1</div>
              <div className="overline" style={{ fontSize: "0.5rem" }}>Revenue Engine</div>
            </div>
          </div>
        </div>

        <nav className="p-2.5 flex-1 overflow-y-auto">
          {NAV.map((n) => {
            const Icon = n.icon;
            const on = active === n.id;
            return (
              <button
                key={n.id}
                data-testid={`nav-${n.id}`}
                onClick={() => setActive(n.id)}
                className="nav-item w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg mb-1 text-left transition-colors"
                style={{
                  background: on ? "var(--surface-alt)" : "transparent",
                  color: on ? "var(--primary)" : "var(--text-secondary)",
                  fontWeight: on ? 700 : 500
                }}
              >
                <Icon size={16} className="shrink-0" />
                <span className="text-xs flex-1 truncate">{n.label}</span>
                {n.id === "team" && pendingCount > 0 && (
                  <span
                    data-testid="nav-pending-badge"
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                    style={{ background: "var(--primary)", color: "#fff" }}
                  >
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {user && (
          <div
            className="p-3 mx-2.5 mb-1 rounded-lg flex items-center gap-2.5 shrink-0"
            data-testid="user-card"
            style={{ background: "var(--surface-alt)" }}
          >
            {user.picture ? (
              <img src={user.picture} alt="" className="w-7 h-7 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: "var(--surface)" }}
              >
                {(user.name || user.email)[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold truncate flex items-center gap-1">
                {user.name || user.email}
                {user.role === "owner" && <Crown size={11} style={{ color: "var(--primary)" }} />}
              </div>
              <div className="overline" style={{ fontSize: "0.5rem" }}>
                {user.role === "owner" ? "Owner · Approver" : "Team Member"}
              </div>
            </div>
            <button
              data-testid="logout-btn"
              onClick={logout}
              title="Sign out"
              className="p-1 rounded hover:opacity-70 text-slate-500"
            >
              <LogOut size={14} />
            </button>
          </div>
        )}

        {brand && (
          <div className="p-3 m-2.5 rounded-lg shrink-0" style={{ background: "var(--surface-alt)" }}>
            <div className="overline" style={{ fontSize: "0.5rem" }}>Active Business</div>
            <div className="serif text-base truncate" style={{ fontWeight: 600 }}>{brand.name}</div>
            <div className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>
              {brand.city} · {brand.signatureItem}
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main
        className="flex-1 h-screen overflow-y-auto min-w-0"
        style={{
          flex: 1,
          height: "100vh",
          overflowY: "auto",
          paddingBottom: "2rem"
        }}
      >
        {/* Mobile Navigation */}
        <div
          className="md:hidden flex gap-1 p-2 border-b overflow-x-auto sticky top-0 z-20"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          {NAV.map((n) => (
            <button
              key={n.id}
              data-testid={`mnav-${n.id}`}
              onClick={() => setActive(n.id)}
              className="px-3 py-1.5 rounded-lg text-xs whitespace-nowrap"
              style={{
                background: active === n.id ? "var(--surface-alt)" : "transparent",
                color: active === n.id ? "var(--primary)" : "var(--text-secondary)",
                fontWeight: 600
              }}
            >
              {n.label}
            </button>
          ))}
        </div>

        <div className="w-full">
          {active === "overview" && <Overview onNavigate={setActive} />}
          {active === "printstudio" && <PrintStudio />}
          {active === "attribution" && <AttributionHub />}
          {active === "knowledge" && <LongitudinalKnowledge />}
          {active === "multitrack" && <MultiTrackStrategy />}
          {active === "dashboard" && <Dashboard />}
          {active === "executioner" && <Executioner />}
          {active === "maximizer" && <Maximizer />}
          {active === "content" && <ContentDirector />}
          {active === "team" && <Team />}
        </div>
      </main>

      {/* Right Co-Captain Agent Sidebar */}
      <OperatorCopilot activeTab={active} onNavigate={setActive} user={user} brand={brand} />
    </div>
  );
}

export default App;
