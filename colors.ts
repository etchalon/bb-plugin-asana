// Asana project colors as CSS colors, for the dot beside a project name.
// Dependency-free so the frontend bundle can import it. Covers Asana's
// current palette names and the older dark-*/light-* names.

const PALETTE: Record<string, string> = {
  red: "#e8384f",
  orange: "#fd612c",
  "yellow-orange": "#fd9a00",
  yellow: "#eec300",
  "yellow-green": "#a4cf30",
  green: "#62d26f",
  "blue-green": "#37c5ab",
  aqua: "#20aaea",
  blue: "#4186e0",
  indigo: "#7a6ff0",
  purple: "#aa62e3",
  magenta: "#e362e3",
  "hot-pink": "#ea4e9d",
  pink: "#fc91ad",
  "cool-gray": "#8da3a6",
  "dark-pink": "#ea4e9d",
  "dark-green": "#3ba55d",
  "dark-blue": "#4186e0",
  "dark-red": "#e8384f",
  "dark-teal": "#20aaea",
  "dark-brown": "#a76c45",
  "dark-orange": "#fd612c",
  "dark-purple": "#7a6ff0",
  "dark-warm-gray": "#8d8d8d",
  "light-pink": "#fc91ad",
  "light-green": "#a4cf30",
  "light-blue": "#6fb2f2",
  "light-red": "#f28b82",
  "light-teal": "#37c5ab",
  "light-brown": "#eec300",
  "light-yellow": "#eec300",
  "light-orange": "#fd9a00",
  "light-purple": "#aa62e3",
  "light-warm-gray": "#b3b3b3",
};

/** The CSS color for an Asana color name, or null for "none" and unknown names. */
export function projectColor(name: string | null | undefined): string | null {
  return name == null ? null : (PALETTE[name] ?? null);
}
