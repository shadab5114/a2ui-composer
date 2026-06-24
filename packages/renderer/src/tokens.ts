/** Maps editor token steps to the design-token CSS variables (pdesign-tokens). */

const SPACE_VAR: Record<string, string> = {
  "0": "0",
  halfX: "var(--pdesign-space-halfx)",
  "1X": "var(--pdesign-space-1x)",
  "2X": "var(--pdesign-space-2x)",
  "3X": "var(--pdesign-space-3x)",
  "4X": "var(--pdesign-space-4x)",
  "6X": "var(--pdesign-space-6x)",
  "8X": "var(--pdesign-space-8x)",
  "12X": "var(--pdesign-space-12x)",
  "16X": "var(--pdesign-space-16x)",
};

/** A space-token step ("4X") → a CSS length (token var). Falls back to the raw value. */
export function spaceToken(step: unknown): string {
  if (typeof step !== "string") return "0";
  return SPACE_VAR[step] ?? step;
}

export function alignToFlex(align: unknown): string {
  switch (align) {
    case "start":
      return "flex-start";
    case "center":
      return "center";
    case "end":
      return "flex-end";
    case "stretch":
      return "stretch";
    default:
      return "stretch";
  }
}

export function justifyToFlex(justify: unknown): string {
  switch (justify) {
    case "start":
      return "flex-start";
    case "center":
      return "center";
    case "end":
      return "flex-end";
    case "spaceBetween":
      return "space-between";
    default:
      return "flex-start";
  }
}
