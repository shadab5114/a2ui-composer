/**
 * Schema-derived inspector controls (ARCHITECTURE §7.3). Every control is generated
 * from a PropDescriptor — no hand-written forms, no <form> elements (controlled
 * inputs only). Recursive: object → nested sub-panel, array → repeatable list.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { isDynamicString, type PropDescriptor } from "@pds/a2ui-schema";

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
      {descriptor.kind === "enum" && <EnumControl descriptor={descriptor} value={value} onChange={onChange} />}
      {descriptor.kind === "bool" && <BoolControl value={value} onChange={onChange} />}
      {descriptor.kind === "number" && <NumberControl value={value} onChange={onChange} />}
      {descriptor.kind === "string" && <TextControl value={value} onChange={onChange} />}
      {descriptor.kind === "content" && <ContentControl value={value} onChange={onChange} />}
    </div>
  );
}
