/**
 * Box — the synthetic layout primitive (replaces Frame). Implements the same
 * token-resolving flex container as the VDS `Box` component (vdsCatalog.tsx),
 * so the editor canvas faithfully previews spacing, radii, borders, and overflow.
 *
 * This is a stand-in (ARCHITECTURE §7.2): when A2UI ships real Column/Row
 * components, swap this file out in registry.ts.
 */
import type { CSSProperties, ReactNode } from "react";

// ── Token resolvers (mirrors VDS Box px / br helpers) ─────────────────────

/** Space token → pixel number. "4X" → 16, "large" → 24, raw number passthrough. */
function px(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const xMatch = v.match(/^(\d+(?:\.\d+)?)X$/);
    if (xMatch) return parseFloat(xMatch[1]) * 4;
    if (v === "xlarge") return 32;
    if (v === "large")  return 24;
    if (v === "medium") return 16;
    if (v === "small")  return 8;
    if (v === "xsmall") return 4;
    if (v === "0")      return 0;
  }
  return undefined;
}

/** Border-radius token → pixel number. Falls back to `fallback` if `v` is undefined. */
function br(v: unknown, fallback?: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    if (v === "hero" || v === "standard") return 12;
    if (v === "large")                    return 12;
    if (v === "medium")                   return 8;
    if (v === "small")                    return 4;
    if (v === "xsmall" || v === "none" || v === "0" || v === "0px") return 0;
    const xMatch = v.match(/^(\d+(?:\.\d+)?)X$/);
    if (xMatch) return parseFloat(xMatch[1]) * 4;
    const pxMatch = v.match(/^(\d+(?:\.\d+)?)px$/);
    if (pxMatch) return parseFloat(pxMatch[1]);
  }
  return fallback !== undefined ? br(fallback) : undefined;
}

// ── CSS value maps ─────────────────────────────────────────────────────────

const JUSTIFY: Record<string, string> = {
  start:   "flex-start",
  center:  "center",
  end:     "flex-end",
  between: "space-between",
  around:  "space-around",
  // legacy aliases
  spaceBetween: "space-between",
};

const ALIGN: Record<string, string> = {
  start:   "flex-start",
  center:  "center",
  end:     "flex-end",
  stretch: "stretch",
};

// ── Component ──────────────────────────────────────────────────────────────

export interface BoxProps {
  direction?: "vertical" | "horizontal";
  gap?: unknown;
  padding?: unknown;
  borderRadius?: unknown;
  borderTopLeftRadius?: unknown;
  borderTopRightRadius?: unknown;
  borderBottomLeftRadius?: unknown;
  borderBottomRightRadius?: unknown;
  borderWidth?: string;
  borderColor?: string;
  background?: string;
  justify?: string;
  align?: string;
  overflow?: string;
  wrap?: boolean;
  children?: ReactNode;
}

export function Box({
  direction = "vertical",
  gap,
  padding,
  borderRadius,
  borderTopLeftRadius,
  borderTopRightRadius,
  borderBottomLeftRadius,
  borderBottomRightRadius,
  borderWidth,
  borderColor,
  background,
  justify,
  align = "stretch",
  overflow,
  wrap,
  children,
}: BoxProps) {
  const resolvedBr   = br(borderRadius);
  const hasCorners   =
    borderTopLeftRadius     !== undefined ||
    borderTopRightRadius    !== undefined ||
    borderBottomLeftRadius  !== undefined ||
    borderBottomRightRadius !== undefined;

  const style: CSSProperties = {
    display:         "flex",
    flexDirection:   direction === "horizontal" ? "row" : "column",
    flexWrap:        wrap ? "wrap" : undefined,
    gap:             px(gap)     ?? (gap     as string | undefined),
    padding:         px(padding) ?? (padding as string | undefined),
    justifyContent:  justify ? (JUSTIFY[justify] ?? justify) : undefined,
    alignItems:      align   ? (ALIGN[align]     ?? align)   : "stretch",
    backgroundColor: background  ?? undefined,
    overflow:        overflow     ?? undefined,
    border:          borderWidth  ? `${borderWidth} solid ${borderColor ?? "#e8e8e8"}` : undefined,
    // radius: individual corners override shorthand
    ...(hasCorners
      ? {
          borderTopLeftRadius:     br(borderTopLeftRadius,     borderRadius) ?? 0,
          borderTopRightRadius:    br(borderTopRightRadius,    borderRadius) ?? 0,
          borderBottomLeftRadius:  br(borderBottomLeftRadius,  borderRadius) ?? 0,
          borderBottomRightRadius: br(borderBottomRightRadius, borderRadius) ?? 0,
        }
      : resolvedBr !== undefined
        ? { borderRadius: resolvedBr }
        : {}),
    // flex:1 makes Box fill a flex parent (root EditorNode, or a weighted child wrapper).
    // minHeight/minWidth:0 prevents overflow in flex containers.
    flex:      1,
    boxSizing: "border-box",
    minHeight: 0,
    minWidth:  0,
  };

  return (
    <div data-a2ui-box={direction} style={style}>
      {children}
    </div>
  );
}
