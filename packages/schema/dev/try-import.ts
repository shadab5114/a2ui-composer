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

const MAP_SNIPPET = `
const stackTiles = [
  { badge: 'New',  eyebrow: 'today only',   title: 'iPhone 16, now in black.',     subtitle: 'Just $10/mo with select plans.', ariaLabel: 'iPhone 16 deal' },
  { badge: 'Sale', eyebrow: 'limited offer', title: 'iPad Pro, more power.',         subtitle: 'From $999 with Apple M4.',        ariaLabel: 'iPad Pro deal' },
  { badge: 'Hot',  eyebrow: 'best seller',   title: 'MacBook Air, thin & light.',    subtitle: 'From $1,099 with M3 chip.',       ariaLabel: 'MacBook Air deal' },
];

<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
  {stackTiles.map((tile) => (
    <TileletComponent
      key={tile.ariaLabel}
      background="lightSecondary"
      padding="4X"
      badge={{ children: tile.badge }}
      eyebrow={{ children: tile.eyebrow }}
      title={{ primitive: 'h2', bold: true, size: 'title2XSmall', children: tile.title }}
      subtitle={{ primitive: 'span', children: tile.subtitle }}
      image={{ src: 'https://example.com/x.jpg', alt: tile.ariaLabel, width: '156px', height: '118px', borderRadius: '16px', showBorder: true }}
      href="https://www.verizon.com/"
      target="_blank"
      showBorder
      dropShadow="subtle"
      directionalIcon={{ name: 'right-arrow' }}
      ariaLabel={tile.ariaLabel}
    />
  ))}
</div>
`;

const catalog = getCatalog();

function run(label: string, code: string): void {
  console.log(`\n════════ ${label} ════════`);
  const { surface, warnings } = importCode(code, catalog);

  const types = Object.values(surface.nodes).map((n) => n.type).sort();
  console.log("● Node types:", types.join(", "));

  console.log("● Warnings:");
  if (warnings.length === 0) console.log("  (none)");
  for (const w of warnings) console.log(`  [${w.level}] ${w.context ?? ""} — ${w.message}`);

  const a2ui = exportSurface(surface, catalog.catalogId);
  const result = validate(a2ui, buildValidators());
  console.log("● Validation:", result.ok ? "VALID ✓" : "INVALID ✗");
  if (!result.ok) {
    for (const e of result.errors) console.log(`  ${e.component}#${e.componentId}: ${e.message}`);
    process.exit(1);
  }
}

run("Basic snippet", SNIPPET);
run("Static .map + grid + alias", MAP_SNIPPET);

// Dump the unrolled tree for inspection.
console.log("\n● Unrolled .map tree:");
console.log(JSON.stringify(importCode(MAP_SNIPPET, catalog).surface, null, 2));
console.log("");
