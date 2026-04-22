// from https://github.com/jquery/jquery-color
export const colors = {
  darkgrey: "#a9a9a9",
  darkgreen: "#006400",
  cyan: "#00ffff",
  lightyellow: "#ffffe0",
  blue: "#0000ff",
  darkblue: "#00008b",
  lightgrey: "#d3d3d3",
  darkcyan: "#008b8b",
  gold: "#ffd700",
  violet: "#800080",
  maroon: "#800000",
  pink: "#ffc0cb",
  darkkhaki: "#bdb76b",
  brown: "#a52a2a",
  lime: "#00ff00",
  green: "#008000",
  lightpink: "#ffb6c1",
  yellow: "#ffff00",
  magenta: "#ff00ff",
  darkred: "#8b0000",
  lightcyan: "#e0ffff",
  red: "#ff0000",
  purple: "#800080",
  lightblue: "#add8e6",
  beige: "#f5f5dc",
  darkorange: "#ff8c00",
  darkmagenta: "#8b008b",
  white: "#ffffff",
  aqua: "#00ffff",
  black: "#000000",
  indigo: "#4b0082",
  darkviolet: "#9400d3",
  lightgreen: "#90ee90",
  khaki: "#f0e68c",
  darkolivegreen: "#556b2f",
  silver: "#c0c0c0",
  darksalmon: "#e9967a",
  orange: "#ffa500",
  navy: "#000080",
  fuchsia: "#ff00ff",
  azure: "#f0ffff",
  olive: "#808000",
  darkorchid: "#9932cc",
};

export const specificColors = {
  green: "#00808b",
  lightgreen: "#e6f4f1",
  lightblue: "#eefcfe",
  lightgrey: "#f9f9f9",
};

export const shadow = {
  dark: "rgba(0, 0, 0, 0.854)",
  heavy: "rgba(0, 0, 0, 0.618)",
  mid: "rgba(0, 0, 0, 0.3)",
  light: "rgba(0, 0, 0, 0.1)",
};

export const today = new Date();
export const oneWeek = 7 * 24 * 60 * 60 * 1000;

export const nbsp = "\u00A0";

export const sheetNameMapping = {
  Support: "support",
  "R & D": "rd",
  Service: "service",
} as const;

const _members = {
  //AAGI-AU
  "Julian Taylor": ["JT"],
  "Olena Kravchuk": ["OK"],
  "Max Moldovan": ["MM"],
  "Mario Fruzangohar": ["MF"],
  "Sabela Munoz-Santa": ["SMS"],
  "Nicholas Lambert": ["NL"],
  "Sam Rogers": ["SR"],
  "Beata Sznajder": ["BS"],
  "Sharon Nielsen": ["SN"],
  "Russell Edson": ["RE"],
  "Huan Zhao": ["HZ"],
  "Wasin Pipattungsakul": ["WP"],
  //AIML
  "Javen Shi": ["JS"],
  "Wei Zhang": ["WZ"],
  "Ehsan Abbasnejad": ["EA"],
  "Greg Ruthenbeck": ["GR"],
  //Mech Eng.
  "Tien-Fu Lu": ["TF"],
  //Maths Sci.
  "John Maclean": ["JM"],
  "Ben Binder": ["BB"],
  "Ed Green": ["EG"],
  "Matthew Roughan": ["MR"],
  "Lewis Mitchell": ["LM"],
  //AFW
  "Matthew Knowling": ["MK"],
  "Camille Buhl": ["JB", "CB"],
  "Vinay Pagay": ["VP"],
  "Chris Preston": ["CP"],
  //Ext. Collab

  //PP/AP
  "Ari Verbyla": ["AV"],
  "Joanne De Faveri": ["JD"],
};

export const members: { [key: string]: string } = Object.entries(
  _members,
).reduce((members, [name, abbrs]) => {
  return {
    ...members,
    ...abbrs.reduce((res, abbr) => ({ ...res, [abbr]: name }), {}),
  };
}, {});

export const info = {
  projectSpecific: "Update personnel info related\nto the selected project",
  personel: "Update personnel info\nshared among projects",
  onCost: "Usual rate:\n- Fixed: 29.5\n- Continuing: 29.5\n- Casual: 24.5",
  save: "Save the current project and\npersonnel info to continue later",
  load: "Load project and\npersonnel info (.json)",
  exportProject: "Export the cost table of\nthe current project (.csv)",
  exportAll: "Export the cost table\nof all projects (.csv)",
  addProject: "Add a new project",
  removeProject: "Remove the current project",
  renameProject: "Rename the current project",
  addPerson: "Add a new person",
  removePerson: "Remove from project",
};
