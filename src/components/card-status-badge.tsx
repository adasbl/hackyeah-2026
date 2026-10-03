import type { CardClaim } from '@repo/types';
import { isExpired, providerName, STATUS_META } from '@/lib/catalog';

export function CardStatusBadge({ claim, size = 'sm' }: { claim: CardClaim; size?: 'sm' | 'md' }) {
  const meta = STATUS_META[claim.status];
  const expired = isExpired(claim.expiresAt);
  return (
    <span
      title={`${providerName(claim.provider)}: ${meta.label}${expired ? ' (informacja wymaga ponownej weryfikacji)' : ''}`}
      className={`inline-flex items-center gap-1.5 rounded-full ring-1 ring-inset ${meta.className} ${
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
      } ${expired ? 'opacity-70' : ''}`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${meta.dot}`} aria-hidden />
      {size === 'sm' ? (
        <>
          <span className="font-medium">{providerName(claim.provider)}</span>
          <span className="sr-only">: {meta.label}</span>
          {claim.status !== 'accepted' && <span aria-hidden>· {meta.short}</span>}
          {expired && <span aria-hidden>⏱</span>}
        </>
      ) : (
        <span className="font-medium">{meta.label}</span>
      )}
    </span>
  );
}
