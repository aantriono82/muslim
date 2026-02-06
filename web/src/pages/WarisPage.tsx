import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Container from "../components/Container";
import SectionHeader from "../components/SectionHeader";
import { Card, EmptyState } from "../components/State";
import {
  calculateWaris,
  type HeirInput,
  type HeirRelation,
} from "../lib/waris";

const heirOptions: Array<{ value: HeirRelation; label: string; max?: number }> =
  [
    { value: "husband", label: "Suami", max: 1 },
    { value: "wife", label: "Istri", max: 4 },
    { value: "son", label: "Anak Laki-laki" },
    { value: "daughter", label: "Anak Perempuan" },
    { value: "father", label: "Ayah", max: 1 },
    { value: "mother", label: "Ibu", max: 1 },
    { value: "grandfather", label: "Kakek", max: 1 },
    { value: "grandmother", label: "Nenek", max: 1 },
    { value: "brother", label: "Saudara Laki-laki" },
    { value: "sister", label: "Saudara Perempuan" },
  ];

const templates: Array<{
  id: string;
  label: string;
  totalWealth: string;
  debts: string;
  funeralCost: string;
  wasiat: string;
  heirs: HeirInput[];
}> = [
  {
    id: "suami-anak",
    label: "Suami + 2 Anak Laki + 1 Anak Perempuan",
    totalWealth: "250000000",
    debts: "0",
    funeralCost: "0",
    wasiat: "0",
    heirs: [
      { relation: "husband", count: 1 },
      { relation: "son", count: 2 },
      { relation: "daughter", count: 1 },
    ],
  },
  {
    id: "istri-anak-ibu",
    label: "Istri + 1 Anak Perempuan + Ibu",
    totalWealth: "180000000",
    debts: "10000000",
    funeralCost: "5000000",
    wasiat: "0",
    heirs: [
      { relation: "wife", count: 1 },
      { relation: "daughter", count: 1 },
      { relation: "mother", count: 1 },
    ],
  },
  {
    id: "istri-ortu-anak",
    label: "Istri + Ayah + Ibu + 2 Anak Perempuan",
    totalWealth: "320000000",
    debts: "20000000",
    funeralCost: "10000000",
    wasiat: "0",
    heirs: [
      { relation: "wife", count: 1 },
      { relation: "father", count: 1 },
      { relation: "mother", count: 1 },
      { relation: "daughter", count: 2 },
    ],
  },
  {
    id: "suami-ibu-saudara",
    label: "Suami + Ibu + 2 Saudara Laki + 1 Saudara Perempuan",
    totalWealth: "200000000",
    debts: "0",
    funeralCost: "5000000",
    wasiat: "0",
    heirs: [
      { relation: "husband", count: 1 },
      { relation: "mother", count: 1 },
      { relation: "brother", count: 2 },
      { relation: "sister", count: 1 },
    ],
  },
];

const palette = [
  "#2563EB",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#06B6D4",
  "#F97316",
  "#84CC16",
  "#EC4899",
  "#14B8A6",
];

const relationColors = heirOptions.reduce(
  (acc, option, index) => {
    acc[option.value] = palette[index % palette.length];
    return acc;
  },
  {} as Record<HeirRelation, string>,
);

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0);

