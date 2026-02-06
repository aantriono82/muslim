import { NavLink } from "react-router-dom";
import Container from "./Container";
import { navItems } from "../lib/nav";

const Header = () => {
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
      </Container>
    </header>
  );
};

export default Header;
