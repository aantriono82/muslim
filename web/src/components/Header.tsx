import { useSyncExternalStore } from "react";
import { NavLink } from "react-router-dom";
import Container from "./Container";
import { navItems } from "../lib/nav";
import { getApiSource, getApiStatus, subscribeApiStatus } from "../lib/api";

const Header = () => {
  const status = useSyncExternalStore(
    subscribeApiStatus,
    getApiStatus,
    getApiStatus,
  );
  const source = useSyncExternalStore(
    subscribeApiStatus,
    getApiSource,
    getApiSource,
  );
  const sourceLabel =
    source === "proxy"
      ? "Proxy"
      : source === "myquran"
        ? "MyQuran"
        : source === "equran"
          ? "EQuran"
          : "Unknown";
  const sourceDot =
    source === "proxy"
      ? "bg-emerald-500"
      : source === "myquran"
        ? "bg-blue-500"
        : source === "equran"
          ? "bg-sky-500"
          : "bg-slate-300";
  const badgeTone =
    status === "fallback"
      ? "border-red-200 bg-red-50 text-red-700"
      : status === "ok"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-slate-200 bg-slate-50 text-slate-600";
  const dotPulse = status === "ok" ? "status-pulse" : "";

  return (
    <header className="safe-top sticky top-0 z-40 border-b border-emerald-100 bg-white/90 backdrop-blur">
      <Container>
        <div className="flex h-16 items-center justify-between">
          <NavLink to="/" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-600 text-white shadow">
              <span className="text-sm font-bold tracking-tight">MK</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-textPrimary">
                MuslimKit
              </p>
              <p className="text-xs text-textSecondary">
                Toolkit Muslim harian
              </p>
            </div>
          </NavLink>
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full border ${badgeTone}`}
              title={`Sumber data: ${sourceLabel}`}
              aria-label={`Sumber data: ${sourceLabel}`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${sourceDot} ${dotPulse}`}
              />
            </span>
            <nav className="hidden items-center gap-3 lg:flex">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `rounded-full px-4 py-2 text-sm font-medium transition ${
                      isActive
                        ? "bg-emerald-600 text-white"
                        : "text-textSecondary hover:text-emerald-700"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      </Container>
    </header>
  );
};

export default Header;
