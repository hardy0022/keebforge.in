export type CategoryProp = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  active: boolean;
  _count: { products: number };
};