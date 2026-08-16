import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { authMe, authLogout } from "@/lib/api";
import Login from "@/sections/Login";
import ActivateGate from "@/sections/ActivateGate";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [needsCode, setNeedsCode] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((d) => {
    setUser(d.user);
    setNeedsCode(!!d.needsCode);
    setRevoked(!!d.revoked);
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await authMe());
    } catch {
      setUser(null);
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onLocked = (e) => {
      if (e.detail === "revoked") setRevoked(true);
      else setNeedsCode(true);
    };
    window.addEventListener("omni-auth-locked", onLocked);
    return () => window.removeEventListener("omni-auth-locked", onLocked);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authLogout();
    } catch {}
    setUser(null);
    setNeedsCode(false);
    setRevoked(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, needsCode, revoked, loading, apply, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthGate({ children }) {
  const { user, loading, needsCode, revoked } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bone)" }}>
        <div className="overline" data-testid="auth-loading" style={{ color: "var(--text-secondary)" }}>
          Loading OmniLocal #1…
        </div>
      </div>
    );
  }
  if (!user) return <Login />;
  if (revoked || needsCode) return <ActivateGate />;
  return children;
}
