/** Manual check for importCode(): paste snippet → tree → export → validate. */
import {
  buildValidators,
  exportSurface,
  getCatalog,
  importCode,
  validate,
} from "../src/index";

declare const process: { exit(code?: number): never };

const SNIPPET = `
<TileContainer
  background="lightSecondary"
  borderRadius="standard"
  dropShadow="subtle"
  padding="4X"
  showBorder
  surface="lightPrimary"
>
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }}
  >
    <Badge backgroundColor="red">
      New
    </Badge>
    <TitleLockup
      eyebrow={{ children: 'Today only' }}
      subtitle={{ children: 'Just $10/mo with select plans. Plus, up to $1,000 when you switch.' }}
      title={{ bold: true, children: 'iPhone 16, now in black.', size: 'title2XSmall' }}
    />
    <ButtonGroup
      alignment="left"
      items={[
        { children: 'Shop now', kind: 'primary' },
        { children: 'Learn more', kind: 'secondary' }
      ]}
    />
  </div>
</TileContainer>
`;

const catalog = getCatalog();
const { surface, warnings } = importCode(SNIPPET, catalog);

console.log("\n● Imported surface tree:");
console.log(JSON.stringify(surface, null, 2));

console.log("\n● Warnings:");
if (warnings.length === 0) console.log("  (none)");
for (const w of warnings) console.log(`  [${w.level}] ${w.context ?? ""} — ${w.message}`);

const a2ui = exportSurface(surface, catalog.catalogId);
console.log("\n● A2UI export:");
console.log(JSON.stringify(a2ui, null, 2));

const result = validate(a2ui, buildValidators());
console.log("\n● Validation:", result.ok ? "VALID ✓" : "INVALID ✗");
if (!result.ok) {
  for (const e of result.errors) console.log(`  ${e.component}#${e.componentId}: ${e.message}`);
  process.exit(1);
}
console.log("");
