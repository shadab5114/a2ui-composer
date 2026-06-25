import { getCatalog } from "../src/zod-source.ts";
const cat = getCatalog();
for (const [name, model] of Object.entries(cat.components)) {
  const propSummary = model.props.map((p: any) => {
    let s = `${p.name}:${p.kind}`;
    if (p.kind === "enum") s += `(${(p.options||[]).join("|")})`;
    if (p.kind === "array" && p.itemVariants) s += `[vars:${p.itemVariants.map((v:any)=>v.value+"{"+v.fields.map((f:any)=>f.name+":"+f.kind).join(",")+"}" ).join("|")}]`;
    if (p.kind === "array" && p.itemFields) s += `[fields:${p.itemFields.map((f:any)=>f.name+":"+f.kind+(f.kind==="object"?"{"+f.fields?.map((sf:any)=>sf.name+":"+sf.kind).join(",")+"}" : "")).join(",")}]`;
    if (p.kind === "object" && p.fields) s += `{${p.fields.map((f:any)=>f.name+":"+f.kind).join(",")}}`;
    return s;
  }).join("\n    ");
  console.log(`\n${name}:\n    ${propSummary}`);
}
