import { describe, expect, it } from "vitest";
import { calculateWaris } from "./waris";

const getAmount = (result: ReturnType<typeof calculateWaris>, relation: string) =>
  result.results.find((item) => item.relation === relation)?.amount ?? 0;

const getNote = (result: ReturnType<typeof calculateWaris>, keyword: string) =>
  result.notes.some((note) => note.toLowerCase().includes(keyword));

describe("calculateWaris", () => {
  it("membagi suami dan anak dengan rasio 2:1", () => {
    const result = calculateWaris(1000, 0, 0, [
      { relation: "husband", count: 1 },
      { relation: "son", count: 2 },
      { relation: "daughter", count: 1 },
    ]);

    expect(getAmount(result, "husband")).toBeCloseTo(250, 2);
    expect(getAmount(result, "son")).toBeCloseTo(600, 2);
    expect(getAmount(result, "daughter")).toBeCloseTo(150, 2);
  });

  it("menerapkan radd ke ibu dan anak perempuan ketika ada sisa", () => {
    const result = calculateWaris(2400, 0, 0, [
      { relation: "wife", count: 1 },
      { relation: "daughter", count: 1 },
      { relation: "mother", count: 1 },
    ]);

    expect(getAmount(result, "wife")).toBeCloseTo(300, 2);
    expect(getAmount(result, "mother")).toBeCloseTo(525, 2);
    expect(getAmount(result, "daughter")).toBeCloseTo(1575, 2);
  });

  it("membagi sisa ke saudara kandung 2:1", () => {
    const result = calculateWaris(3000, 0, 0, [
      { relation: "husband", count: 1 },
      { relation: "mother", count: 1 },
      { relation: "brother", count: 2 },
      { relation: "sister", count: 1 },
    ]);

    expect(getAmount(result, "husband")).toBeCloseTo(1500, 2);
    expect(getAmount(result, "mother")).toBeCloseTo(500, 2);
    expect(getAmount(result, "brother")).toBeCloseTo(800, 2);
    expect(getAmount(result, "sister")).toBeCloseTo(200, 2);
  });

  it("memblokir kakek jika ayah hadir", () => {
    const result = calculateWaris(1000, 0, 0, [
      { relation: "father", count: 1 },
      { relation: "grandfather", count: 1 },
    ]);

    expect(result.results.some((item) => item.relation === "grandfather")).toBe(
      false,
    );
    expect(getNote(result, "kakek terhalang")).toBe(true);
  });
});
