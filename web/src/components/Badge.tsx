import type { ReactNode } from "react";

const Badge = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
    {children}
  </span>
);

export default Badge;
