import { useEffect, useState } from "react";
import Container from "../components/Container";
import SectionHeader from "../components/SectionHeader";
import { Card, ErrorState, LoadingState } from "../components/State";
import { fetchJson } from "../lib/api";
import type { CalendarData } from "../lib/types";

const methods = [
  { value: "standar", label: "Standar" },
  { value: "islamic-umalqura", label: "Umm Al-Qura" },
  { value: "islamic-civil", label: "Islamic Civil" },
];

const KalenderPage = () => {
  const [today, setToday] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ceDate, setCeDate] = useState("");
  const [hijrDate, setHijrDate] = useState("");
  const [method, setMethod] = useState("standar");
  const [adjustment, setAdjustment] = useState("0");
  const [result, setResult] = useState<CalendarData | null>(null);
  const [convertLoading, setConvertLoading] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<CalendarData>("/cal/today")
      .then((res) => setToday(res.data ?? null))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const buildQuery = () => {
    const params = new URLSearchParams();
    if (method) params.set("method", method);
    if (adjustment && adjustment !== "0") params.set("adj", adjustment);
    params.set("tz", "Asia/Jakarta");
    return params.toString();
  };

  const handleConvert = async (type: "ce" | "hijr") => {
    setConvertLoading(true);
    setConvertError(null);
    try {
      const date = type === "ce" ? ceDate : hijrDate;
      if (!date) {
        setConvertError("Tanggal wajib diisi.");
        return;
      }
      const query = buildQuery();
      const path = type === "ce" ? `/cal/hijr/${date}` : `/cal/ce/${date}`;
      const res = await fetchJson<CalendarData>(query ? `${path}?${query}` : path);
      setResult(res.data ?? null);
    } catch (err) {
      setConvertError((err as Error).message);
    } finally {
      setConvertLoading(false);
    }
  };

  return (
    <div className="py-10">
      <Container>
        <SectionHeader
          title="Kalender Hijriah"
          subtitle="Konversi tanggal CE ↔ Hijriah dengan metode yang sesuai."
        />

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">Tanggal Hari Ini</h3>
            {loading ? <LoadingState message="Mengambil tanggal hari ini..." /> : null}
            {error ? <ErrorState message={error} /> : null}
            {today ? (
              <div className="mt-4 space-y-2 text-sm text-textSecondary">
                <p>
                  <span className="font-semibold text-textPrimary">CE:</span> {today.ce.today}
                </p>
                <p>
                  <span className="font-semibold text-textPrimary">Hijriah:</span> {today.hijr.today}
                </p>
                <p className="text-xs">Metode: {today.method}</p>
              </div>
            ) : null}
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">Pengaturan Konversi</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-textSecondary">
                Metode
                <select
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-emerald-100 px-3 py-2 text-sm"
                >
                  {methods.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-textSecondary">
                Penyesuaian (hari)
                <input
                  value={adjustment}
                  onChange={(event) => setAdjustment(event.target.value)}
                  type="number"
                  className="mt-1 w-full rounded-lg border border-emerald-100 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs text-textSecondary">CE → Hijriah</label>
                <input
                  value={ceDate}
                  onChange={(event) => setCeDate(event.target.value)}
                  type="date"
                  className="w-full rounded-lg border border-emerald-100 px-3 py-2 text-sm"
                />
                <button
                  onClick={() => handleConvert("ce")}
                  className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
                  type="button"
                >
                  Konversi
                </button>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-textSecondary">Hijriah → CE</label>
                <input
                  value={hijrDate}
                  onChange={(event) => setHijrDate(event.target.value)}
                  placeholder="YYYY-MM-DD"
                  className="w-full rounded-lg border border-emerald-100 px-3 py-2 text-sm"
                />
                <button
                  onClick={() => handleConvert("hijr")}
                  className="w-full rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700"
                  type="button"
                >
                  Konversi
                </button>
              </div>
            </div>

            {convertLoading ? <LoadingState message="Mengonversi tanggal..." /> : null}
            {convertError ? <ErrorState message={convertError} /> : null}
            {result ? (
              <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm">
                <p className="font-semibold text-textPrimary">Hasil</p>
                <p className="text-textSecondary">CE: {result.ce.today}</p>
                <p className="text-textSecondary">Hijriah: {result.hijr.today}</p>
                <p className="mt-1 text-xs text-textSecondary">Metode: {result.method}</p>
              </div>
            ) : null}
          </Card>
        </div>
      </Container>
    </div>
  );
};

export default KalenderPage;
