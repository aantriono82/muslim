export type LocationItem = {
  id: string;
  lokasi: string;
};

export type SholatScheduleEntry = {
  tanggal: string;
  imsak: string;
  subuh: string;
  terbit: string;
  dhuha: string;
  dzuhur: string;
  ashar: string;
  maghrib: string;
  isya: string;
};

export type SholatScheduleData = {
  id: string;
  kabko: string;
  prov: string;
  jadwal: Record<string, SholatScheduleEntry>;
};

export type CalendarInfo = {
  today: string;
  day: number;
  dayName: string;
  month: number;
  monthName: string;
  year: number;
};

export type CalendarData = {
  method: string;
  adjustment: number;
  ce: CalendarInfo;
  hijr: CalendarInfo;
};

export type SurahItem = {
  number: number;
  name: string;
  name_latin: string;
  number_of_ayahs: number;
  translation: string;
  revelation: string;
  description?: string;
  audio_url?: string;
};

export type AyahItem = {
  id: number;
  surah_number: number;
  ayah_number: number;
  arab: string;
  translation: string;
  audio_url?: string | null;
  image_url?: string | null;
  tafsir?: {
    kemenag?: {
      short?: string | null;
      long?: string | null;
    };
  };
  meta?: {
    juz?: number | null;
    page?: number | null;
    manzil?: number | null;
    ruku?: number | null;
    hizb_quarter?: number | null;
  };
};

export type SurahDetail = {
  number: number;
  name: string;
  name_latin: string;
  number_of_ayahs: number;
  translation: string;
  revelation: string;
  description?: string;
  audio_url?: string;
  ayahs: AyahItem[];
};

export type SearchHit = {
  id: number;
  surah_number: number;
  ayah_number: number;
  arab: string;
  translation: string;
  audio_url?: string | null;
  meta?: AyahItem["meta"];
  surah?: SurahItem;
};

export type HadisMeta = {
  name: string;
  desc: string;
  lang: string;
  ver: string;
  last_update: string;
  source: string;
};

export type HadisText = {
  ar: string;
  id: string;
};

export type HadisEntry = {
  id: number;
  text: HadisText;
  grade?: string | null;
  takhrij?: string | null;
  hikmah?: string | null;
};

export type HadisDetail = {
  id: number;
  text: HadisText;
  grade?: string | null;
  takhrij?: string | null;
  hikmah?: string | null;
  prev?: number | null;
  next?: number | null;
};

export type HadisPaging = {
  current: number;
  per_page: number;
  total_data: number;
  total_pages: number;
  has_prev: boolean;
  has_next: boolean;
  next_page?: number | null;
  prev_page?: number | null;
  first_page?: number | null;
  last_page?: number | null;
};

export type HadisExploreData = {
  paging: HadisPaging;
  hadis: HadisEntry[];
};

export type HadisSearchHit = {
  id: number;
  text: string;
  focus: string[];
};

export type HadisSearchData = {
  keyword: string;
  paging: HadisPaging;
  hadis: HadisSearchHit[];
};
