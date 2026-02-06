import type { ReactNode } from "react";

const SectionHeader = ({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 className="text-xl font-semibold text-textPrimary sm:text-2xl">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-textSecondary">{subtitle}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
};

export default SectionHeader;
