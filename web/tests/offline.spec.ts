import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Route,
} from "@playwright/test";

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
];

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
    next: null,
  },
};

const doaCategories = [{ id: "pagi-petang", title: "Pagi & Petang", total: 2 }];

const doaByCategory = {
  "pagi-petang": [
    {
      id: 101,
      title: "Doa Bangun Tidur",
      arabic: "ٱلْحَمْدُ لِلَّهِ ٱلَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا",
      translation:
        "Segala puji bagi Allah yang menghidupkan kami setelah mematikan kami.",
      transliteration: "Alhamdu lillahil ladzi ahyana ba'da ma amatana.",
      tags: ["pagi", "tidur"],
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
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ status: 200, data }),
  });
};

const setupApiMocks = async (page: Page) => {
  await page.route("**/api/muslim/**", async (route, request) => {
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/muslim", "");
    if (path.startsWith("/quran/asbab")) {
      await respondMuslim(route, []);
      return;
    }
    if (path.startsWith("/quran/ayah/specific")) {
      await respondMuslim(route, null);
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
    if (path.startsWith("/api/quran/2")) {
      await respondApi(route, surahDetail2, {
        page: 1,
        limit: 20,
        total: surahDetail2.ayahs.length,
      });
      return;
    }
    if (path.startsWith("/api/quran/search")) {
      await respondApi(route, []);
      return;
    }

    if (path === "/api/hadis/enc") {
      await respondApi(route, hadisMeta);
      return;
    }
    if (path.startsWith("/api/hadis/enc/explore")) {
      await respondApi(route, { paging: hadisPaging, hadis: hadisEntries });
      return;
    }
    if (path.startsWith("/api/hadis/enc/show/")) {
      const id = Number(path.split("/").pop());
      await respondApi(route, hadisDetailMap[id as 1 | 2] ?? null);
      return;
    }
    if (path.startsWith("/api/hadis/enc/cari")) {
      await respondApi(route, { paging: hadisPaging, hadis: [] });
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
      await respondApi(route, doaByCategory["pagi-petang"]);
      return;
    }
    if (path.startsWith("/api/doa/harian/cari")) {
      await respondApi(route, []);
      return;
    }
    if (path.startsWith("/api/doa/harian/random")) {
      await respondApi(route, doaByCategory["pagi-petang"][0]);
      return;
    }
    if (path.startsWith("/api/doa/harian/")) {
      const id = path.split("/").pop() ?? "";
      const hit =
        doaByCategory["pagi-petang"].find((item) => String(item.id) === id) ??
        null;
      await respondApi(route, hit);
      return;
    }

    if (path.startsWith("/api/sholat/kabkota/cari/")) {
      await respondApi(route, [{ id: "1209", lokasi: "Bandung" }]);
      return;
    }
    if (path.startsWith("/api/sholat/jadwal/")) {
      await respondApi(route, sholatSchedule);
      return;
    }
    if (path === "/api/tools/geocode") {
      await respondApi(route, [
        {
          display_name: "Bandung, Jawa Barat, Indonesia",
          lat: "-6.921846",
          lon: "107.607083",
        },
      ]);
      return;
    }

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

const expectNoErrorState = async (page: Page) => {
  await expect(page.getByText("Terjadi kendala")).toHaveCount(0);
};

const skipIfNotProject = (project: "desktop" | "tablet" | "mobile") => {
  test.skip(
    test.info().project.name !== project,
    `Run once on ${project} only`,
  );
};

const openCompactMoreMenu = async (page: Page) => {
  await page.getByRole("button", { name: "Buka menu lainnya" }).click();
  await page.getByRole("heading", { name: "Menu Lengkap" }).waitFor();
};

const goToCompactMoreMenu = async (page: Page, label: string) => {
  await openCompactMoreMenu(page);
  await page.getByRole("link", { name: label }).click();
};

const runDesktopOfflineFlow = async (page: Page, context: BrowserContext) => {
  await page.goto("/quran");
  await page.getByRole("button", { name: "Surah" }).click();
  await page.getByText("Al-Baqarah").first().waitFor();

  await page.goto("/quran/2");
  await page.getByText("Detail Ayat").first().waitFor();

  await page.goto("/doa");
  await page.getByText("Pagi & Petang").first().waitFor();

  await page.goto("/hadis");
  await page.getByText("Hadis #1").first().waitFor();

  await page.goto("/sholat");
  await page.getByText("Lokasi terpilih").first().waitFor();
  await expectNoErrorState(page);

  await context.setOffline(true);

  await page.getByRole("link", { name: "Quran" }).click();
  await page.getByRole("button", { name: "Surah" }).click();
  await page.getByText("Al-Baqarah").first().waitFor();
  await page
    .getByText("Mode offline: menampilkan data terakhir yang tersimpan.")
    .first()
    .waitFor();
  await expectNoErrorState(page);

  await page.getByRole("link", { name: "Hadis" }).click();
  await page.getByText("Hadis #1").first().waitFor();
  await expectNoErrorState(page);

  await page.getByRole("link", { name: "Doa" }).click();
  await page.getByText("Pagi & Petang").first().waitFor();
  await expectNoErrorState(page);

  await page.getByRole("link", { name: "Sholat" }).click();
  await page.getByText("Lokasi terpilih").first().waitFor();
  const hasOfflineQiblaNotice = await page
    .getByText(
      "Mode offline: arah kiblat butuh koneksi atau masukkan koordinat manual.",
    )
    .first()
    .isVisible()
    .catch(() => false);
  if (!hasOfflineQiblaNotice) {
    await page.getByText("Arah Kiblat:").first().waitFor();
  }
  await expectNoErrorState(page);
};

const runCompactNavOfflineFlow = async (
  page: Page,
  context: BrowserContext,
) => {
  await page.goto("/quran");
  await page.getByRole("button", { name: "Surah" }).click();
  await page.getByText("Al-Baqarah").first().waitFor();

  await goToCompactMoreMenu(page, "Hadis");
  await page.getByText("Hadis #1").first().waitFor();

  await goToCompactMoreMenu(page, "Doa");
  await page.getByText("Pagi & Petang").first().waitFor();

  await page.getByRole("link", { name: "Shalat" }).click();
  await page.getByText("Lokasi terpilih").first().waitFor();
  await expectNoErrorState(page);

  await context.setOffline(true);

  await page.getByRole("link", { name: "Qur'an" }).click();
  await page.getByRole("button", { name: "Surah" }).click();
  await page.getByText("Al-Baqarah").first().waitFor();
  await page
    .getByText("Mode offline: menampilkan data terakhir yang tersimpan.")
    .first()
    .waitFor();
  await expectNoErrorState(page);

  await goToCompactMoreMenu(page, "Hadis");
  await page.getByText("Hadis #1").first().waitFor();
  await expectNoErrorState(page);

  await goToCompactMoreMenu(page, "Doa");
  await page.getByText("Pagi & Petang").first().waitFor();
  await expectNoErrorState(page);

  await page.getByRole("link", { name: "Shalat" }).click();
  await page.getByText("Lokasi terpilih").first().waitFor();
  await expectNoErrorState(page);
};

test.beforeEach(async ({ page }) => {
  await freezeDate(page);
  await seedStorage(page);
  await setupApiMocks(page);
});

test.describe("Offline Resilience", () => {
  test("Desktop | Core pages remain usable after warm-up", async ({
    page,
    context,
  }) => {
    skipIfNotProject("desktop");
    await runDesktopOfflineFlow(page, context);
  });

  test("Mobile | Compact nav remains usable after warm-up", async ({
    page,
    context,
  }) => {
    skipIfNotProject("mobile");
    await runCompactNavOfflineFlow(page, context);
  });

  test("Tablet | Compact nav remains usable after warm-up", async ({
    page,
    context,
  }) => {
    skipIfNotProject("tablet");
    await runCompactNavOfflineFlow(page, context);
  });
});
