const arabicDigits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

export const toArabicNumber = (value: number | string) =>
  String(value).replace(/\d/g, (digit) => arabicDigits[Number(digit)]);
