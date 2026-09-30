export type HelpAlign = "start" | "center" | "end";

/** Spread onto the label text the bubble hangs from; styling lives in global.css. */
export const helpProps = (help?: string, align: HelpAlign = "start") =>
  help ? { "data-help": help, "data-help-align": align } : {};
