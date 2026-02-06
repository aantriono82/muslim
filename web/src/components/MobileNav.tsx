import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Menu } from "lucide-react";
import { mobilePrimary, navItems } from "../lib/nav";

const MobileNav = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-40 border-t border-emerald-100 bg-white/95 lg:hidden">
        <div className="grid grid-cols-4">
          {mobilePrimary.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className="flex min-h-[56px] flex-col items-center justify-center gap-1.5 py-3 text-xs text-emerald-700"
              >
                <Icon className="h-5 w-5 text-emerald-600" />
                {item.label}
              </NavLink>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-[56px] flex-col items-center justify-center gap-1.5 py-3 text-xs text-emerald-700"
          >
            <Menu className="h-5 w-5 text-emerald-600" />
            Lainnya
          </button>
        </div>
      </nav>

      {open ? (
        <div
          className="fixed inset-0 z-50 bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="safe-bottom absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-auto rounded-t-3xl bg-white p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-textPrimary">
                Menu Lengkap
              </h3>
              <button
                type="button"
                className="text-xs text-textSecondary"
                onClick={() => setOpen(false)}
              >
                Tutup
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-sm text-emerald-700"
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default MobileNav;
