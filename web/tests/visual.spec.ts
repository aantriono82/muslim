import { test, expect, type Page, type Route } from "@playwright/test";

const FIXED_NOW = "2026-02-09T08:00:00.000Z";

const surahList = [
  {
    number: 1,
    name: "الفاتحة",
    name_latin: "Al-Fatihah",
    translation: "Pembukaan",
    revelation: "Makkiyah",
    number_of_ayahs: 7,
    audio_url: "https://example.com/audio/001.mp3",
  },
  {
    number: 2,
    name: "البقرة",
    name_latin: "Al-Baqarah",
    translation: "Sapi Betina",
    revelation: "Madaniyah",
    number_of_ayahs: 286,
    audio_url: "https://example.com/audio/002.mp3",
  },
  {
    number: 3,
    name: "آل عمران",
    name_latin: "Ali Imran",
    translation: "Keluarga Imran",
    revelation: "Madaniyah",
    number_of_ayahs: 200,
    audio_url: "https://example.com/audio/003.mp3",
  },
];

const surahDetail1 = {
  number: 1,
  name: "الفاتحة",
  name_latin: "Al-Fatihah",
  translation: "Pembukaan",
  revelation: "Makkiyah",
  number_of_ayahs: 7,
  description: "Surah pembuka Al-Qur'an.",
  audio_url: "https://example.com/audio/001.mp3",
  ayahs: [
    {
      id: 1,
      surah_number: 1,
      ayah_number: 1,
      arab: "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ",
      translation: "Dengan nama Allah Yang Maha Pengasih lagi Maha Penyayang.",
    },
    {
      id: 2,
      surah_number: 1,
      ayah_number: 2,
      arab: "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَالَمِينَ",
      translation: "Segala puji bagi Allah, Tuhan semesta alam.",
    },
  ],
};

const surahDetail2 = {
  number: 2,
  name: "البقرة",
  name_latin: "Al-Baqarah",
  translation: "Sapi Betina",
  revelation: "Madaniyah",
  number_of_ayahs: 286,
  description: "Surah terpanjang dengan beragam hukum dan kisah.",
  audio_url: "https://example.com/audio/002.mp3",
  ayahs: [
    {
      id: 3,
      surah_number: 2,
      ayah_number: 1,
      arab: "الٓمٓ",
      translation: "Alif Lam Mim.",
      tafsir: { kemenag: { short: "Huruf muqatta'ah pembuka surah." } },
    },
    {
      id: 4,
      surah_number: 2,
      ayah_number: 2,
      arab: "ذَٰلِكَ ٱلْكِتَٰبُ لَا رَيْبَ ۛ فِيهِ ۛ هُدًى لِّلْمُتَّقِينَ",
      translation:
        "Kitab (Al-Qur'an) ini tidak ada keraguan padanya; petunjuk bagi mereka yang bertakwa.",
    },
  ],
};

const ayahDetailMap: Record<string, unknown> = {
  "1:1": surahDetail1.ayahs[0],
  "1:2": surahDetail1.ayahs[1],
  "2:1": surahDetail2.ayahs[0],
  "2:2": surahDetail2.ayahs[1],
};

const muslimAsbabList = [
  {
    id: "asb-3",
    ayah: "3",
    text: "Asbabun nuzul contoh: ayat ini turun sebagai penguatan kaum beriman.",
  },
];

const muslimAyahSpecific = {
  "2:1": {
    id: "3",
    ayah: "1",
    surah: "2",
    arab: surahDetail2.ayahs[0].arab,
  },
};

const hadisMeta = {
  name: "Ensiklopedia Hadis",
  desc: "Koleksi hadis pilihan dengan terjemah Indonesia.",
  lang: "id",
  ver: "1.0.0",
  last_update: "2026-01-15",
  source: "MuslimKit",
};

const hadisEntries = [
  {
    id: 1,
    text: {
      ar: "إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ",
      id: "Sesungguhnya amal itu tergantung niatnya.",
    },
    grade: "Sahih",
  },
  {
    id: 2,
    text: {
      ar: "الدِّينُ النَّصِيحَةُ",
      id: "Agama itu nasihat.",
    },
    grade: "Hasan",
  },
  {
    id: 3,
    text: {
      ar: "الْمُسْلِمُ أَخُو الْمُسْلِمِ",
      id: "Seorang muslim adalah saudara bagi muslim lainnya.",
    },
    grade: "Sahih",
  },
];

const hadisPaging = {
  current: 1,
  per_page: 5,
  total_data: hadisEntries.length,
  total_pages: 1,
  has_prev: false,
  has_next: false,
};

