import { describe, expect, it } from "vitest";
import { normalizeIndianMobile, numberToIndianWords, revisionNumber, whatsappLink } from "@/lib/quotations";
import { amountInWords, numberToWordsIndian } from "@/lib/billing";

describe("numberToIndianWords (quotations)", () => {
  it("lakh / thousand / paise", () => {
    expect(numberToIndianWords(1234567.5)).toBe("Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Fifty Paise Only");
    expect(numberToIndianWords(362496)).toBe("Rupees Three Lakh Sixty Two Thousand Four Hundred Ninety Six Only");
  });
  it("crore, zero, rounding of paise", () => {
    expect(numberToIndianWords(10_000_000)).toBe("Rupees One Crore Only");
    expect(numberToIndianWords(1_234_567_890)).toBe("Rupees One Hundred Twenty Three Crore Forty Five Lakh Sixty Seven Thousand Eight Hundred Ninety Only");
    expect(numberToIndianWords(0)).toBe("Rupees Zero Only");
    expect(numberToIndianWords(0.999)).toBe("Rupees One Only");
    expect(numberToIndianWords(1.15)).toBe("Rupees One and Fifteen Paise Only");
    expect(numberToIndianWords(-5)).toBe("Minus Rupees Five Only");
    expect(numberToIndianWords(NaN)).toBe("");
  });
  it("non-currency mode", () => {
    expect(numberToIndianWords(12.5, { currency: false })).toBe("Twelve Point Fifty");
  });
});

describe("numberToWordsIndian / amountInWords (billing)", () => {
  it("integer words", () => {
    expect(numberToWordsIndian(0)).toBe("Zero");
    expect(numberToWordsIndian(100000)).toBe("One Lakh");
    expect(numberToWordsIndian(123456789)).toBe("Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine");
    expect(numberToWordsIndian(1001)).toBe("One Thousand One");
    expect(numberToWordsIndian(-5)).toBe("Minus Five");
  });
  it("amount with paise", () => {
    expect(amountInWords(123456.78)).toBe("Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Seventy Eight Paise Only");
    expect(amountInWords(262496)).toBe("Rupees Two Lakh Sixty Two Thousand Four Hundred Ninety Six Only");
    expect(amountInWords(0.5)).toBe("Rupees Zero and Fifty Paise Only");
    expect(amountInWords(1.005)).toBe("Rupees One and One Paise Only");
  });
  it("both implementations agree on rupee amounts", () => {
    for (const n of [1, 19, 20, 99, 101, 999, 1000, 99999, 100000, 9999999, 10000000, 987654321]) {
      expect(numberToIndianWords(n)).toBe(amountInWords(n));
    }
  });
});

describe("revisionNumber", () => {
  it("appends / replaces -Rn (QT-12)", () => {
    expect(revisionNumber("LBE/Q/2026-27/0019", 1)).toBe("LBE/Q/2026-27/0019-R1");
    expect(revisionNumber("LBE/Q/2026-27/0019-R1", 2)).toBe("LBE/Q/2026-27/0019-R2");
  });
});

describe("whatsappLink", () => {
  it("normalises Indian mobiles", () => {
    expect(whatsappLink("+91 98765 43210", "Hi there")).toBe("https://wa.me/919876543210?text=Hi%20there");
    expect(whatsappLink("09876543210", "a&b")).toBe("https://wa.me/919876543210?text=a%26b");
    expect(normalizeIndianMobile("98765-43210 / 044 2345678")).toBe("919876543210");
    expect(normalizeIndianMobile("0091 98765 43210")).toBe("919876543210");
  });
  it("returns null for unusable numbers", () => {
    expect(whatsappLink("12345", "x")).toBeNull();
    expect(whatsappLink(null, "x")).toBeNull();
    expect(whatsappLink("", "x")).toBeNull();
  });
});
