export type HeirRelation =
  | "husband"
  | "wife"
  | "son"
  | "daughter"
  | "father"
  | "mother"
  | "grandfather"
  | "grandmother"
  | "brother"
  | "sister";

export type HeirInput = {
  relation: HeirRelation;
  count: number;
};

export type HeirResult = {
  relation: HeirRelation;
  label: string;
  count: number;
  share: number;
  shareLabel: string;
  amount: number;
  perPerson: number;
  notes?: string;
};

export type WarisResult = {
  distributable: number;
  totalWealth: number;
  debts: number;
  funeralCost: number;
  wasiat: number;
  results: HeirResult[];
  totalShare: number;
  remainder: number;
  notes: string[];
};

type TempResult = HeirResult & {
  fixed: boolean;
  raddEligible: boolean;
};

const LABELS: Record<HeirRelation, string> = {
  husband: "Suami",
  wife: "Istri",
  son: "Anak Laki-laki",
  daughter: "Anak Perempuan",
  father: "Ayah",
  mother: "Ibu",
  grandfather: "Kakek",
  grandmother: "Nenek",
  brother: "Saudara Laki-laki",
  sister: "Saudara Perempuan",
};

const toFraction = (value: number) => {
  const rounded = Math.round(value * 10000) / 10000;
  if (rounded === 0) return "0";
  const denominators = [2, 3, 4, 6, 8, 12, 24];
  for (const d of denominators) {
    const n = Math.round(rounded * d);
    if (Math.abs(n / d - rounded) < 1e-4) {
      return `${n}/${d}`;
    }
  }
  return rounded.toFixed(4);
};

const normalizeHeirs = (heirs: HeirInput[]) => {
  const map = new Map<HeirRelation, number>();
  heirs.forEach((heir) => {
    const count = Number.isFinite(heir.count) ? heir.count : 0;
    if (count <= 0) return;
    map.set(heir.relation, (map.get(heir.relation) ?? 0) + count);
  });
  return map;
};

