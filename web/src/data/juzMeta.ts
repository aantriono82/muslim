export type JuzMeta = {
  juz: number;
  surahNumbers: number[];
  start: { surah: number; ayah: number };
  end: { surah: number; ayah: number };
};

export const juzMeta: JuzMeta[] = [
  {
    juz: 1,
    surahNumbers: [1, 2],
    start: { surah: 1, ayah: 1 },
    end: { surah: 2, ayah: 141 },
  },
  {
    juz: 2,
    surahNumbers: [2],
    start: { surah: 2, ayah: 142 },
    end: { surah: 2, ayah: 252 },
  },
  {
    juz: 3,
    surahNumbers: [2, 3],
    start: { surah: 2, ayah: 253 },
    end: { surah: 3, ayah: 92 },
  },
  {
    juz: 4,
    surahNumbers: [3, 4],
    start: { surah: 3, ayah: 93 },
    end: { surah: 4, ayah: 23 },
  },
  {
    juz: 5,
    surahNumbers: [4],
    start: { surah: 4, ayah: 24 },
    end: { surah: 4, ayah: 147 },
  },
  {
    juz: 6,
    surahNumbers: [4, 5],
    start: { surah: 4, ayah: 148 },
    end: { surah: 5, ayah: 81 },
  },
  {
    juz: 7,
    surahNumbers: [5, 6],
    start: { surah: 5, ayah: 82 },
    end: { surah: 6, ayah: 110 },
  },
  {
    juz: 8,
    surahNumbers: [6, 7],
    start: { surah: 6, ayah: 111 },
    end: { surah: 7, ayah: 87 },
  },
  {
    juz: 9,
    surahNumbers: [7, 8],
    start: { surah: 7, ayah: 88 },
    end: { surah: 8, ayah: 40 },
  },
  {
    juz: 10,
    surahNumbers: [8, 9],
    start: { surah: 8, ayah: 41 },
    end: { surah: 9, ayah: 92 },
  },
  {
    juz: 11,
    surahNumbers: [9, 10, 11],
    start: { surah: 9, ayah: 93 },
    end: { surah: 11, ayah: 5 },
  },
  {
    juz: 12,
    surahNumbers: [11, 12],
    start: { surah: 11, ayah: 6 },
    end: { surah: 12, ayah: 52 },
  },
  {
    juz: 13,
    surahNumbers: [12, 13, 14],
    start: { surah: 12, ayah: 53 },
    end: { surah: 14, ayah: 52 },
  },
  {
    juz: 14,
    surahNumbers: [15, 16],
    start: { surah: 15, ayah: 1 },
    end: { surah: 16, ayah: 128 },
  },
  {
    juz: 15,
    surahNumbers: [17, 18],
    start: { surah: 17, ayah: 1 },
    end: { surah: 18, ayah: 74 },
  },
  {
    juz: 16,
    surahNumbers: [18, 19, 20],
    start: { surah: 18, ayah: 75 },
    end: { surah: 20, ayah: 135 },
  },
  {
    juz: 17,
    surahNumbers: [21, 22],
    start: { surah: 21, ayah: 1 },
    end: { surah: 22, ayah: 78 },
  },
  {
    juz: 18,
    surahNumbers: [23, 24, 25],
    start: { surah: 23, ayah: 1 },
    end: { surah: 25, ayah: 20 },
  },
  {
    juz: 19,
    surahNumbers: [25, 26, 27],
    start: { surah: 25, ayah: 21 },
    end: { surah: 27, ayah: 55 },
  },
  {
    juz: 20,
    surahNumbers: [27, 28, 29],
    start: { surah: 27, ayah: 56 },
    end: { surah: 29, ayah: 45 },
  },
  {
    juz: 21,
    surahNumbers: [29, 30, 31, 32, 33],
    start: { surah: 29, ayah: 46 },
    end: { surah: 33, ayah: 30 },
  },
  {
    juz: 22,
    surahNumbers: [33, 34, 35, 36],
    start: { surah: 33, ayah: 31 },
    end: { surah: 36, ayah: 27 },
  },
  {
    juz: 23,
    surahNumbers: [36, 37, 38, 39],
    start: { surah: 36, ayah: 28 },
    end: { surah: 39, ayah: 31 },
  },
  {
    juz: 24,
    surahNumbers: [39, 40, 41],
    start: { surah: 39, ayah: 32 },
    end: { surah: 41, ayah: 46 },
  },
  {
    juz: 25,
    surahNumbers: [41, 42, 43, 44, 45],
    start: { surah: 41, ayah: 47 },
    end: { surah: 45, ayah: 37 },
  },
  {
    juz: 26,
    surahNumbers: [46, 47, 48, 49, 50, 51],
    start: { surah: 46, ayah: 1 },
    end: { surah: 51, ayah: 30 },
  },
  {
    juz: 27,
    surahNumbers: [51, 52, 53, 54, 55, 56, 57],
    start: { surah: 51, ayah: 31 },
    end: { surah: 57, ayah: 29 },
  },
  {
    juz: 28,
    surahNumbers: [58, 59, 60, 61, 62, 63, 64, 65, 66],
    start: { surah: 58, ayah: 1 },
    end: { surah: 66, ayah: 12 },
  },
  {
    juz: 29,
    surahNumbers: [67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77],
    start: { surah: 67, ayah: 1 },
    end: { surah: 77, ayah: 50 },
  },
  {
    juz: 30,
    surahNumbers: [78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114],
    start: { surah: 78, ayah: 1 },
    end: { surah: 114, ayah: 6 },
  },
];
