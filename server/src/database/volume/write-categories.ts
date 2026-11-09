import type { ProductCategoriesService } from '../../modules/products/product-categories.service';
import type { ProductType } from '../schema';

/**
 * The catalogue's tree and its types (ADR-092), for the volume seed.
 *
 * About thirty categories, three levels deep: three roots of three groups
 * of two. Names are unique under one parent, as the table requires, and
 * the tree is the same for every organization and both scales.
 */
const TREE: readonly (readonly [
  string,
  readonly (readonly [string, readonly string[]])[],
])[] = [
  [
    'Supplements',
    [
      ['Vitamins', ['Single vitamins', 'Multivitamins']],
      ['Minerals', ['Magnesium', 'Zinc and iron']],
      ['Herbal', ['Calming herbs', 'Immune herbs']],
    ],
  ],
  [
    'Ingredients',
    [
      ['Extracts', ['Root extracts', 'Flower extracts']],
      ['Powders', ['Mineral powders', 'Herbal powders']],
      ['Oils', ['Carrier oils', 'Essential oils']],
    ],
  ],
  [
    'Packaging and supplies',
    [
      ['Bottles', ['Glass bottles', 'Plastic bottles']],
      ['Cartons and labels', ['Shipping cartons', 'Labels']],
      ['Plant and office', ['Cleaning and safety', 'Machinery']],
    ],
  ],
];

/** The tree a type's items sit under: goods and samples, materials, the rest. */
const ROOT_OF: Record<ProductType, number> = {
  good: 0,
  sample: 0,
  material: 1,
  packaging: 2,
  supply: 2,
  equipment: 2,
};

/** How an item is bought and sold, which the seed's bookkeeping follows. */
export type Kind = 'good' | 'material' | 'packaging';

/**
 * The type an item is written with, by its position in the catalogue, so
 * every type has items and the random source is never drawn from: the year
 * after is the data it was before, and the budgets still compare. A fifth
 * of the packaging is supplies, a twentieth of the goods samples, a
 * fiftieth equipment. The type forks nothing but stock value (ADR-023,
 * ADR-092), so what is bought, made and sold stays as it was.
 */
export function typeAt(kind: Kind, index: number): ProductType {
  if (kind === 'packaging' && index % 5 === 1) return 'supply';
  if (kind === 'good' && index % 50 === 2) return 'equipment';
  if (kind === 'good' && index % 20 === 3) return 'sample';
  return kind;
}

/**
 * Where an item sits, by position, as the type is chosen: four in five
 * have a category, and of those one in seven sits on a group rather than
 * on a leaf, so a category has items of its own and items beneath it.
 * Null is Uncategorised; otherwise the root, the group and the leaf, the
 * leaf null where the item sits on the group.
 */
export function placeAt(
  type: ProductType,
  index: number,
): { root: number; group: number; leaf: number | null } | null {
  if (index % 5 === 0) return null;

  const slot = index % 6;
  return {
    root: ROOT_OF[type],
    group: slot % 3,
    leaf: index % 7 === 0 ? null : Math.floor(slot / 3),
  };
}

/** How many categories the tree holds. */
export const CATEGORY_COUNT = TREE.reduce(
  (count, [, groups]) =>
    count + 1 + groups.reduce((n, [, leaves]) => n + 1 + leaves.length, 0),
  0,
);

/** Writes the tree, and answers for an item the category it sits in. */
export async function writeCategories(
  categories: ProductCategoriesService,
): Promise<(type: ProductType, index: number) => string | null> {
  const ids = new Map<string, string>();

  for (const [rootIndex, [root, groups]] of TREE.entries()) {
    const top = await categories.create({ name: root });
    ids.set(`${rootIndex}`, top.id);

    for (const [groupIndex, [group, leaves]] of groups.entries()) {
      const middle = await categories.create({
        name: group,
        parentId: top.id,
      });
      ids.set(`${rootIndex}.${groupIndex}`, middle.id);

      for (const [leafIndex, leaf] of leaves.entries()) {
        const bottom = await categories.create({
          name: leaf,
          parentId: middle.id,
        });
        ids.set(`${rootIndex}.${groupIndex}.${leafIndex}`, bottom.id);
      }
    }
  }

  return (type, index) => {
    const place = placeAt(type, index);
    if (!place) return null;

    const key =
      place.leaf === null
        ? `${place.root}.${place.group}`
        : `${place.root}.${place.group}.${place.leaf}`;
    const id = ids.get(key);
    if (!id) throw new Error(`The seed's tree has no category ${key}`);
    return id;
  };
}
