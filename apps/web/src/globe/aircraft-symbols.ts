import type { AircraftPosition } from "../aircraft";

// North-facing silhouettes are shared by the map atlas, legend and inspector.
export const aircraftSymbols = {
  unknown: {
    label: "Unknown type",
    path: "M24 8 L36 24 L24 40 L12 24 Z M24 17 L24 27 M24 31 L24 33",
  },
  airliner: {
    label: "Large aircraft",
    path: "M24 3 Q27 4 27 10 L27 19 L44 29 L44 33 L27 28 L27 37 L33 41 L33 44 L24 41 L15 44 L15 41 L21 37 L21 28 L4 33 L4 29 L21 19 L21 10 Q21 4 24 3 Z",
  },
  heavy: {
    label: "Heavy aircraft",
    path: "M24 2 Q28 4 28 10 L28 18 L45 27 L45 32 L38 30 L38 34 L35 34 L35 29 L31 28 L31 32 L28 32 L28 37 L35 42 L35 45 L24 42 L13 45 L13 42 L20 37 L20 32 L17 32 L17 28 L13 29 L13 34 L10 34 L10 30 L3 32 L3 27 L20 18 L20 10 Q20 4 24 2 Z",
  },
  jet: {
    label: "Jet",
    path: "M24 3 L27 13 L27 23 L40 32 L40 35 L27 30 L27 37 L32 42 L32 44 L24 41 L16 44 L16 42 L21 37 L21 30 L8 35 L8 32 L21 23 L21 13 Z M17 31 L17 37 M31 31 L31 37",
  },
  light: {
    label: "Light aircraft",
    path: "M24 5 L27 12 L27 20 L42 20 L42 25 L27 25 L26 37 L33 38 L33 42 L24 40 L15 42 L15 38 L22 37 L21 25 L6 25 L6 20 L21 20 L21 12 Z",
  },
  single: {
    label: "Single-engine aircraft",
    path: "M16 8 L32 8 M24 5 L24 11 M24 11 L27 16 L27 21 L42 21 L42 26 L27 26 L26 37 L33 38 L33 42 L24 40 L15 42 L15 38 L22 37 L21 26 L6 26 L6 21 L21 21 L21 16 Z",
  },
  twin: {
    label: "Multi-engine propeller aircraft",
    path: "M24 6 L27 13 L27 21 L41 22 L41 27 L27 26 L26 37 L33 39 L33 42 L24 40 L15 42 L15 39 L22 37 L21 26 L7 27 L7 22 L21 21 L21 13 Z M14 15 L14 29 M9 16 L19 16 M34 15 L34 29 M29 16 L39 16",
  },
  small: {
    label: "Small aircraft",
    path: "M24 5 L27 13 L27 20 L41 26 L41 30 L27 26 L26 37 L33 40 L33 43 L24 40 L15 43 L15 40 L22 37 L21 26 L7 30 L7 26 L21 20 L21 13 Z",
  },
  helicopter: {
    label: "Helicopter / rotorcraft",
    path: "M24 11 Q30 11 30 21 Q30 29 26 29 L26 39 L31 39 L31 42 L17 42 L17 39 L22 39 L22 29 Q18 29 18 21 Q18 11 24 11 Z M5 9 L43 33 M5 33 L43 9 M14 15 L14 30 M34 15 L34 30",
  },
  glider: {
    label: "Glider",
    path: "M24 7 L26 20 L44 22 L44 25 L26 24 L25 38 L32 40 L32 42 L24 40 L16 42 L16 40 L23 38 L22 24 L4 25 L4 22 L22 20 Z",
  },
  balloon: {
    label: "Lighter-than-air",
    path: "M24 4 C5 4 6 24 19 32 L29 32 C42 24 43 4 24 4 Z M19 32 L21 39 L27 39 L29 32 M21 39 L21 44 L27 44 L27 39",
  },
  drone: {
    label: "Unmanned aircraft",
    path: "M20 20 L28 20 L28 28 L20 28 Z M10 10 L38 38 M38 10 L10 38 M4 10 A6 6 0 1 0 16 10 A6 6 0 1 0 4 10 M32 10 A6 6 0 1 0 44 10 A6 6 0 1 0 32 10 M4 38 A6 6 0 1 0 16 38 A6 6 0 1 0 4 38 M32 38 A6 6 0 1 0 44 38 A6 6 0 1 0 32 38",
  },
} as const;

