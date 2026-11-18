import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/** Region keys (doc 9 §2). Somaliland and Somalia are separate, selectable regions. */
export const REGION_KEYS = ['somaliland', 'somalia', 'remote'] as const;
export type RegionKey = (typeof REGION_KEYS)[number];

export const isRegionKey = (value: unknown): value is RegionKey =>
  typeof value === 'string' && (REGION_KEYS as readonly string[]).includes(value);

/**
 * `regions` collection: the city list per region is a filter suggestion that
 * admins manage in the database (doc 9 §2), never hard-coded in the apps.
 */
const regionSchema = new Schema(
  {
    key: { type: String, enum: REGION_KEYS, required: true, unique: true },
    /** Display order in the apps. */
    order: { type: Number, required: true },
    cities: { type: [String], default: [] },
  },
  { timestamps: true },
);

export type RegionDocument = HydratedDocument<InferSchemaType<typeof regionSchema>>;
export const Region = model('Region', regionSchema);

/** Starting city lists from doc 9 §2; written once, then edited by admins. */
export const DEFAULT_REGIONS: { key: RegionKey; order: number; cities: string[] }[] = [
  {
    key: 'somaliland',
    order: 1,
    cities: ['Hargeisa', 'Berbera', 'Burao', 'Borama', 'Erigavo', 'Las Anod'],
  },
  {
    key: 'somalia',
    order: 2,
    cities: ['Mogadishu', 'Garowe', 'Bosaso', 'Kismayo', 'Baidoa', 'Beledweyne', 'Galkayo'],
  },
  { key: 'remote', order: 3, cities: [] },
];

export function toPublicRegion(region: RegionDocument) {
  return { key: region.key, order: region.order, cities: region.cities };
}
