// src/App.jsx

import React, { useState } from "react";
import {
  createBrowserRouter,
  RouterProvider,
  createRoutesFromElements,
  Route,
  Navigate,
  Outlet,
  useNavigate,
  useOutletContext,
} from "react-router-dom";

import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Onboarding from "./pages/Onboarding.jsx";
import Dashboard from "./pages/Dashboard.jsx";

/** Top chrome layout — purely presentational */
function AppShell({ user, onLogout, children }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-circle">λ</div>
          Lidor - AI Crypto Advisor
          <span className="badge-pill">Version 1.0</span>
        </div>

        {/* Right side: current user + logout */}
        <div className="topbar-actions">
          {user ? (
            <>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {user.email}
              </span>
              <button className="btn-ghost logout-btn" onClick={onLogout}>
                Logout
              </button>
            </>
          ) : null}
        </div>
      </header>

      <main className="main-content">{children}</main>
    </div>
  );
}

/**
 * Root layout
 * - Owns token/user state and persists to localStorage
 * - Exposes auth handlers to route children via Outlet context
 */
function RootLayout() {
  const navigate = useNavigate();

  // bootstrap auth state from localStorage (simple persistence)
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  });
  // kept for parity with pages that may gate on it
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  // Called by Login/Register pages on success
  function handleAuth({ token, user, needsOnboarding = false }) {
    setToken(token);
    setUser(user);
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));

    if (needsOnboarding) {
      setNeedsOnboarding(true);
      navigate("/onboarding");
    } else {
      navigate("/");
    }
  }

  // Clear session + go to login
  function handleLogout() {
    setToken("");
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  return (
    <AppShell user={user} onLogout={handleLogout}>
      {/* Share auth state + handlers to child routes */}
      <Outlet
        context={{
          token,
          user,
          needsOnboarding,
          handleAuth,
          handleLogout,
        }}
      />
    </AppShell>
  );
}

/** Thin wrappers: inject the same props your pages expect (no page changes) */
function LoginRoute() {
  const { handleAuth } = useOutletContext();
  return <Login onAuth={handleAuth} />;
}

function RegisterRoute() {
  const { handleAuth } = useOutletContext();
  return <Register onAuth={handleAuth} />;
}

function OnboardingRoute() {
  const { token } = useOutletContext();
  const navigate = useNavigate();
  // simple guard: require token to access onboarding
  if (!token) return <Navigate to="/login" />;
  return <Onboarding token={token} onDone={() => navigate("/")} />;
}

function DashboardRoute() {
  const { token, user, handleLogout } = useOutletContext();
  const navigate = useNavigate();
  // simple guard: require token to access dashboard
  if (!token) return <Navigate to="/login" />;
  return (
    <Dashboard
      token={token}
      user={user}
      onRequireOnboarding={() => navigate("/onboarding")}
      onLogout={handleLogout}
    />
  );
}

export default function App() {
  // Route tree (kept minimal; v7 future flags enabled to silence warnings)
  const routes = createRoutesFromElements(
    <Route element={<RootLayout />}>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/register" element={<RegisterRoute />} />
      <Route path="/onboarding" element={<OnboardingRoute />} />
      <Route index element={<DashboardRoute />} />
    </Route>
  );

  // Router setup (no visual changes)
  const router = createBrowserRouter(routes, {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    },
  });

  return (
    <RouterProvider
      router={router}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    />
  );
}