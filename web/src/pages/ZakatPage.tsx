import { useMemo, useState } from "react";
import Container from "../components/Container";
import SectionHeader from "../components/SectionHeader";
import { Card } from "../components/State";

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

const ZakatPage = () => {
  const [maalAssets, setMaalAssets] = useState("0");
  const [maalDebts, setMaalDebts] = useState("0");
  const [goldPrice, setGoldPrice] = useState("1000000");

  const [people, setPeople] = useState("1");
  const [ricePrice, setRicePrice] = useState("15000");
  const [ricePerPerson, setRicePerPerson] = useState("2.5");

  const maal = useMemo(() => {
    const assets = parseNumber(maalAssets);
    const debts = parseNumber(maalDebts);
    const net = Math.max(0, assets - debts);
    const gold = parseNumber(goldPrice);
    const nisab = gold * 85;
    const eligible = nisab > 0 && net >= nisab;
    const zakat = eligible ? net * 0.025 : 0;
    return { assets, debts, net, nisab, eligible, zakat };
  }, [maalAssets, maalDebts, goldPrice]);

  const fitrah = useMemo(() => {
    const count = parseNumber(people);
    const price = parseNumber(ricePrice);
    const perPerson = parseNumber(ricePerPerson);
    const total = count * price * perPerson;
    return { count, price, perPerson, total };
  }, [people, ricePrice, ricePerPerson]);

  return (
    <div className="py-10">
      <Container>
        <SectionHeader
          title="Kalkulator Zakat"
          subtitle="Hitung zakat maal dan zakat fitrah dengan cepat."
        />

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">Zakat Maal</h3>
            <p className="mt-1 text-xs text-textSecondary">
              Nisab setara 85 gram emas. Masukkan harga emas per gram terbaru.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-textSecondary">
                Total Harta (IDR)
                <input
                  value={maalAssets}
                  onChange={(event) => setMaalAssets(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-emerald-100 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs text-textSecondary">
                Hutang/Kewajiban (IDR)
                <input
                  value={maalDebts}
                  onChange={(event) => setMaalDebts(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-emerald-100 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs text-textSecondary">
                Harga Emas per gram (IDR)
                <input
                  value={goldPrice}
                  onChange={(event) => setGoldPrice(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-emerald-100 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-textSecondary">
              <p>Harta bersih: {formatCurrency(maal.net)}</p>
              <p>Nisab: {formatCurrency(maal.nisab)}</p>
              <p>
                Status: {maal.eligible ? "Wajib Zakat" : "Belum mencapai nisab"}
              </p>
              <p className="mt-2 text-base font-semibold text-textPrimary">
                Zakat Maal: {formatCurrency(maal.zakat)}
              </p>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">Zakat Fitrah</h3>
            <p className="mt-1 text-xs text-textSecondary">
              Standar 2.5 kg beras per orang. Sesuaikan harga beras lokal.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-textSecondary">
                Jumlah Orang
                <input
                  value={people}
                  onChange={(event) => setPeople(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-emerald-100 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs text-textSecondary">
                Harga Beras per Kg (IDR)
                <input
                  value={ricePrice}
                  onChange={(event) => setRicePrice(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-emerald-100 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs text-textSecondary">
                Takaran per Orang (Kg)
                <input
                  value={ricePerPerson}
                  onChange={(event) => setRicePerPerson(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-emerald-100 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-textSecondary">
              <p>
                Total: {fitrah.count} orang × {fitrah.perPerson} kg × {formatCurrency(fitrah.price)}
              </p>
              <p className="mt-2 text-base font-semibold text-textPrimary">
                Zakat Fitrah: {formatCurrency(fitrah.total)}
              </p>
            </div>
          </Card>
        </div>
      </Container>
    </div>
  );
};

export default ZakatPage;
