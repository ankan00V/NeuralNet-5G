import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import AccessPortal from "./components/AccessPortal";
import { ThemeToggle } from "./components/ThemeToggle";
import { useLiveNetwork } from "./context/WebSocketContext";
import { buildApiPath, isDemoAuthBypassEnabled } from "./lib/runtimeConfig";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Towers = lazy(() => import("./pages/Towers"));
const Alerts = lazy(() => import("./pages/Alerts"));
const TowerStorySection = lazy(() => import("./components/TowerStorySection"));

const navItems = [
  { to: "/dashboard", label: "Overview" },
  { to: "/towers", label: "Inference Queue" },
  { to: "/alerts", label: "Fault Queue" },
];

function NavItem({ to, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "text-[12px] tracking-apple-micro transition-all duration-200 ease-apple active:scale-95",
          isActive ? "text-white opacity-100" : "text-white/80 hover:text-white hover:underline",
        ].join(" ")
      }
    >
      {label}
    </NavLink>
  );
}

export default function App() {
  const { connected, dataMode, lastUpdate, towers, triggerDemoInference, demoEnabled } = useLiveNetwork();
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [demoMoment, setDemoMoment] = useState(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let disposed = false;

    async function loadSession() {
      try {
        const response = await fetch(buildApiPath("/api/v1/auth/me"), {
          credentials: "include",
        });
        if (!response.ok) {
          if (!disposed) setSession(null);
          return;
        }
        const user = await response.json();
        if (!disposed) {
          setSession({
            operator: user.tenant,
            role: user.role,
            name: user.name,
            email: user.email,
          });
        }
      } catch {
        if (!disposed) setSession(null);
      } finally {
        if (!disposed) setAuthLoading(false);
      }
    }

    loadSession();

    return () => {
      disposed = true;
    };
  }, []);

  const summary = useMemo(() => {
    const critical = towers.filter((tower) => tower.status === "red").length;
    const warning = towers.filter((tower) => tower.status === "amber").length;
    const nominal = towers.length - critical - warning;
    const averageRisk = towers.length
      ? towers.reduce((total, tower) => total + tower.fault_probability, 0) / towers.length
      : 0;
    const highestRisk = [...towers].sort((left, right) => right.fault_probability - left.fault_probability)[0];

    return {
      critical,
      warning,
      nominal,
      averageRisk,
      highestRisk,
    };
  }, [towers]);

  async function handleLogin(credentials) {
    if (isDemoAuthBypassEnabled) {
      setSession({
        operator: credentials.operator,
        role: "admin",
        name: credentials.email,
        email: credentials.email,
      });
      return;
    }

    const response = await fetch(buildApiPath("/api/v1/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: credentials.email, password: credentials.password }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.detail || "Login failed");
    }

    const payload = await response.json();
    const user = payload.user;
    setSession({
      operator: user.tenant,
      role: user.role,
      name: user.name,
      email: user.email,
    });
  }

  async function handleLogout() {
    await fetch(buildApiPath("/api/v1/auth/logout"), {
      method: "POST",
      credentials: "include",
    }).catch(() => null);
    setSession(null);
  }

  async function handleDemoInference() {
    if (!demoEnabled) return;
    setDemoBusy(true);
    try {
      const result = await triggerDemoInference();
      navigate("/dashboard");
      if (result?.towerId) {
        setDemoMoment({
          towerId: result.towerId,
          token: Date.now(),
        });
      }
    } finally {
      setDemoBusy(false);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-apple-gray text-core-textMuted text-sm font-mono">
        Validating secure session...
      </div>
    );
  }

  if (!session) {
    return <AccessPortal onEnter={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-apple-gray text-apple-dark">
      <header className="navbar sticky top-0 z-50 shadow-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <NavLink to="/dashboard" className="flex items-center gap-3 active:scale-95 transition-transform">
              <span className="flex h-6 w-6 items-center justify-center rounded bg-core-primary text-xs font-bold text-white shadow-glow-primary">
                N
              </span>
              <div className="flex flex-col">
                <span className="text-sm font-bold tracking-wide text-white leading-tight">NeuralNet5G</span>
                <span className="text-[10px] font-mono tracking-wider text-core-accent uppercase leading-tight">
                  Telecom AI
                </span>
              </div>
            </NavLink>

            <nav className="hidden items-center gap-2 md:flex h-full mt-1">
              {navItems.map((item) => (
                <NavItem key={item.to} {...item} />
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-core-textMuted">
            <span className="hidden md:flex nav-pill text-core-text">
              <span className={`live-dot ${connected ? "bg-core-primary shadow-glow-primary" : "bg-core-critical shadow-glow-critical"}`}></span>
              {dataMode === "live" ? "Network Feed" : "Demo Feed"}
            </span>

            <ThemeToggle />

            {demoEnabled ? (
              <button
                type="button"
                onClick={handleDemoInference}
                disabled={demoBusy}
                className={`nav-pill justify-center cursor-pointer transition-colors ${
                  demoBusy ? "opacity-50" : "hover:border-core-border font-bold text-core-text"
                } disabled:cursor-not-allowed`}
              >
                <span className={`live-dot ${demoBusy ? "bg-core-textMuted" : connected ? "bg-core-accent" : "bg-core-textMuted"}`} />
                {demoBusy ? "LAUNCHING..." : "Live Inference"}
              </button>
            ) : null}

            <div className="hidden lg:flex items-center gap-3 border-l border-core-border pl-4">
              <div className="flex flex-col items-end">
                <span className="navbar-workspace-value">{session.name ?? session.email}</span>
                <span className="navbar-workspace-label">{session.role} · {session.operator}</span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="ml-2 flex h-[32px] w-[32px] items-center justify-center rounded-full bg-core-surface border border-core-borderLight text-core-text hover:text-white hover:bg-core-textMuted transition-colors text-[13px] font-bold"
                aria-label="Sign out"
                title="Sign out"
              >
                {session.name ? session.name.substring(0, 2).toUpperCase() : "U"}
              </button>
            </div>
          </div>
        </div>
      </header>

      <Suspense
        fallback={
          <section className="bg-black">
            <div className="mx-auto max-w-[980px] px-4 py-16 sm:px-6">
              <div className="rounded-[32px] bg-[#111114] px-6 py-12 text-center text-[17px] tracking-apple-tight text-white/70">
                Loading AI telecom story...
              </div>
            </div>
          </section>
        }
      >
        <TowerStorySection summary={summary} towerCount={towers.length} />
      </Suspense>

      <main id="operations" className="bg-apple-gray">
        <div className="mx-auto max-w-[1280px] w-full px-4 pb-24 pt-8 sm:px-6 sm:pt-12 dashboard-content-wrapper">
          <Suspense
            fallback={
              <div className="surface-panel px-6 py-12 text-center text-[17px] tracking-apple-tight text-black/70">
                Loading AI operations surface...
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard demoMoment={demoMoment} session={session} />} />
              <Route path="/towers" element={<Towers />} />
              <Route path="/alerts" element={<Alerts />} />
            </Routes>
          </Suspense>
        </div>
      </main>
    </div>
  );
}