const hadisDetailMap = {
  1: {
    id: 1,
    text: hadisEntries[0].text,
    grade: "Sahih",
    takhrij: "HR. Bukhari",
    hikmah: "Niat menentukan nilai ibadah.",
    prev: null,
    next: 2,
  },
  2: {
    id: 2,
    text: hadisEntries[1].text,
    grade: "Hasan",
    takhrij: "HR. Muslim",
    hikmah: "Nasihat adalah bukti kasih sayang.",
    prev: 1,
    next: 3,
  },
  3: {
    id: 3,
    text: hadisEntries[2].text,
    grade: "Sahih",
    takhrij: "HR. Bukhari",
    hikmah: "Persaudaraan memperkuat umat.",
    prev: 2,
    next: null,
  },
};

const doaCategories = [
  { id: 1, title: "Pagi & Petang", total: 8, audio_total: 5 },
  { id: 2, title: "Rumah Tangga", total: 6, audio_total: 2 },
];

const doaByCategory: Record<string, unknown[]> = {
  "1": [
    {
      id: 101,
      title: "Doa Bangun Tidur",
      arabic: "ٱلْحَمْدُ لِلَّهِ ٱلَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا",
      translation:
        "Segala puji bagi Allah yang menghidupkan kami setelah mematikan kami.",
      transliteration: "Alhamdu lillahil ladzi ahyana ba'da ma amatana.",
      tags: ["pagi", "tidur"],
      audio_url: "https://example.com/audio/doa-101.mp3",
    },
    {
      id: 102,
      title: "Doa Pagi",
      arabic: "اللَّهُمَّ بِكَ أَصْبَحْنَا",
      translation: "Ya Allah, dengan-Mu kami memasuki pagi.",
      transliteration: "Allahumma bika asbahna.",
      tags: ["pagi"],
    },
  ],
  "2": [
    {
      id: 201,
      title: "Doa untuk Keluarga",
      arabic: "رَبَّنَا هَبْ لَنَا مِنْ أَزْوَاجِنَا",
      translation: "Ya Tuhan kami, anugerahkanlah kepada kami pasangan.",
      transliteration: "Rabbana hablana min azwajina.",
      tags: ["keluarga"],
    },
  ],
};

const calendarData = {
  method: "standar",
  adjustment: 0,
  ce: {
    today: "2026-02-09",
    day: 9,
    dayName: "Senin",
    month: 2,
    monthName: "Februari",
    year: 2026,
  },
  hijr: {
    today: "20 Rajab 1447",
    day: 20,
    dayName: "Senin",
    month: 7,
    monthName: "Rajab",
    year: 1447,
  },
};

const sholatSchedule = {
  id: "1209",
  kabko: "Bandung",
  prov: "Jawa Barat",
  jadwal: {
    "2026-02-09": {
      tanggal: "09/02/2026",
      imsak: "04:30",
      subuh: "04:40",
      terbit: "05:55",
      dhuha: "06:20",
      dzuhur: "12:05",
      ashar: "15:20",
      maghrib: "18:10",
      isya: "19:20",
    },
  },
};

const respondApi = async (
  route: Route,
  data: unknown,
  pagination?: { page: number; limit: number; total: number },
) => {
  const body = JSON.stringify({
    status: true,
    message: "ok",
    data,
    ...(pagination ? { pagination } : {}),
  });
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body,
  });
};

const respondMuslim = async (route: Route, data: unknown) => {
  const body = JSON.stringify({ status: 200, data });
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body,
  });
};

