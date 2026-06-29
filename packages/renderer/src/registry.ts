/**
 * registry.ts — the seam (ARCHITECTURE §2, §7.2). A single map from A2UI component
 * `type` → real React component. This is the ONLY place that changes between
 * stand-ins and production design-system components.
 *
 * The MVP wires the real `@shadab5114/pds-core` components directly, plus the
 * synthetic `Frame` layout primitive (no catalog/runtime equivalent yet).
 */
import React, { type ComponentType } from "react";
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
  ComposableTileContainer,
  Tilelet,
  TitleLockup,
  TitleLockupEyebrow,
  TitleLockupSubtitle,
  TitleLockupTitle,
  Tooltip,
} from "@shadab5114/pds-core";
import * as PdsIcons from "@shadab5114/pds-core/icons";
import { FRAME_TYPE, SLOT_TYPE } from "@pds/a2ui-schema";
import { Box } from "./standins/Box";
import { SlotBox } from "./standins/SlotBox";

type IconFC = ComponentType<{ size?: string | number; color?: string }>;
const iconMap = PdsIcons as unknown as Record<string, IconFC>;

/**
 * Bridges the serializable `icon`/`selectedIcon` string props (ARCHITECTURE §13.3)
 * to the `renderIcon`/`renderSelectedIcon` render-prop that IconButton expects.
 */
function IconButtonAdapter(props: Record<string, unknown>) {
  const { icon, selectedIcon, ...rest } = props as {
    icon?: string;
    selectedIcon?: string;
    [k: string]: unknown;
  };
  const IconComp = icon ? iconMap[icon] : undefined;
  const SelectedComp = selectedIcon ? iconMap[selectedIcon] : undefined;
  const adapted: Record<string, unknown> = {
    ...rest,
    ...(IconComp ? { renderIcon: (p: object) => React.createElement(IconComp, p as { size?: string | number; color?: string }) } : {}),
    ...(SelectedComp ? { renderSelectedIcon: (p: object) => React.createElement(SelectedComp, p as { size?: string | number; color?: string }) } : {}),
  };
  return React.createElement(IconButton as ComponentType<Record<string, unknown>>, adapted);
}

// The registry is intentionally heterogeneous (each value has its own prop shape),
// so its value type is the documented `ComponentType<any>` exception.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyComponent = ComponentType<any>;

export const registry: Record<string, AnyComponent> = {
  [FRAME_TYPE]: Box,
  [SLOT_TYPE]: SlotBox,
  Button,
  TextLink,
  TextLinkCaret,
  ButtonGroup,
  IconButton: IconButtonAdapter,
  Text,
  Caret,
  DirectionalIcon,
  Tooltip,
  Badge,
  BadgeIndicator,
  Image,
  TileContainer,
  ComposableTileContainer,
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