const parseNumber = (value: string) => {
  const normalized = value.replace(/[^0-9.-]/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const polarToCartesian = (
  centerX: number,
  centerY: number,
  radius: number,
  angleDegrees: number,
) => {
  const angleInRadians = (angleDegrees * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
};

const describeArc = (start: number, end: number, radius: number) => {
  const centerX = 50;
  const centerY = 50;
  const startAngle = start * 360 - 90;
  const endAngle = end * 360 - 90;
  const startPoint = polarToCartesian(centerX, centerY, radius, startAngle);
  const endPoint = polarToCartesian(centerX, centerY, radius, endAngle);
  const largeArcFlag = end - start > 0.5 ? 1 : 0;
  return `M ${centerX} ${centerY} L ${startPoint.x} ${startPoint.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endPoint.x} ${endPoint.y} Z`;
};

const WarisPage = () => {
  const [totalWealth, setTotalWealth] = useState("0");
  const [debts, setDebts] = useState("0");
  const [funeralCost, setFuneralCost] = useState("0");
  const [wasiat, setWasiat] = useState("0");
  const [heirs, setHeirs] = useState<HeirInput[]>([
    { relation: "husband", count: 1 },
  ]);

  const result = useMemo(() => {
    return calculateWaris(
      parseNumber(totalWealth),
      parseNumber(debts),
      parseNumber(funeralCost),
      parseNumber(wasiat),
      heirs,
    );
  }, [totalWealth, debts, funeralCost, wasiat, heirs]);

  const maxAmount = Math.max(0, ...result.results.map((item) => item.amount));

  const segments = useMemo(() => {
    const totalAmount = result.results.reduce(
      (sum, item) => sum + item.amount,
      0,
    );
    let cursor = 0;
    return result.results
      .filter((item) => item.amount > 0)
      .map((item, index) => {
        const percent = totalAmount > 0 ? item.amount / totalAmount : 0;
        const start = cursor;
        cursor += percent;
        return {
          relation: item.relation,
          label: item.label,
          amount: item.amount,
          percent,
          start,
          end: cursor,
          color:
            relationColors[item.relation] ?? palette[index % palette.length],
        };
      });
  }, [result.results]);

  const separatorColor = "#FFFFFF";
  const pieRadius = 49;

  const handleAdd = () => {
    setHeirs((prev) => [...prev, { relation: "son", count: 1 }]);
  };

  const handleApplyTemplate = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setTotalWealth(template.totalWealth);
    setDebts(template.debts);
    setFuneralCost(template.funeralCost);
    setWasiat(template.wasiat);
    setHeirs(template.heirs);
  };

  return (
    <div className="py-10">
      <Container>
        <SectionHeader
          title="Kalkulator Waris"
          subtitle="Simulasi pembagian ringkas mencakup pasangan, orang tua, anak, kakek/nenek, dan saudara kandung."
        />

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">
              Data Harta
            </h3>
            <p className="mt-2 text-xs text-textSecondary">
              Catatan: kalkulator ini menerapkan aturan ringkas. Kasus lanjutan
              seperti cucu, saudara seayah/seibu, wasiat, dan hibah belum
              dimodelkan.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-textSecondary">
                Total Harta (IDR)
                <input
                  value={totalWealth}
                  onChange={(event) => setTotalWealth(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-emerald-100 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs text-textSecondary">
                Hutang (IDR)
                <input
                  value={debts}
                  onChange={(event) => setDebts(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-emerald-100 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs text-textSecondary">
                Biaya Pemakaman (IDR)
                <input
                  value={funeralCost}
                  onChange={(event) => setFuneralCost(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-emerald-100 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs text-textSecondary">
                Wasiat (IDR)
                <input
                  value={wasiat}
                  onChange={(event) => setWasiat(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-emerald-100 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-textSecondary">
              Harta bersih yang dibagi: {formatCurrency(result.distributable)}
            </div>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-textPrimary">
                Ahli Waris
              </h3>
              <span className="text-[11px] text-textSecondary">
                Template cepat
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => handleApplyTemplate(template.id)}
                  className="rounded-full border border-emerald-200 px-3 py-2 text-[11px] text-emerald-700"
                >
                  {template.label}
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              {heirs.map((heir, index) => {
                const option = heirOptions.find(
                  (item) => item.value === heir.relation,
                );
                return (
                  <div
                    key={`${heir.relation}-${index}`}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <select
                      value={heir.relation}
                      onChange={(event) => {
                        const value = event.target.value as HeirRelation;
                        setHeirs((prev) =>
                          prev.map((item, idx) =>
                            idx === index ? { ...item, relation: value } : item,
                          ),
                        );
                      }}
                      className="w-full rounded-lg border border-emerald-100 px-3 py-2 text-sm sm:w-auto sm:min-w-[180px]"
                    >
                      {heirOptions.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      value={heir.count}
                      onChange={(event) => {
                        const value =
                          Number.parseInt(event.target.value, 10) || 0;
                        setHeirs((prev) =>
                          prev.map((item, idx) =>
                            idx === index ? { ...item, count: value } : item,
                          ),
                        );
                      }}
                      className="w-full rounded-lg border border-emerald-100 px-3 py-2 text-sm sm:w-20"
                    />
                    {option?.max ? (
                      <span className="text-xs text-textSecondary">
                        Max {option.max}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() =>
                        setHeirs((prev) =>
                          prev.filter((_, idx) => idx !== index),
                        )
                      }
                      className="ml-auto rounded-full border border-emerald-200 p-2 text-textSecondary sm:ml-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={handleAdd}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white sm:w-auto"
            >
              <Plus className="h-4 w-4" /> Tambah Ahli Waris
            </button>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">
              Hasil Pembagian
            </h3>
            {result.results.length === 0 ? (
              <EmptyState message="Tambahkan ahli waris untuk melihat hasil." />
            ) : (
              <div className="mt-4 space-y-3 text-sm text-textSecondary">
                {result.results.map((item, index) => (
                  <div
                    key={`result-${index}`}
                    className="rounded-xl border border-emerald-100 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            background:
                              relationColors[item.relation] ?? "#10B981",
                          }}
                        />
                        <p className="font-semibold text-textPrimary">
                          {item.label} ({item.count})
                        </p>
                      </div>
                      <p className="text-xs text-emerald-700">
                        {item.shareLabel}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-textSecondary">
                      Total: {formatCurrency(item.amount)} · Per orang:{" "}
                      {formatCurrency(item.perPerson)}
                    </p>
                    {item.notes ? (
                      <p className="mt-1 text-[11px] text-textSecondary">
                        {item.notes}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            {result.notes.length > 0 ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                {result.notes.map((note) => (
                  <p key={note}>• {note}</p>
                ))}
              </div>
            ) : null}
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">
              Visualisasi
            </h3>
            {result.results.length === 0 ? (
              <EmptyState message="Belum ada data untuk divisualkan." />
            ) : (
              <div className="mt-4 space-y-4">
                <div className="flex flex-col items-center gap-4">
                  <div className="h-44 w-44">
                    <svg
                      viewBox="0 0 100 100"
                      className="h-full w-full"
                      aria-hidden="true"
                    >
                      {segments.length === 0 ? (
                        <circle cx="50" cy="50" r={pieRadius} fill="#E5E7EB" />
                      ) : segments.length === 1 ? (
                        <circle
                          cx="50"
                          cy="50"
                          r={pieRadius}
                          fill={segments[0].color}
                          stroke={separatorColor}
                          strokeWidth={1}
                        />
                      ) : (
                        segments.map((item, index) => (
                          <path
                            key={`pie-${index}`}
                            d={describeArc(item.start, item.end, pieRadius)}
                            fill={item.color}
                            stroke={separatorColor}
                            strokeWidth={1}
                            strokeLinejoin="round"
                          />
                        ))
                      )}
                    </svg>
                  </div>
                  <div className="w-full space-y-2 text-xs text-textSecondary">
                    {segments.map((item, index) => (
                      <div
                        key={`legend-${index}`}
                        className="flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: item.color }}
                          />
                          <span>{item.label}</span>
                        </div>
                        <span>
                          {Math.round(item.percent * 100)}% ·{" "}
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  {result.results.map((item, index) => {
                    const width =
                      maxAmount > 0
                        ? Math.round((item.amount / maxAmount) * 100)
                        : 0;
                    const barColor = relationColors[item.relation] ?? "#10B981";
                    return (
                      <div key={`bar-${index}`}>
                        <div className="flex items-center justify-between text-xs text-textSecondary">
                          <span>{item.label}</span>
                          <span>{formatCurrency(item.amount)}</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-emerald-50">
                          <div
                            className="h-2 rounded-full"
                            style={{ width: `${width}%`, background: barColor }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        </div>
      </Container>
    </div>
  );
};

export default WarisPage;
