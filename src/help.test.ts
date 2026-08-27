import { helpProps } from "@/src/help";
import { HELP } from "@/src/constants";

describe("helpProps", () => {
  it("emits nothing when there is no help text", () => {
    expect(helpProps(undefined)).toEqual({});
  });

  it("emits nothing for an unwritten HELP entry, so blanks stay inert", () => {
    expect(HELP.fontSize).toBe("");
    expect(helpProps(HELP.fontSize)).toEqual({});
  });

  it("defaults to start alignment", () => {
    expect(helpProps("Splits blocks")).toEqual({
      "data-help": "Splits blocks",
      "data-help-align": "start",
    });
  });

  it("passes an explicit alignment through", () => {
    expect(helpProps("Canvas width", "end")["data-help-align"]).toBe("end");
  });
});

describe("HELP", () => {
  const written = Object.entries(HELP).filter(([, text]) => text !== "");

  it("has no leading or trailing whitespace", () => {
    for (const [key, text] of written) expect([key, text]).toEqual([key, text.trim()]);
  });

  it("states the direction of every numeric knob", () => {
    const numeric = ["groupThreshold", "workerCount", "gapBp", "hiddenThreshold", "minLocalEvents"] as const;
    for (const key of numeric) expect(HELP[key]).toMatch(/Higher = /);
  });
});
