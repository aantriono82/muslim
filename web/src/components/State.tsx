import type { ReactNode } from "react";

export const LoadingState = ({ message }: { message?: string }) => (
  <div className="rounded-card border border-emerald-100 bg-white/80 p-4 text-sm text-textSecondary shadow-card sm:p-6">
    <div className="flex items-center gap-3">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      <span>{message ?? "Memuat data..."}</span>
    </div>
  </div>
);

export const ErrorState = ({
  message,
  action,
}: {
  message: string;
  action?: ReactNode;
}) => (
  <div className="rounded-card border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 sm:p-6">
    <p className="font-semibold">Terjadi kendala</p>
    <p className="mt-1">{message}</p>
    {action ? <div className="mt-4">{action}</div> : null}
  </div>
);

export const EmptyState = ({
  message,
  action,
}: {
  message: string;
  action?: ReactNode;
}) => (
  <div className="rounded-card border border-dashed border-emerald-200 bg-white/70 p-4 text-sm text-textSecondary sm:p-6">
    <p>{message}</p>
    {action ? <div className="mt-4">{action}</div> : null}
  </div>
);

export const Card = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div
    className={`rounded-card bg-white/90 p-4 shadow-card sm:p-5 ${className ?? ""}`}
  >
    {children}
  </div>
);
