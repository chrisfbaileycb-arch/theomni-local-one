import { useEffect, useState } from "react";
import "@/App.css";
import { Toaster } from "sonner";
import { LayoutDashboard, Clapperboard, TrendingUp, Sparkles, UtensilsCrossed, Users, LogOut, Crown, Gift } from "lucide-react";
import Overview from "@/sections/Overview";
import Dashboard from "@/sections/Dashboard";
import ContentDirector from "@/sections/ContentDirector";
import Executioner from "@/sections/Executioner";
import Maximizer from "@/sections/Maximizer";
import Team from "@/sections/Team";
import OperatorCopilot from "@/components/OperatorCopilot";
import { getOverview, getApprovals } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";

const NAV = [
  { id: "overview", label: "Command Center", icon: LayoutDashboard },
  { id: "dashboard", label: "Spin to Win Dashboard", icon: Gift },
  { id: "executioner", label: "Quality Content Executioner", icon: TrendingUp },
  { id: "maximizer", label: "Quality Customer Maximizer", icon: Sparkles },
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
    <div className="App" style={{ background: "var(--bone)" }}>
      <Toaster position="top-right" richColors />
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 border-r hidden md:flex flex-col fixed h-screen"
               style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="p-6 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "var(--primary)" }}>
                <UtensilsCrossed size={18} color="#fff" />
              </div>
              <div>
                <div className="serif text-xl leading-none" style={{ fontWeight: 600 }}>OmniLocal #1</div>
                <div className="overline" style={{ fontSize: "0.55rem" }}>Revenue Engine</div>
              </div>
            </div>
          </div>

          <nav className="p-3 flex-1">
            {NAV.map((n) => {
              const Icon = n.icon;
              const on = active === n.id;
              return (
                <button key={n.id} data-testid={`nav-${n.id}`} onClick={() => setActive(n.id)}
                  className="nav-item w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 text-left"
                  style={{ background: on ? "var(--surface-alt)" : "transparent",
                           color: on ? "var(--primary)" : "var(--text-secondary)", fontWeight: on ? 700 : 500 }}>
                  <Icon size={18} />
                  <span className="text-sm flex-1">{n.label}</span>
                  {n.id === "team" && pendingCount > 0 && (
                    <span data-testid="nav-pending-badge" className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: "var(--primary)", color: "#fff" }}>{pendingCount}</span>
                  )}
                </button>
              );
            })}
          </nav>

          {user && (
            <div className="p-4 mx-3 mb-1 rounded-lg flex items-center gap-3" data-testid="user-card"
              style={{ background: "var(--surface-alt)" }}>
              {user.picture
                ? <img src={user.picture} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                : <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: "var(--surface)" }}>{(user.name || user.email)[0]?.toUpperCase()}</div>}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate flex items-center gap-1">
                  {user.name || user.email}
                  {user.role === "owner" && <Crown size={11} style={{ color: "var(--primary)" }} />}
                </div>
                <div className="overline" style={{ fontSize: "0.5rem" }}>{user.role === "owner" ? "Owner · Approver" : "Team Member"}</div>
              </div>
              <button data-testid="logout-btn" onClick={logout} title="Sign out"
                className="p-1.5 rounded hover:opacity-70" style={{ color: "var(--text-secondary)" }}>
                <LogOut size={15} />
              </button>
            </div>
          )}

          {brand && (
            <div className="p-4 m-3 rounded-lg" style={{ background: "var(--surface-alt)" }}>
              <div className="overline" style={{ fontSize: "0.55rem" }}>Active Business</div>
              <div className="serif text-lg" style={{ fontWeight: 600 }}>{brand.name}</div>
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{brand.city} · {brand.signatureItem}</div>
            </div>
          )}
        </aside>

        <main className="flex-1 md:ml-64">
          {/* Mobile nav */}
          <div className="md:hidden flex gap-1 p-2 border-b overflow-x-auto sticky top-0 z-20"
               style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            {NAV.map((n) => (
              <button key={n.id} data-testid={`mnav-${n.id}`} onClick={() => setActive(n.id)}
                className="px-3 py-2 rounded-lg text-xs whitespace-nowrap"
                style={{ background: active === n.id ? "var(--surface-alt)" : "transparent",
                         color: active === n.id ? "var(--primary)" : "var(--text-secondary)", fontWeight: 600 }}>
                {n.label}
              </button>
            ))}
          </div>

          {active === "overview" && <Overview onNavigate={setActive} />}
          {active === "dashboard" && <Dashboard />}
          {active === "executioner" && <Executioner />}
          {active === "maximizer" && <Maximizer />}
          {active === "content" && <ContentDirector />}
          {active === "team" && <Team />}

          {/* Autonomous Voice & Telemetry Co-Captain */}
          <OperatorCopilot activeTab={active} onNavigate={setActive} user={user} />
        </main>
      </div>
    </div>
  );
}

export default App;
