import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';

/**
 * The pages `npm run diagrams` writes into docs/tables/ (ADR-086): one
 * Mermaid `erDiagram` per area, of its tables, their columns and their
 * foreign keys, and an index. Kept apart from the files so each rule is a
 * unit test.
 */

/**
 * The tenancy column, left out of every diagram with its foreign key to
 * organizations: nearly every table has it (ADR-003).
 */
const TENANT = 'organization_id';

/** A table as getTableConfig reads it: its name, columns and keys. */
type TableConfig = ReturnType<typeof getTableConfig>;

/** What a diagram reads of a column. */
interface Column {
  name: string;
  notNull: boolean;
  primary: boolean;
  getSQLType(): string;
}

/**
 * Where docs/tables/README.md sends a reader for why: ADR-086's plan,
 * which these pages follow.
 */
const ADR_086 =
  '../adr/0086-docs-as-code.md#amendment-october-2026--part-2-as-planned';

export interface TablePages {
  /** Each page by its file name in docs/tables/, README.md the index. */
  pages: Map<string, string>;
  /** Why no page is written: each table in no area, and the like. */
  failures: string[];
}

/**
 * The pages for the tables among `schema`'s exports, each in the one area
 * `areasOf` gives it, the areas in the order `areas` lists them. A table
 * in no area or in two, a name that is no table, or an area `areas` lacks
 * is a failure, and then there are no pages.
 */
export function tablePages(
  schema: Record<string, unknown>,
  areasOf: Record<string, readonly string[]>,
  areas: readonly string[],
): TablePages {
  const tables = Object.values(schema)
    .filter((value): value is PgTable => is(value, PgTable))
    .map((table) => getTableConfig(table))
    .sort((a, b) => (a.name < b.name ? -1 : 1));
  const names = new Set(tables.map((table) => table.name));

  const failures: string[] = [];
  const areaOf = new Map<string, string>();
  for (const [area, listed] of Object.entries(areasOf)) {
    if (!areas.includes(area)) failures.push(`${area}: not an area`);
    for (const name of listed) {
      const before = areaOf.get(name);
      if (before) {
        failures.push(`${name}: in two areas, ${before} and ${area}`);
      } else if (!names.has(name)) {
        failures.push(`${name}: no such table in the schema`);
      } else {
        areaOf.set(name, area);
      }
    }
  }
  for (const table of tables) {
    if (!areaOf.has(table.name)) failures.push(`${table.name}: in no area`);
  }
  if (failures.length > 0) return { pages: new Map(), failures };

  const pages = new Map<string, string>();
  const drawn = areas.filter((area) =>
    tables.some((table) => areaOf.get(table.name) === area),
  );
  pages.set('README.md', index(tables, areaOf, drawn));
  for (const area of drawn) {
    const own = tables.filter((table) => areaOf.get(table.name) === area);
    pages.set(`${area}.md`, areaPage(area, own, areaOf, drawn));
  }
  return { pages, failures };
}

/** A foreign key as a line draws it: the table it points to, its columns. */
interface Line {
  target: string;
  columns: Column[];
}

/**
 * A table's foreign keys, each without its organization_id column; a key of
 * that column alone is gone.
 */
function linesOf(table: TableConfig): Line[] {
  return table.foreignKeys
    .map((key) => {
      const reference = key.reference();
      return {
        target: getTableConfig(reference.foreignTable).name,
        columns: reference.columns.filter((column) => column.name !== TENANT),
      };
    })
    .filter((line) => line.columns.length > 0);
}

/**
 * A column's SQL type as Mermaid reads one word: `timestamptz` for
 * `timestamp with time zone`, `numeric(18,4)` with no space.
 */
const typeOf = (column: Column): string =>
  column
    .getSQLType()
    .replace('timestamp with time zone', 'timestamptz')
    .replace(/,\s+/g, ',')
    .replace(/\s+/g, '_');

