import { useEffect, useId, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { mobilePrimary, navItems } from "../lib/nav";

const MobileNav = () => {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const sheetId = useId();
  const sheetTitleId = useId();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (typeof window === "undefined") return;
    if (!open) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const getFocusableElements = () => {
      const container = sheetRef.current;
      if (!container) return [] as HTMLElement[];
      const selectors = [
        "a[href]",
        "button:not([disabled])",
        "input:not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        '[tabindex]:not([tabindex="-1"])',
      ].join(", ");
      return Array.from(container.querySelectorAll<HTMLElement>(selectors));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusableElements();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !sheetRef.current?.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => {
      const [firstFocusable] = getFocusableElements();
      firstFocusable?.focus();
    });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      if (previouslyFocused) {
        try {
          previouslyFocused.focus();
        } catch {
          triggerRef.current?.focus();
        }
      } else {
        triggerRef.current?.focus();
      }
    };
  }, [open]);

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
                className={({ isActive }) =>
                  `flex min-h-[56px] flex-col items-center justify-center gap-1.5 py-3 text-xs ${
                    isActive ? "text-emerald-700" : "text-textSecondary"
                  }`
                }
              >
                <Icon className="h-5 w-5 text-emerald-600" />
                {item.label}
              </NavLink>
            );
          })}
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen(true)}
            className={`flex min-h-[56px] flex-col items-center justify-center gap-1.5 py-3 text-xs ${
              open ? "text-emerald-700" : "text-textSecondary"
            }`}
            aria-label="Buka menu lainnya"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={sheetId}
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
            ref={sheetRef}
            id={sheetId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={sheetTitleId}
            className="safe-bottom absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-auto rounded-t-3xl bg-white p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3
                id={sheetTitleId}
                className="text-sm font-semibold text-textPrimary"
              >
                Menu Lengkap
              </h3>
              <button
                type="button"
                className="text-xs text-textSecondary"
                onClick={() => setOpen(false)}
                aria-label="Tutup menu lengkap"
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