export const calculateWaris = (
  totalWealth: number,
  debts: number,
  funeralCost: number,
  wasiat: number,
  heirs: HeirInput[],
): WarisResult => {
  const notes: string[] = [];
  const distributable = Math.max(0, totalWealth - debts - funeralCost - wasiat);

  const counts = normalizeHeirs(heirs);
  const husband = counts.get("husband") ?? 0;
  const wife = counts.get("wife") ?? 0;
  const sons = counts.get("son") ?? 0;
  const daughters = counts.get("daughter") ?? 0;
  const father = counts.get("father") ?? 0;
  const mother = counts.get("mother") ?? 0;
  const grandfather = counts.get("grandfather") ?? 0;
  const grandmother = counts.get("grandmother") ?? 0;
  const brothers = counts.get("brother") ?? 0;
  const sisters = counts.get("sister") ?? 0;

  const hasChildren = sons + daughters > 0;
  const hasSons = sons > 0;
  const hasMaleAscendant = father > 0 || grandfather > 0;
  const siblingsTotal = brothers + sisters;

  if (father > 0 && grandfather > 0) {
    notes.push("Kakek terhalang oleh ayah.");
  }
  if (mother > 0 && grandmother > 0) {
    notes.push("Nenek terhalang oleh ibu.");
  }
  if ((hasChildren || hasMaleAscendant) && siblingsTotal > 0) {
    notes.push("Saudara kandung terhalang oleh anak atau ayah/kakek.");
  }

  const results: TempResult[] = [];

  const addResult = (
    relation: HeirRelation,
    count: number,
    share: number,
    shareLabel: string,
    notesText: string | undefined,
    fixed: boolean,
    raddEligible: boolean,
  ) => {
    const amount = distributable * share;
    results.push({
      relation,
      label: LABELS[relation],
      count,
      share,
      shareLabel,
      amount,
      perPerson: count ? amount / count : 0,
      notes: notesText,
      fixed,
      raddEligible,
    });
  };

  const addFixed = (
    relation: HeirRelation,
    count: number,
    share: number,
    shareLabel: string,
    notesText?: string,
    isSpouse = false,
  ) => {
    addResult(relation, count, share, shareLabel, notesText, true, !isSpouse);
  };

  const addResiduary = (
    relation: HeirRelation,
    count: number,
    share: number,
    shareLabel: string,
    notesText?: string,
  ) => {
    addResult(relation, count, share, shareLabel, notesText, false, false);
  };

  const mergeResiduary = (
    relation: HeirRelation,
    share: number,
    shareLabel: string,
    notesText?: string,
  ) => {
    const index = results.findIndex((item) => item.relation === relation);
    if (index === -1) {
      addResiduary(
        relation,
        counts.get(relation) ?? 0,
        share,
        shareLabel,
        notesText,
      );
      return;
    }

    const item = results[index];
    item.share += share;
    item.shareLabel = `${item.shareLabel} + ${shareLabel}`;
    item.amount = distributable * item.share;
    item.perPerson = item.count ? item.amount / item.count : 0;
    item.notes = item.notes
      ? `${item.notes}; ${notesText ?? ""}`.trim()
      : notesText;
    item.fixed = false;
    item.raddEligible = false;
  };

  let fixedTotal = 0;

  if (husband > 0) {
    const share = hasChildren ? 1 / 4 : 1 / 2;
    addFixed("husband", husband, share, toFraction(share), undefined, true);
    fixedTotal += share;
  }

  if (wife > 0) {
    const share = hasChildren ? 1 / 8 : 1 / 4;
    addFixed(
      "wife",
      wife,
      share,
      toFraction(share),
      "Total untuk seluruh istri",
      true,
    );
    fixedTotal += share;
  }

  if (mother > 0) {
    const share = hasChildren || siblingsTotal >= 2 ? 1 / 6 : 1 / 3;
    addFixed("mother", mother, share, toFraction(share));
    fixedTotal += share;
  }

  if (grandmother > 0 && mother === 0) {
    const share = 1 / 6;
    addFixed(
      "grandmother",
      grandmother,
      share,
      toFraction(share),
      "Total untuk seluruh nenek",
    );
    fixedTotal += share;
  }

  if (father > 0 && hasChildren) {
    const share = 1 / 6;
    addFixed("father", father, share, toFraction(share));
    fixedTotal += share;
  } else if (grandfather > 0 && father === 0 && hasChildren) {
    const share = 1 / 6;
    addFixed("grandfather", grandfather, share, toFraction(share));
    fixedTotal += share;
  }

  if (!hasSons && daughters > 0) {
    const daughtersShare = daughters === 1 ? 1 / 2 : 2 / 3;
    addFixed(
      "daughter",
      daughters,
      daughtersShare,
      toFraction(daughtersShare),
      daughters === 1
        ? "Anak perempuan tunggal"
        : "Anak perempuan lebih dari satu",
    );
    fixedTotal += daughtersShare;
  }

  if (!hasChildren && !hasMaleAscendant && brothers === 0 && sisters > 0) {
    const sistersShare = sisters === 1 ? 1 / 2 : 2 / 3;
    addFixed(
      "sister",
      sisters,
      sistersShare,
      toFraction(sistersShare),
      sisters === 1 ? "Saudari tunggal" : "Saudari lebih dari satu",
    );
    fixedTotal += sistersShare;
  }

  let totalShare = fixedTotal;

  if (fixedTotal > 1) {
    const factor = 1 / fixedTotal;
    totalShare = 1;
    notes.push(
      "Terjadi 'awl' karena total bagian melebihi 1. Semua bagian diproporsikan.",
    );
    results.forEach((item) => {
      item.share *= factor;
      item.shareLabel = `${item.shareLabel} (proporsi)`;
      item.amount = distributable * item.share;
      item.perPerson = item.count ? item.amount / item.count : 0;
    });
  }

  let remainder = Math.max(0, 1 - totalShare);
  let residuaryAssigned = false;

  if (remainder > 0 && hasSons) {
    const totalUnits = sons * 2 + daughters;
    if (totalUnits > 0) {
      const perUnit = (distributable * remainder) / totalUnits;
      if (sons > 0) {
        addResiduary(
          "son",
          sons,
          remainder * ((sons * 2) / totalUnits),
          "Sisa (2:1)",
          "Asabah",
        );
        const last = results[results.length - 1];
        last.amount = perUnit * sons * 2;
        last.perPerson = perUnit * 2;
      }
      if (daughters > 0) {
        addResiduary(
          "daughter",
          daughters,
          remainder * (daughters / totalUnits),
          "Sisa (2:1)",
          "Asabah bersama anak laki-laki",
        );
        const last = results[results.length - 1];
        last.amount = perUnit * daughters;
        last.perPerson = perUnit;
      }
      totalShare += remainder;
      remainder = 0;
      residuaryAssigned = true;
    }
  }

  if (remainder > 0 && !hasSons && father > 0) {
    mergeResiduary("father", remainder, "Sisa", "Asabah");
    totalShare += remainder;
    remainder = 0;
    residuaryAssigned = true;
  } else if (remainder > 0 && !hasSons && father === 0 && grandfather > 0) {
    mergeResiduary("grandfather", remainder, "Sisa", "Asabah");
    totalShare += remainder;
    remainder = 0;
    residuaryAssigned = true;
  }

  if (remainder > 0 && !hasChildren && !hasMaleAscendant && brothers > 0) {
    const totalUnits = brothers * 2 + sisters;
    if (totalUnits > 0) {
      const perUnit = (distributable * remainder) / totalUnits;
      addResiduary(
        "brother",
        brothers,
        remainder * ((brothers * 2) / totalUnits),
        "Sisa (2:1)",
        "Asabah",
      );
      const brotherItem = results[results.length - 1];
      brotherItem.amount = perUnit * brothers * 2;
      brotherItem.perPerson = perUnit * 2;

      if (sisters > 0) {
        addResiduary(
          "sister",
          sisters,
          remainder * (sisters / totalUnits),
          "Sisa (2:1)",
          "Asabah bersama saudara laki-laki",
        );
        const sisterItem = results[results.length - 1];
        sisterItem.amount = perUnit * sisters;
        sisterItem.perPerson = perUnit;
      }

      totalShare += remainder;
      remainder = 0;
      residuaryAssigned = true;
    }
  }

  if (remainder > 0 && !residuaryAssigned) {
    const raddCandidates = results.filter(
      (item) => item.raddEligible && item.share > 0,
    );
    const raddTotal = raddCandidates.reduce((sum, item) => sum + item.share, 0);
    if (raddTotal > 0) {
      raddCandidates.forEach((item) => {
        const extraShare = remainder * (item.share / raddTotal);
        item.share += extraShare;
        item.shareLabel = `${item.shareLabel} + Radd`;
        item.amount = distributable * item.share;
        item.perPerson = item.count ? item.amount / item.count : 0;
      });
      totalShare += remainder;
      remainder = 0;
      notes.push("Sisa harta dikembalikan (radd) ke ahli waris non-pasangan.");
    }
  }

  if (results.length === 0) {
    notes.push("Belum ada ahli waris yang valid.");
  }

  if (remainder > 0) {
    notes.push(
      "Masih ada sisa harta yang belum terdistribusi. Kasus mungkin memerlukan ahli waris lain.",
    );
  }

  notes.push(
    "Kalkulator ini menyederhanakan sebagian aturan faraidh. Pastikan verifikasi dengan ahli ketika kasus kompleks.",
  );

  return {
    distributable,
    totalWealth,
    debts,
    funeralCost,
    wasiat,
    results,
    totalShare,
    remainder,
    notes,
  };
};
