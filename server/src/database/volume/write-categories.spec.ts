import type { ProductCategoriesService } from '../../modules/products/product-categories.service';
import { PRODUCT_TYPES } from '../schema';
import { VOLUMES } from './scale';
import {
  CATEGORY_COUNT,
  type Kind,
  placeAt,
  typeAt,
  writeCategories,
} from './write-categories';

/** The kind of the item at a position, as the catalogue lays them out. */
function kindAt(scale: keyof typeof VOLUMES, index: number): Kind {
  const { products, materialShare, packagingShare } = VOLUMES[scale];
  const materials = Math.round(products * materialShare);
  const packaging = Math.round(products * packagingShare);
  if (index <= materials) return 'material';
  return index <= materials + packaging ? 'packaging' : 'good';
}

/** A stand-in that records the tree as written, and answers each its id. */
function recorder() {
  const created: { id: string; name: string; parentId?: string | null }[] = [];
  const service = {
    create: (input: { name: string; parentId?: string | null }) => {
      const made = { ...input, id: `category-${created.length}` };
      created.push(made);
      return Promise.resolve(made);
    },
  } as unknown as ProductCategoriesService;
  return { created, service };
}

/**
 * The volume seed's tree and types (ADR-092): thirty categories three
 * levels deep, every type among the items, a category on four in five.
 */
describe('the volume seed’s categories and types', () => {
  it('writes about thirty categories, three levels deep, each name once under its parent', async () => {
    const { created, service } = recorder();
    await writeCategories(service);

    expect(created).toHaveLength(CATEGORY_COUNT);
    expect(CATEGORY_COUNT).toBeGreaterThanOrEqual(28);
    expect(CATEGORY_COUNT).toBeLessThanOrEqual(32);

    const parentOf = new Map(created.map((each) => [each.id, each.parentId]));
    const depth = (id: string): number => {
      const parent = parentOf.get(id);
      return parent ? 1 + depth(parent) : 1;
    };
    expect(Math.max(...created.map((each) => depth(each.id)))).toBe(3);

    const keys = created.map((each) => `${each.parentId ?? ''}/${each.name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(Object.keys(VOLUMES) as (keyof typeof VOLUMES)[])(
    'gives every type items at %s, and the others no extra draws',
    (scale) => {
      const seen = new Set<string>();
      for (let index = 1; index <= VOLUMES[scale].products; index++) {
        seen.add(typeAt(kindAt(scale, index), index));
      }
      expect([...seen].sort()).toEqual([...PRODUCT_TYPES].sort());
    },
  );

  it.each(Object.keys(VOLUMES) as (keyof typeof VOLUMES)[])(
    'puts a category on four in five items at %s, and items on every leaf',
    async (scale) => {
      const { created, service } = recorder();
      const categoryOf = await writeCategories(service);
      const used = new Set<string>();
      let categorised = 0;
      const { products } = VOLUMES[scale];

      for (let index = 1; index <= products; index++) {
        const type = typeAt(kindAt(scale, index), index);
        const id = categoryOf(type, index);
        if (id) {
          categorised++;
          used.add(id);
        }
      }

      expect(categorised / products).toBeCloseTo(0.8, 2);
      // Every leaf holds items.
      const leaves = created.filter(
        (each) => !created.some((other) => other.parentId === each.id),
      );
      for (const leaf of leaves) expect(used, leaf.name).toContain(leaf.id);
    },
  );

  it('leaves Uncategorised to every fifth item, whatever its type', () => {
    for (const type of PRODUCT_TYPES) {
      expect(placeAt(type, 5)).toBeNull();
      expect(placeAt(type, 10)).toBeNull();
      expect(placeAt(type, 11)).not.toBeNull();
    }
  });
});
