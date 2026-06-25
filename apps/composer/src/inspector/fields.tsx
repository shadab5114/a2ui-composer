/**
 * Schema-derived inspector controls (ARCHITECTURE §7.3). Every control is generated
 * from a PropDescriptor — no hand-written forms, no <form> elements (controlled
 * inputs only). Recursive: object → nested sub-panel, array → repeatable list.
 */
import { useEffect, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, Plus, Search, X } from "lucide-react";
import * as PdsIcons from "@shadab5114/pds-core/icons";
import { isDynamicString, ICON_NAMES, type PropDescriptor } from "@pds/a2ui-schema";

type IconFC = ComponentType<{ size?: number | string; color?: string }>;
const iconComponents = PdsIcons as unknown as Record<string, IconFC>;

function IconPreview({ name, size = 20 }: { name: string; size?: number }) {
  const Comp = iconComponents[name];
  return Comp ? <Comp size={size} /> : null;
}

type OnChange = (value: unknown) => void;

const inputCls =
  "w-full rounded border border-chrome-border bg-chrome-bg px-2 py-1 text-xs text-chrome-text focus:border-chrome-accent focus:outline-none";
const labelCls = "mb-0.5 block text-[11px] font-medium text-chrome-text";

/** Default value object for a fresh array item / variant from its fields. */
function defaultsFromFields(fields: PropDescriptor[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.kind === "content" && f.required) out[f.name] = { literalString: "" };
    else if (f.default !== undefined) out[f.name] = f.default;
  }
  return out;
}

