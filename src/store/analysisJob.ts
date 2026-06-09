import type { BedRow } from "@/types";

export type PackRequest = {
  jobId: number;
  text: string;
};

export type PackResponse = {
  jobId: number;
  packed: PackedCache;
};

export type PackedCache = {
  ids: Float64Array;
  p1: Float64Array;
  p2: Float64Array;
  sign: Uint8Array;
  chrIdx: Uint16Array;
  chrDict: string[];
};

export const packParsed = (rows: BedRow[]): PackedCache => {
  const n = rows.length;
  const ids = new Float64Array(n);
  const p1 = new Float64Array(n);
  const p2 = new Float64Array(n);
  const sign = new Uint8Array(n);
  const chrIdx = new Uint16Array(n);
  const chrDict: string[] = [];
  const chrLookup = new Map<string, number>();

  for (let i = 0; i < n; i++) {
    const r = rows[i];
    ids[i] = r.id;
    p1[i] = r.p1;
    p2[i] = r.p2;
    sign[i] = r.sign === "-" ? 1 : 0;
    let ci = chrLookup.get(r.chromosome);
    if (ci === undefined) {
      ci = chrDict.length;
      chrDict.push(r.chromosome);
      chrLookup.set(r.chromosome, ci);
    }
    chrIdx[i] = ci;
  }

  return { ids, p1, p2, sign, chrIdx, chrDict };
};

export const filterPacked = (cache: PackedCache, ids: Set<number>): BedRow[] => {
  const out: BedRow[] = [];
  const n = cache.ids.length;
  for (let i = 0; i < n; i++) {
    const id = cache.ids[i];
    if (!ids.has(id)) continue;

    out.push({
      id,
      chromosome: cache.chrDict[cache.chrIdx[i]],
      p1: cache.p1[i],
      p2: cache.p2[i],
      sign: cache.sign[i] === 1 ? "-" : "+",
    });
  }

  return out;
};

export const transferables = (packed: PackedCache): Transferable[] => [
  packed.ids.buffer,
  packed.p1.buffer,
  packed.p2.buffer,
  packed.sign.buffer,
  packed.chrIdx.buffer,
];
