/**
 * The Frame layout primitive's runtime. The catalog ships no layout component
 * (ARCHITECTURE §13.1), so Frame renders as a flex container here. It is a stand-in
 * in the sense of §7.2: when real A2UI Column/Row components exist, this is the one
 * place to swap. Auto-layout only — no absolute positioning.
 */
import type { CSSProperties, ReactNode } from "react";
import { alignToFlex, justifyToFlex, spaceToken } from "../tokens";

export interface FrameProps {
  direction?: "row" | "column";
  gap?: string;
  padding?: string;
  align?: string;
  justify?: string;
  children?: ReactNode;
  style?: CSSProperties;
}

export function Frame({
  direction = "column",
  gap = "4X",
  padding = "0",
  align = "stretch",
  justify = "start",
  children,
  style,
}: FrameProps) {
  const css: CSSProperties = {
    display: "flex",
    flexDirection: direction,
    gap: spaceToken(gap),
    padding: spaceToken(padding),
    alignItems: alignToFlex(align),
    justifyContent: justifyToFlex(justify),
    minHeight: 0,
    minWidth: 0,
    ...style,
  };
  return (
    <div data-a2ui-frame={direction} style={css}>
      {children}
    </div>
  );
}
