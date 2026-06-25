/**
 * Validation against the design system's own Zod schemas — the same contract the
 * components enforce at runtime. `buildValidators` lives in `zod-source.ts`.
 *
 * Two structural cases the per-component schemas don't cover:
 *  - Layout primitives (Box / Column / Row) aren't catalog components → structural check.
 *  - A node's `id`/`component` are stripped before parsing (schemas validate props).
 *    Slot `children` (id-ref arrays) pass because the schema types them `z.any()`.
 */
import type { ZodType } from "zod";
import type { A2UIComponent, A2UIExport, UpdateComponentsInstruction } from "./a2ui.types";
import { isA2UILayout } from "./frame";

export interface ValidationError {
  componentId: string;
  component: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

export interface Validators {
  catalogId: string;
  byName: Record<string, ZodType>;
}

function checkLayout(comp: A2UIComponent): ValidationError[] {
  const errors: ValidationError[] = [];
  if (typeof comp.id !== "string") {
    errors.push({
      componentId: String(comp.id),
      component: comp.component,
      message: "layout component is missing a string id",
    });
  }
  if (
    comp.children !== undefined &&
    (!Array.isArray(comp.children) ||
      !comp.children.every((c) => typeof c === "string"))
  ) {
    errors.push({
      componentId: comp.id,
      component: comp.component,
      message: "layout children must be an array of string id refs",
    });
  }
  return errors;
}

export function validate(
  a2ui: A2UIExport,
  validators: Validators,
): ValidationResult {
  const errors: ValidationError[] = [];

  const updateComponentsOp = a2ui.a2ui.find(
    (op): op is UpdateComponentsInstruction => "updateComponents" in op,
  );
  if (!updateComponentsOp) return { ok: true, errors: [] };

  for (const comp of updateComponentsOp.updateComponents.components) {
    if (isA2UILayout(comp.component)) {
      errors.push(...checkLayout(comp));
      continue;
    }

    const schema = validators.byName[comp.component];
    if (!schema) {
      errors.push({
        componentId: comp.id,
        component: comp.component,
        message: `no catalog schema for component "${comp.component}"`,
      });
      continue;
    }

    const { id: _id, component: _component, ...props } = comp;
    const result = schema.safeParse(props);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.length ? `/${issue.path.join("/")}` : "/";
        errors.push({
          componentId: comp.id,
          component: comp.component,
          message: `${path} ${issue.message}`,
        });
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
