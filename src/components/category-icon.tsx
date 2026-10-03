import { Dumbbell, Flower2, HeartPulse, LayoutGrid, Mountain, Target, Waves, type LucideIcon } from 'lucide-react';
import type { CategorySlug } from '@repo/types';
import { categoryOf } from '@/lib/catalog';

const ICONS: Record<CategorySlug, LucideIcon> = {
  silownia: Dumbbell,
  basen: Waves,
  fitness: HeartPulse,
  joga: Flower2,
  wspinaczka: Mountain,
  squash: Target,
};

/** Sama ikona kategorii (albo „wszystkie”, gdy brak kategorii) */
export function CategoryGlyph({ category, className = 'size-4' }: { category?: CategorySlug; className?: string }) {
  const Icon = category ? ICONS[category] : LayoutGrid;
  return <Icon className={className} strokeWidth={2} aria-hidden />;
}

/** Ikona w kolorowym, gradientowym kafelku */
export function CategoryBadge({ category, size = 'md' }: { category: CategorySlug; size?: 'sm' | 'md' | 'lg' }) {
  const { gradient } = categoryOf(category);
  const box = { sm: 'size-9 rounded-lg', md: 'size-12 rounded-xl', lg: 'size-16 rounded-2xl' }[size];
  const icon = { sm: 'size-4', md: 'size-6', lg: 'size-8' }[size];
  return (
    <span className={`relative grid shrink-0 place-items-center bg-gradient-to-br text-white shadow-lg shadow-slate-900/10 ${gradient} ${box}`}>
      <span className="absolute inset-0 rounded-[inherit] bg-gradient-to-b from-white/25 to-transparent" aria-hidden />
      <CategoryGlyph category={category} className={`relative ${icon}`} />
    </span>
  );
}
