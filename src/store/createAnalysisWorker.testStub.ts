export const createAnalysisWorker = (): Worker => {
  throw new Error("workers unavailable in test env");
};
