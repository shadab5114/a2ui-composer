/**
 * registry.ts — the seam (ARCHITECTURE §2, §7.2). A single map from A2UI component
 * `type` → real React component. This is the ONLY place that changes between
 * stand-ins and production design-system components.
 *
 * The MVP wires the real `@shadab5114/pds-core` components directly, plus the
 * synthetic `Frame` layout primitive (no catalog/runtime equivalent yet).
 */
import type { ComponentType } from "react";
import {
  Accordion,
  AccordionItem,
  Badge,
  BadgeIndicator,
  Button,
  ButtonGroup,
  Caret,
  DirectionalIcon,
  IconButton,
  Image,
  ScreenReaderText,
  Text,
  TextLink,
  TextLinkCaret,
  TileContainer,
  Tilelet,
  TitleLockup,
  TitleLockupEyebrow,
  TitleLockupSubtitle,
  TitleLockupTitle,
  Tooltip,
} from "@shadab5114/pds-core";
import { FRAME_TYPE } from "@pds/a2ui-schema";
import { Frame } from "./standins/Frame";

// The registry is intentionally heterogeneous (each value has its own prop shape),
// so its value type is the documented `ComponentType<any>` exception.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyComponent = ComponentType<any>;

export const registry: Record<string, AnyComponent> = {
  [FRAME_TYPE]: Frame,
  Button,
  TextLink,
  TextLinkCaret,
  ButtonGroup,
  IconButton,
  Text,
  Caret,
  DirectionalIcon,
  Tooltip,
  Badge,
  BadgeIndicator,
  Image,
  TileContainer,
  Tilelet,
  TitleLockup,
  TitleLockupTitle,
  TitleLockupSubtitle,
  TitleLockupEyebrow,
  ScreenReaderText,
  Accordion,
  AccordionItem,
};

export function getComponent(type: string): AnyComponent | undefined {
  return registry[type];
}