function EnumControl({
  descriptor,
  value,
  onChange,
}: {
  descriptor: PropDescriptor;
  value: unknown;
  onChange: OnChange;
}) {
  return (
    <select
      className={inputCls}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      {!descriptor.required && <option value="">— unset —</option>}
      {descriptor.options?.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

function IconPickerControl({
  descriptor,
  value,
  onChange,
}: {
  descriptor: PropDescriptor;
  value: unknown;
  onChange: OnChange;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const current = typeof value === "string" ? value : "";
  const filtered = (ICON_NAMES as readonly string[]).filter((n) =>
    n.toLowerCase().includes(search.toLowerCase()),
  );

  const select = (name: string | undefined) => {
    onChange(name);
    setOpen(false);
    setSearch("");
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); setSearch(""); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded border border-chrome-border bg-chrome-bg px-2 py-1 text-xs text-chrome-text hover:border-chrome-accent"
      >
        {current && (
          <span className="shrink-0 text-chrome-text">
            <IconPreview name={current} size={14} />
          </span>
        )}
        <span className="flex-1 text-left text-chrome-muted">
          {current || "Browse icons…"}
        </span>
        {current && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); select(undefined); }}
            className="shrink-0 text-chrome-muted hover:text-chrome-text"
            title="Clear"
          >
            <X size={12} />
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={() => { setOpen(false); setSearch(""); }}
          >
            <div
              className="flex max-h-[70vh] w-96 flex-col overflow-hidden rounded-lg border border-chrome-border bg-chrome-bg shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-chrome-border px-4 py-3">
                <span className="text-sm font-semibold text-chrome-text">
                  {descriptor.name === "selectedIcon" ? "Pick Selected Icon" : "Pick an Icon"}
                </span>
                <button
                  type="button"
                  onClick={() => { setOpen(false); setSearch(""); }}
                  className="rounded p-1 text-chrome-muted hover:bg-chrome-border hover:text-chrome-text"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Search */}
              <div className="border-b border-chrome-border px-3 py-2">
                <div className="relative">
                  <Search
                    size={12}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-chrome-muted"
                  />
                  <input
                    type="text"
                    placeholder={`Search ${ICON_NAMES.length} icons…`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoFocus
                    className="w-full rounded border border-chrome-border bg-chrome-bg py-1 pl-6 pr-2 text-xs text-chrome-text focus:border-chrome-accent focus:outline-none"
                  />
                </div>
              </div>

              {/* Grid */}
              <div className="flex-1 overflow-y-auto p-2">
                {!descriptor.required && current && (
                  <button
                    type="button"
                    onClick={() => select(undefined)}
                    className="mb-2 w-full rounded border border-dashed border-chrome-border px-2 py-1 text-[11px] text-chrome-muted hover:border-chrome-accent hover:text-chrome-text"
                  >
                    — clear icon —
                  </button>
                )}

                <div className="grid grid-cols-5 gap-1">
                  {filtered.map((name) => (
                    <button
                      key={name}
                      type="button"
                      title={name}
                      onClick={() => select(name)}
                      className={`flex flex-col items-center gap-1 rounded px-1 py-2 text-[10px] hover:bg-chrome-border hover:text-chrome-text ${
                        name === current
                          ? "bg-chrome-accent/20 text-chrome-text ring-1 ring-inset ring-chrome-accent"
                          : "text-chrome-muted"
                      }`}
                    >
                      <IconPreview name={name} size={20} />
                      <span className="w-full truncate text-center leading-tight">
                        {name}
                      </span>
                    </button>
                  ))}

                  {filtered.length === 0 && (
                    <span className="col-span-5 py-6 text-center text-xs text-chrome-muted">
                      No icons match &ldquo;{search}&rdquo;
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function BoolControl({ value, onChange }: { value: unknown; onChange: OnChange }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-chrome-muted">
      <input
        type="checkbox"
        checked={value === true}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-chrome-accent"
      />
      {value === true ? "true" : "false"}
    </label>
  );
}

function NumberControl({ value, onChange }: { value: unknown; onChange: OnChange }) {
  return (
    <input
      type="number"
      className={inputCls}
      value={typeof value === "number" ? value : ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
    />
  );
}

function TextControl({ value, onChange }: { value: unknown; onChange: OnChange }) {
  return (
    <input
      type="text"
      className={inputCls}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
    />
  );
}

/** Content: a DynamicString with a literal ⇄ bind toggle ({literalString} ⇄ {path}). */
function ContentControl({ value, onChange }: { value: unknown; onChange: OnChange }) {
  const bound = isDynamicString(value) && "path" in value;
  const text = isDynamicString(value)
    ? "path" in value
      ? value.path
      : value.literalString
    : "";

  const setText = (t: string) => onChange(bound ? { path: t } : { literalString: t });
  const toggle = () => onChange(bound ? { literalString: text } : { path: text });

  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        className={inputCls}
        placeholder={bound ? "/data/path" : "literal text"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        onClick={toggle}
        className={`shrink-0 rounded px-1.5 py-1 text-[10px] font-semibold ${
          bound ? "bg-chrome-accent text-white" : "bg-chrome-border text-chrome-muted"
        }`}
        title={bound ? "Bound to data-model path" : "Literal value"}
      >
        {bound ? "BIND" : "TEXT"}
      </button>
    </div>
  );
}

function Collapsible({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded border border-chrome-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1 px-2 py-1 text-[11px] font-semibold text-chrome-text"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title}
      </button>
      {open && <div className="space-y-2 border-t border-chrome-border p-2">{children}</div>}
    </div>
  );
}

function ObjectControl({
  descriptor,
  value,
  onChange,
}: {
  descriptor: PropDescriptor;
  value: unknown;
  onChange: OnChange;
}) {
  const obj = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return (
    <Collapsible title={descriptor.name} defaultOpen={false}>
      {(descriptor.fields ?? []).map((field) => (
        <PropField
          key={field.name}
          descriptor={field}
          value={obj[field.name]}
          onChange={(fv) => onChange({ ...obj, [field.name]: fv })}
        />
      ))}
    </Collapsible>
  );
}

function variantFor(descriptor: PropDescriptor, item: Record<string, unknown>) {
  const disc = descriptor.itemDiscriminator ?? "kind";
  const current = item[disc];
  return descriptor.itemVariants?.find((v) => v.value === current);
}

function ArrayControl({
  descriptor,
  value,
  onChange,
}: {
  descriptor: PropDescriptor;
  value: unknown;
  onChange: OnChange;
}) {
  const items = (Array.isArray(value) ? value : []) as Record<string, unknown>[];
  const disc = descriptor.itemDiscriminator ?? "kind";
  const isUnion = !!descriptor.itemVariants?.length;

  const newItem = (): Record<string, unknown> => {
    if (isUnion) {
      const v = descriptor.itemVariants![0];
      return { [disc]: v.value, ...defaultsFromFields(v.fields) };
    }
    return defaultsFromFields(descriptor.itemFields ?? []);
  };

  const update = (i: number, item: Record<string, unknown>) =>
    onChange(items.map((it, idx) => (idx === i ? item : it)));

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const fields = isUnion ? (variantFor(descriptor, item)?.fields ?? []) : (descriptor.itemFields ?? []);
        return (
          <div key={i} className="rounded border border-chrome-border p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] uppercase text-chrome-muted">
                {descriptor.name}[{i}]
              </span>
              <button
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                className="rounded p-0.5 text-red-400 hover:bg-chrome-border"
                title="Remove"
              >
                <X size={12} />
              </button>
            </div>

            {isUnion && (
              <div className="mb-2">
                <label className={labelCls}>{disc}</label>
                <select
                  className={inputCls}
                  value={String(item[disc] ?? "")}
                  onChange={(e) => {
                    const v = descriptor.itemVariants!.find((x) => x.value === e.target.value);
                    update(i, { [disc]: e.target.value, ...(v ? defaultsFromFields(v.fields) : {}) });
                  }}
                >
                  {descriptor.itemVariants!.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.value}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {fields.map((field) => (
              <PropField
                key={field.name}
                descriptor={field}
                value={item[field.name]}
                onChange={(fv) => update(i, { ...item, [field.name]: fv })}
              />
            ))}
          </div>
        );
      })}
      <button
        onClick={() => onChange([...items, newItem()])}
        className="flex items-center gap-1 rounded border border-dashed border-chrome-border px-2 py-1 text-[11px] text-chrome-muted hover:border-chrome-accent hover:text-chrome-text"
      >
        <Plus size={12} /> Add {descriptor.name} item
      </button>
    </div>
  );
}

export function PropField({
  descriptor,
  value,
  onChange,
}: {
  descriptor: PropDescriptor;
  value: unknown;
  onChange: OnChange;
}) {
  // Object/array render their own titled container.
  if (descriptor.kind === "object") {
    return <ObjectControl descriptor={descriptor} value={value} onChange={onChange} />;
  }
  if (descriptor.kind === "array") {
    return (
      <div>
        <label className={labelCls}>{descriptor.name}</label>
        <ArrayControl descriptor={descriptor} value={value} onChange={onChange} />
      </div>
    );
  }

  return (
    <div>
      <label className={labelCls} title={descriptor.description}>
        {descriptor.name}
        {descriptor.kind === "content" && (
          <span className="ml-1 text-[9px] uppercase text-chrome-muted">content</span>
        )}
      </label>
      {descriptor.kind === "enum" && (
        descriptor.isIconPicker
          ? <IconPickerControl descriptor={descriptor} value={value} onChange={onChange} />
          : <EnumControl descriptor={descriptor} value={value} onChange={onChange} />
      )}
      {descriptor.kind === "bool" && <BoolControl value={value} onChange={onChange} />}
      {descriptor.kind === "number" && <NumberControl value={value} onChange={onChange} />}
      {descriptor.kind === "string" && <TextControl value={value} onChange={onChange} />}
      {descriptor.kind === "content" && <ContentControl value={value} onChange={onChange} />}
    </div>
  );
}
