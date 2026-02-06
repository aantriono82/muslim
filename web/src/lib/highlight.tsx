import type { ReactNode } from "react";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const highlightText = (text: string, query: string): ReactNode => {
  if (!query) return text;
  const safe = escapeRegExp(query);
  if (!safe) return text;
  const regex = new RegExp(`(${safe})`, "gi");
  const parts = text.split(regex);
  const needle = query.toLowerCase();
  return parts.map((part, index) =>
    part.toLowerCase() === needle ? (
      <mark
        key={`${part}-${index}`}
        className="rounded bg-emerald-100 px-1 text-emerald-800"
      >
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
};
