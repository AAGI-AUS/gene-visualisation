import { zip, type AsyncZippableFile } from "fflate";
import { useAppStore } from "@/src/store/useAppStore";
import { serializeSvg, svgToPngBlob } from "@/src/components/visualizationTab/utils";

let svgEl: SVGSVGElement | null = null;

export const registerSvgEl = (el: SVGSVGElement | null): void => {
  svgEl = el;
};

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
    }
  } finally {
    useAppStore.setState(snapshot);
  }

  if (Object.keys(files).length) {
    const zipped = await zipAsync(files);
    await writable.write(zipped);
  }
  await writable.close();
};
