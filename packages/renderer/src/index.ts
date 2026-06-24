// @pds/a2ui-react — the single shared rendering path (the seam).
export { registry, getComponent, type AnyComponent } from "./registry";
export { renderNode, A2UISurface } from "./Renderer";
export type { RenderOptions, A2UISurfaceProps } from "./Renderer";
export {
  resolveDynamicString,
  deepResolve,
  resolveProps,
  type DataModel,
} from "./dynamic";
export { spaceToken, alignToFlex, justifyToFlex } from "./tokens";
export { Frame, type FrameProps } from "./standins/Frame";
export { Fallback } from "./standins/Fallback";
