import { CHR_PALETTE } from "@/src/constants";

export const buildPalette = (selectedChr: string, chroms: Iterable<string>): Record<string, string> => {
  const ordered = new Set<string>([selectedChr, ...chroms]);
  const palette: Record<string, string> = {};
  [...ordered].forEach((chr, i) => {
    palette[chr] = CHR_PALETTE[i % CHR_PALETTE.length];
  });
  return palette;
};