export type AircraftSymbol = keyof typeof aircraftSymbols;

const modelSymbols: Record<string, AircraftSymbol> = {};
for (const [symbol, codes] of Object.entries({
  single:
    "C150 C152 C172 C182 C206 C208 P28A P28B P28R SR20 SR22 PC12 TBM7 TBM8 TBM9",
  twin: "BE20 BE30 BE58 BE60 PA31 PA34 PA44 AT43 AT45 AT46 AT72 AT75 AT76 DH8A DH8B DH8C DH8D",
  jet: "C510 C525 C25A C25B C25C C500 C550 C560 C56X C680 C68A C700 C750 E50P E55P E545 E550 LJ35 LJ45 LJ60 GLF4 GLF5 GLF6 GLEX GL7T CL30 CL35 CL60 FA7X FA8X",
  airliner:
    "A318 A319 A320 A321 A19N A20N A21N B737 B738 B739 B37M B38M B39M B752 B753 E170 E175 E190 E195 E290 E295",
  heavy:
    "A332 A333 A338 A339 A343 A346 A359 A35K A388 B744 B748 B763 B764 B772 B773 B77L B77W B788 B789 B78X",
  helicopter:
    "R22 R44 R66 B06 B407 B412 EC35 EC45 EC30 EC20 H125 H135 H145 AS50 AS55 AS65 S76 S92 A109 A139 A169 A189",
})) {
  for (const code of codes.split(" "))
    modelSymbols[code] = symbol as AircraftSymbol;
}

export function aircraftSymbol(aircraft: AircraftPosition): AircraftSymbol {
  const description = aircraft.typeDescription ?? "";
  const code = aircraft.typeCode?.trim().toUpperCase() ?? "";
  if (/^[HG]/.test(description) || ["GYRO", "UHEL"].includes(code))
    return "helicopter";
  if (["H", "J"].includes(aircraft.wakeCategory ?? "")) return "heavy";
  if (code === "GLID") return "glider";
  if (["BALL", "SHIP"].includes(code)) return "balloon";
  if (code === "DRON") return "drone";
  const knownModel =
    modelSymbols[aircraft.typeCode?.trim().toUpperCase() ?? ""];
  if (knownModel) return knownModel;
  // ICAO description encodes airframe, engine count and propulsion (e.g. L1P, H2T).
  if (/^[LAS][0-9C]J$/.test(description)) return "jet";
  if (/^[LAS]1[PT]$/.test(description)) return "single";
  if (/^[LAS][2-9][PT]$/.test(description)) return "twin";
  if (description.startsWith("B")) return "balloon";
  if (description.endsWith("0-")) return "glider";
  const categorySymbols: Record<string, AircraftSymbol> = {
    light: "light",
    small: "small",
    large: "airliner",
    "high-vortex": "airliner",
    heavy: "heavy",
    "high-performance": "jet",
    rotorcraft: "helicopter",
    glider: "glider",
    "lighter-than-air": "balloon",
    ultralight: "glider",
    uav: "drone",
  };
  return categorySymbols[aircraft.category ?? ""] ?? "unknown";
}

export function aircraftIcon(
  symbol: AircraftSymbol,
  selected: boolean,
  onGround: boolean,
): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 96;
  const context = canvas.getContext("2d")!;
  context.scale(2, 2);
  context.fillStyle = selected ? "#ffd68a" : onGround ? "#9cafb9" : "#66e4cc";
  context.strokeStyle = "#07131b";
  context.lineWidth = 2.5;
  context.lineJoin = "round";
  const path = new Path2D(aircraftSymbols[symbol].path);
  context.stroke(path);
  context.fill(path);
  context.strokeStyle = context.fillStyle;
  context.lineWidth = 1.2;
  context.stroke(path);
  return context.getImageData(0, 0, 96, 96);
}
