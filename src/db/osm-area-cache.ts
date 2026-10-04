import { z } from 'zod';
import { slugify } from '../lib/catalog';

export const osmPointSchema = z.object({ x: z.number().finite().min(-180).max(180), y: z.number().finite().min(-90).max(90) }).strict();
const ringSchema = z.array(osmPointSchema).min(4).refine((ring) => ring[0].x === ring.at(-1)!.x && ring[0].y === ring.at(-1)!.y);
export const osmBoundarySchema = z.object({
  osmType: z.enum(['way', 'relation']), osmId: z.number().positive().int().safe(),
  name: z.string().trim().min(1), citySlug: z.string().min(1),
  bounds: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]),
  outer: z.array(ringSchema).min(1), inner: z.array(ringSchema),
}).strict().refine((b) => {
  if (slugify(b.name) !== b.citySlug) return false;
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of b.outer) for (const p of ring) {
    bounds[0] = Math.min(bounds[0], p.x); bounds[1] = Math.min(bounds[1], p.y);
    bounds[2] = Math.max(bounds[2], p.x); bounds[3] = Math.max(bounds[3], p.y);
  }
  return bounds.every((n, i) => n === b.bounds[i])
    && (Math.floor(bounds[2] * 10) - Math.floor(bounds[0] * 10) + 1)
      * (Math.floor(bounds[3] * 10) - Math.floor(bounds[1] * 10) + 1) <= 10_000;
});