const setupApiMocks = async (page: Page) => {
  await page.route("**/api/muslim/**", async (route, request) => {
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/muslim", "");

    if (path.startsWith("/quran/asbab")) {
      await respondMuslim(route, muslimAsbabList);
      return;
    }

    if (path.startsWith("/quran/ayah/specific")) {
      const surahId = url.searchParams.get("surahId") ?? "";
      const ayahId = url.searchParams.get("ayahId") ?? "";
      const key = `${surahId}:${ayahId}`;
      await respondMuslim(route, muslimAyahSpecific[key] ?? null);
      return;
    }

    await respondMuslim(route, []);
  });

  await page.route("**/api/**", async (route, request) => {
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/quran") {
      await respondApi(route, surahList);
      return;
    }

    if (path.startsWith("/api/quran/search")) {
      await respondApi(route, []);
      return;
    }

    if (path.startsWith("/api/quran/explore")) {
      await respondApi(route, []);
      return;
    }

    if (path.startsWith("/api/quran/")) {
      const parts = path.split("/").filter(Boolean);
      const surahId = parts[2];
      const ayahId = parts[3];
      if (surahId && ayahId) {
        const key = `${surahId}:${ayahId}`;
        await respondApi(route, ayahDetailMap[key] ?? null);
        return;
      }
      if (surahId) {
        const surah =
          surahId === "1"
            ? surahDetail1
            : surahId === "2"
              ? surahDetail2
              : {
                  ...surahDetail1,
                  number: Number(surahId),
                  name_latin: `Surah ${surahId}`,
                  ayahs: [],
                };
        await respondApi(route, surah, {
          page: 1,
          limit: 20,
          total: surah.ayahs.length,
        });
        return;
      }
    }

    if (path === "/api/hadis/enc") {
      await respondApi(route, hadisMeta);
      return;
    }

    if (path.startsWith("/api/hadis/enc/explore")) {
      await respondApi(route, { paging: hadisPaging, hadis: hadisEntries });
      return;
    }

    if (path.startsWith("/api/hadis/enc/cari")) {
      await respondApi(route, { paging: hadisPaging, hadis: [] });
      return;
    }

    if (path.startsWith("/api/hadis/enc/show/")) {
      const id = Number(path.split("/").pop());
      await respondApi(route, hadisDetailMap[id] ?? null);
      return;
    }

    if (path.startsWith("/api/hadis/enc/random")) {
      await respondApi(route, hadisDetailMap[1]);
      return;
    }

    if (path.startsWith("/api/hadis/enc/prev/")) {
      await respondApi(route, hadisDetailMap[1]);
      return;
    }

    if (path.startsWith("/api/hadis/enc/next/")) {
      await respondApi(route, hadisDetailMap[2]);
      return;
    }

    if (path === "/api/doa/harian") {
      await respondApi(route, doaCategories);
      return;
    }

    if (path.startsWith("/api/doa/harian/kategori/")) {
      const id = path.split("/").pop() ?? "";
      await respondApi(route, doaByCategory[id] ?? []);
      return;
    }

    if (path.startsWith("/api/doa/harian/random")) {
      await respondApi(route, doaByCategory["1"][0]);
      return;
    }

    if (path.startsWith("/api/doa/harian/cari")) {
      await respondApi(route, []);
      return;
    }

    if (path.startsWith("/api/doa/harian/")) {
      const id = path.split("/").pop() ?? "";
      const entries = Object.values(doaByCategory).flat();
      const match = entries.find((item: any) => String(item.id) === id) ?? null;
      await respondApi(route, match);
      return;
    }

    if (path === "/api/cal/today") {
      await respondApi(route, calendarData);
      return;
    }

    if (path.startsWith("/api/cal/ce/") || path.startsWith("/api/cal/hijr/")) {
      await respondApi(route, calendarData);
      return;
    }

    if (path.startsWith("/api/sholat/jadwal/")) {
      await respondApi(route, sholatSchedule);
      return;
    }

    await respondApi(route, []);
  });

  await page.route("https://api.myquran.com/**", async (route) => {
    await respondApi(route, []);
  });

  await page.route("https://equran.id/**", async (route) => {
    await respondApi(route, []);
  });
};

const freezeDate = async (page: Page) => {
  await page.addInitScript((value) => {
    const fixed = new Date(value);
    const OriginalDate = Date;
    class MockDate extends OriginalDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        if (args.length === 0) {
          return new OriginalDate(fixed);
        }
        return new OriginalDate(...args);
      }
      static now() {
        return fixed.getTime();
      }
    }
    // @ts-ignore
    window.Date = MockDate;
  }, FIXED_NOW);
};

const seedStorage = async (page: Page) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem(
      "ibadahmu:location",
      JSON.stringify({ id: "1209", lokasi: "Bandung" }),
    );
    window.localStorage.setItem(
      "ibadahmu:adzan-settings",
      JSON.stringify({ mode: "silent", consentAt: null, durationSec: 45 }),
    );
  });
};

const stabilizeUi = async (page: Page) => {
  await page.addStyleTag({
    content: `
      *,
      *::before,
      *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
      .cv-auto {
        content-visibility: visible !important;
        contain-intrinsic-size: auto !important;
      }
    `,
  });
};

const snapshot = async (page: Page, name: string) => {
  await stabilizeUi(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot(name, {
    fullPage: true,
    animations: "disabled",
    timeout: 15000,
  });
};

test.beforeEach(async ({ page }) => {
  await freezeDate(page);
  await seedStorage(page);
  await setupApiMocks(page);
});

test("home", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Platform Keislaman Terpadu").waitFor();
  await snapshot(page, "home.png");
});

