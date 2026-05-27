// Registers @testing-library/jest-dom matchers (toBeInTheDocument, toHaveAttribute, ...).
// Auto-loaded by react-scripts/craco as a Jest setupFilesAfterEnv entry.
import "@testing-library/jest-dom";

// @testing-library/react@13.4 calls the deprecated ReactDOMTestUtils.act, which react@18.3
// warns about on every render. Silence only that one known-benign string so it cannot mask
// real console errors. Drop this once RTL is upgraded to a version that uses React.act.
const originalError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].includes("ReactDOMTestUtils.act` is deprecated")) return;
  originalError(...args);
};
