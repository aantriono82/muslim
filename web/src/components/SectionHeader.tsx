import type { ReactNode } from "react";

const SectionHeader = ({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h2 className="break-words text-xl font-semibold text-textPrimary sm:text-2xl">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 break-words text-sm text-textSecondary">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="w-full sm:w-auto">{action}</div> : null}
    </div>
  );
};

export default SectionHeader;
