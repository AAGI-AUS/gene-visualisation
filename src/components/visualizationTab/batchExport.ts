import { zip, type AsyncZippableFile } from "fflate";
import { useAppStore } from "@/src/store/useAppStore";
import { serializeSvg, svgToPngBlob } from "@/src/components/visualizationTab/utils";
import type { Chunk } from "@/types";
import type { ChunkEvent } from "@/src/constants";

let svgEl: SVGSVGElement | null = null;

export const registerSvgEl = (el: SVGSVGElement | null): void => {
  svgEl = el;
};

export interface VisibleChunkPair {
  queryLabel: string;
  chunks: Chunk[];
}

let visiblePairs: VisibleChunkPair[] = [];

export const registerVisibleChunks = (pairs: VisibleChunkPair[]): void => {
  visiblePairs = pairs;
};

const NOTABLE_EVENTS: ReadonlySet<ChunkEvent> = new Set<ChunkEvent>([
  "inversion",
  "translocation",
  "translocation+inversion",
]);

const CSV_HEADER = [
  "base_line",
  "base_chr",
  "query_line",
  "query_chr",
  "event",
  "base_bp1",
  "base_bp2",
  "query_bp1",
  "query_bp2",
  "event_count",
  "base_gene_span",
  "query_gene_span",
  "is_inverted",
  "is_translocated",
  "chunk_count",
].join("|");

interface MergedRow {
  baseChr: string;
  queryChr: string;
  event: ChunkEvent;
  bp1Base: number;
  bp2Base: number;
  bp1Query: number;
  bp2Query: number;
  eventCount: number;
  geneBase: number;
  geneQuery: number;
  chunkCount: number;
}

const formatRow = (baseLabel: string, queryLabel: string, m: MergedRow): string => {
  const inverted = m.event === "inversion" || m.event === "translocation+inversion";
  const translocated = m.event === "translocation" || m.event === "translocation+inversion";
  return [
    baseLabel,
    m.baseChr,
    queryLabel,
    m.queryChr,
    m.event,
    m.bp1Base,
    m.bp2Base,
    m.bp1Query,
    m.bp2Query,
    m.eventCount,
    m.geneBase,
    m.geneQuery,
    inverted,
    translocated,
    m.chunkCount,
  ].join("|");
};

const SYNTENY_MAP: Record<ChunkEvent, ChunkEvent> = {
  synteny: "synteny",
  inversion: "inversion",
  translocation: "synteny",
  "translocation+inversion": "inversion",
};

// Build CSV rows for the currently registered visible chunks. Within each
// pair, sort notable chunks by (chrBase, bp1Base), then merge a run of
// consecutive same-event chunks sharing the same chrBase and chrQuery.
const collectCsvRows = (): string[] => {
  const store = useAppStore.getState();

  const rows: string[] = [];
  let baseLabel = store.base?.name.split(".")[0] ?? "";
  for (const { queryLabel, chunks } of visiblePairs) {
    const notable = chunks
      .filter((c) => NOTABLE_EVENTS.has(c.dominant))
      .sort((a, b) => a.chrBase.localeCompare(b.chrBase) || a.bp1Base - b.bp1Base);

    let cur: MergedRow | null = null;
    for (const c of notable) {
      const mappedEvent = c.chrBase === c.chrQuery ? SYNTENY_MAP[c.dominant] : c.dominant;
      const matchCount = c.eventCounts[mappedEvent] ?? 0;
      if (cur && cur.event === c.dominant && cur.baseChr === c.chrBase && cur.queryChr === c.chrQuery) {
        if (c.bp1Base < cur.bp1Base) cur.bp1Base = c.bp1Base;
        if (c.bp2Base > cur.bp2Base) cur.bp2Base = c.bp2Base;
        if (c.bp1Query < cur.bp1Query) cur.bp1Query = c.bp1Query;
        if (c.bp2Query > cur.bp2Query) cur.bp2Query = c.bp2Query;

        cur.eventCount += matchCount;
        cur.geneBase += c.bpGeneBase;
        cur.geneQuery += c.bpGeneQuery;
        cur.chunkCount += 1;
      } else {
        if (cur) rows.push(formatRow(baseLabel, queryLabel, cur));
        cur = {
          baseChr: c.chrBase,
          queryChr: c.chrQuery,
          event: c.dominant,
          bp1Base: c.bp1Base,
          bp2Base: c.bp2Base,
          bp1Query: c.bp1Query,
          bp2Query: c.bp2Query,
          eventCount: matchCount,
          geneBase: c.bpGeneBase,
          geneQuery: c.bpGeneQuery,
          chunkCount: 1,
        };
      }
    }

    if (cur) rows.push(formatRow(baseLabel, queryLabel, cur));
    baseLabel = queryLabel;
  }

  return rows;
};

export const buildNotableEventsCsv = (): string => [CSV_HEADER, ...collectCsvRows()].join("\n");

const waitForRender = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

const blobToBytes = async (blob: Blob): Promise<Uint8Array> => new Uint8Array(await blob.arrayBuffer());

const zipAsync = (files: Record<string, AsyncZippableFile>): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    zip(files, (err, data) => (err ? reject(err) : resolve(data)));
  });

interface ZipWritable {
  write: (data: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
}

interface SaveFilePickerWindow {
  showSaveFilePicker: (opts: {
    suggestedName?: string;
    types?: { description?: string; accept: Record<string, string[]> }[];
  }) => Promise<{ createWritable: () => Promise<ZipWritable> }>;
}

export const batchExportAll = async (zipName = "synteny-all.zip"): Promise<void> => {
  const store = useAppStore.getState();
  const { chromosomes, autoSort } = store;
  if (!chromosomes.length) return;

  let writable: ZipWritable;
  try {
    const handle = await (window as unknown as SaveFilePickerWindow).showSaveFilePicker({
      suggestedName: zipName,
      types: [{ description: "ZIP archive", accept: { "application/zip": [".zip"] } }],
    });
    writable = await handle.createWritable();
  } catch {
    return;
  }

  const snapshot = {
    selectedChr: store.selectedChr,
    queryFiles: store.queryFiles,
    result: store.result,
    commonIds: store.commonIds,
    palette: store.palette,
    error: store.error,
  };

  const files: Record<string, AsyncZippableFile> = {};
  const csvRows: string[] = [CSV_HEADER];
  try {
    for (const chr of chromosomes) {
      useAppStore.setState({ selectedChr: chr });
      await autoSort();
      await waitForRender();
      if (!svgEl) continue;

      const base = chr.toLowerCase();
      files[`${base}.svg`] = [await blobToBytes(serializeSvg(svgEl)), { level: 6 }];

      const png = await svgToPngBlob(svgEl);
      if (png) files[`${base}.png`] = [await blobToBytes(png), { level: 0 }];

      csvRows.push(...collectCsvRows());
    }
  } finally {
    useAppStore.setState(snapshot);
  }

  if (Object.keys(files).length) {
    files["notable_events.csv"] = [new TextEncoder().encode(csvRows.join("\n")), { level: 6 }];
    const zipped = await zipAsync(files);
    await writable.write(zipped);
  }
  await writable.close();
};