/** One area's page: its diagram, then the other areas' tables it draws bare. */
function areaPage(
  area: string,
  own: TableConfig[],
  areaOf: Map<string, string>,
  areas: readonly string[],
): string {
  const boxes = own.flatMap((table) => {
    const keyed = new Set(
      table.primaryKeys.flatMap((key) => key.columns.map(({ name }) => name)),
    );
    const foreign = new Set(
      linesOf(table).flatMap(({ columns }) => columns.map(({ name }) => name)),
    );
    return [
      `  ${table.name} {`,
      ...table.columns
        .filter((column) => column.name !== TENANT)
        .map((column) => {
          const keys = [
            ...(column.primary || keyed.has(column.name) ? ['PK'] : []),
            ...(foreign.has(column.name) ? ['FK'] : []),
          ];
          const marks = keys.length > 0 ? ` ${keys.join(', ')}` : '';
          return `    ${typeOf(column)} ${column.name}${marks}`;
        }),
      '  }',
    ];
  });

  const bare = new Map<string, Set<string>>();
  const lines = own.flatMap((table) =>
    linesOf(table).map(({ target, columns }) => {
      const theirs = areaOf.get(target) as string;
      if (theirs !== area) {
        bare.set(theirs, (bare.get(theirs) ?? new Set()).add(target));
      }
      const one = columns.every((column) => column.notNull) ? '||' : 'o|';
      const label = columns.map(({ name }) => name).join(', ');
      return `  ${table.name} }o--${one} ${target} : "${label}"`;
    }),
  );

  const others = areas
    .filter((other) => bare.has(other))
    .map((other) => {
      const named = [...(bare.get(other) as Set<string>)].sort();
      return `- [${other}](${other}.md): ${named.map((name) => `\`${name}\``).join(', ')}`;
    });

  return [
    `# Tables: ${area}`,
    '',
    `The tables of ${area} and their foreign keys, written from the Drizzle`,
    'schema by `npm run diagrams` in `server/`. [The index](README.md) says',
    'how to read the diagram.',
    '',
    '```mermaid',
    'erDiagram',
    ...boxes,
    ...lines,
    '```',
    ...(others.length > 0
      ? ['', 'From other areas, drawn bare:', '', ...others]
      : []),
    '',
  ].join('\n');
}

/** docs/tables/README.md: how to read a diagram, then each area's tables. */
function index(
  tables: TableConfig[],
  areaOf: Map<string, string>,
  areas: readonly string[],
): string {
  const code = (names: string[]): string =>
    names.map((name) => `\`${name}\``).join(', ');
  const untenanted = tables
    .filter((table) => !table.columns.some(({ name }) => name === TENANT))
    .map(({ name }) => name);
  const rows = areas.map((area) => {
    const own = tables
      .filter((table) => areaOf.get(table.name) === area)
      .map(({ name }) => name);
    return `| [${area}](${area}.md) | ${code(own)} |`;
  });

  return [
    '# Tables, by area',
    '',
    'Every table in the database, one diagram per area: its tables, their',
    'columns and their foreign keys, written from the Drizzle schema in',
    '`server/src/database/schema/` by `npm run diagrams` in `server/`',
    `([ADR-086](${ADR_086})).`,
    'Never edited by hand: `scripts/verify.sh` fails when a page is not what',
    "the command writes, or when a table is in no area. Each table's area is",
    "in `server/src/cli/table-diagrams.ts`, named as the ADRs' areas are.",
    '',
    '## How to read a diagram',
    '',
    "- **A box with columns** is a table of the area: each column's type and",
    "  name, `PK` on its primary key and `FK` on a foreign key's.",
    '- **A box with none** is a table of another area, which one of the',
    "  area's tables points to; the list under the diagram links its area.",
    '- **A line** is a foreign key, labelled with its columns, drawn once, in',
    '  the area of the table that holds it. `}o--||` reads "many rows point',
    '  to one", and `}o--o|` "many rows point to one or none": the column may',
    '  be empty.',
    '- **`organization_id` is left out,** with its foreign key to',
    '  `organizations`: every query is scoped to one organization',
    '  ([ADR-003](../adr/0003-multi-tenancy.md)), and every table has it but',
    `  ${untenanted.length}: ${code(untenanted)}.`,
    '',
    '## The areas',
    '',
    '| Area | Tables |',
    '| --- | --- |',
    ...rows,
    '',
  ].join('\n');
}