test("quran-list", async ({ page }) => {
  await page.goto("/quran");
  await page.getByRole("button", { name: "Surah" }).click();
  await page.getByText("Al-Fatihah").waitFor();
  await snapshot(page, "quran-list.png");
});

test("surah-detail", async ({ page }) => {
  await page.goto("/quran/2");
  await page.getByText("Detail Ayat").first().waitFor();
  await snapshot(page, "surah-detail.png");
});

test("surah-detail-asbab-modal", async ({ page }) => {
  await page.goto("/quran/2");
  await page.getByRole("button", { name: "Asbabun Nuzul" }).first().click();
  await page.getByText("Asbabun Nuzul").first().waitFor();
  await snapshot(page, "surah-detail-asbab-modal.png");
});

test("ayah-detail", async ({ page }) => {
  await page.goto("/quran/2/1");
  await page.getByText("Tafsir Singkat").waitFor();
  await snapshot(page, "ayah-detail.png");
});

test("ayah-detail-asbab-modal", async ({ page }) => {
  await page.goto("/quran/2/1");
  await page.getByRole("button", { name: "Lihat Asbabun Nuzul" }).click();
  await page.getByText("Asbabun Nuzul").first().waitFor();
  await snapshot(page, "ayah-detail-asbab-modal.png");
});

test("murratal", async ({ page }) => {
  await page.goto("/murratal");
  await page.getByText("Murratal Quran").waitFor();
  await page.getByText("Buka Surah").first().waitFor();
  await snapshot(page, "murratal.png");
});

test("doa", async ({ page }) => {
  await page.goto("/doa");
  await page.getByText("Kategori Doa").waitFor();
  await page.getByText("Pagi & Petang").waitFor();
  await snapshot(page, "doa.png");
});

test("hadis", async ({ page }) => {
  await page.goto("/hadis");
  await page.getByText("Info Ensiklopedia").waitFor();
  await page.getByText("Hadis #1").waitFor();
  await snapshot(page, "hadis.png");
});

test("sholat", async ({ page }) => {
  await page.goto("/sholat");
  await page.getByText("Lokasi terpilih").waitFor();
  await snapshot(page, "sholat.png");
});

test("puasa", async ({ page }) => {
  await page.goto("/puasa");
  await page.getByText("Daftar Puasa").waitFor();
  await snapshot(page, "puasa.png");
});

test("matsurat", async ({ page }) => {
  await page.goto("/matsurat");
  await page.getByText("Detail Dzikir").waitFor();
  await snapshot(page, "matsurat.png");
});

test("waris", async ({ page }) => {
  await page.goto("/waris");
  await page.getByText("Hasil Pembagian").waitFor();
  await snapshot(page, "waris.png");
});

test("zakat", async ({ page }) => {
  await page.goto("/zakat");
  await page.getByText("Zakat Maal").waitFor();
  await snapshot(page, "zakat.png");
});

test("haji", async ({ page }) => {
  await page.goto("/haji");
  await page.getByText("Manasik Ringkas per Hari").waitFor();
  await snapshot(page, "haji.png");
});

test("disclaimer", async ({ page }) => {
  await page.goto("/disclaimer");
  await page.getByRole("heading", { name: "Disclaimer" }).waitFor();
  await snapshot(page, "disclaimer.png");
});

test("no-horizontal-overflow-core-routes", async ({ page }) => {
  const routes = [
    "/",
    "/sholat",
    "/quran",
    "/quran/2",
    "/quran/2/1",
    "/murratal",
    "/haji",
    "/puasa",
    "/hadis",
    "/doa",
    "/waris",
    "/zakat",
    "/matsurat",
    "/disclaimer",
  ];

  for (const route of routes) {
    await page.goto(route);
    if (route === "/quran") {
      await page.getByRole("button", { name: "Surah" }).click();
      await page.getByText("Al-Fatihah").waitFor();
    }

    const dimensions = await page.evaluate(() => {
      const viewport = window.innerWidth;
      const htmlWidth = document.documentElement.scrollWidth;
      const bodyWidth = document.body?.scrollWidth ?? 0;
      return {
        viewport,
        maxWidth: Math.max(htmlWidth, bodyWidth),
      };
    });

    expect(
      dimensions.maxWidth,
      `${route} has horizontal overflow: content ${dimensions.maxWidth}px > viewport ${dimensions.viewport}px`,
    ).toBeLessThanOrEqual(dimensions.viewport + 1);
  }
});
