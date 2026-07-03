/* eslint-disable no-restricted-globals */
import { parseBED } from "@/src/utils";
import { packParsed, transferables } from "./analysisJob";
import type { PackRequest, PackResponse } from "./analysisJob";

self.onmessage = (e: MessageEvent<PackRequest>) => {
  const { jobId, text, fileName } = e.data;
  const packed = packParsed(parseBED(text, fileName));
  (self as unknown as Worker).postMessage({ jobId, packed } satisfies PackResponse, transferables(packed));
};
