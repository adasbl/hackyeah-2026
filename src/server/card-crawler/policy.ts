import { z } from 'zod';

export const BOT = 'FitPassEvidenceBot';

/** robots.txt is a technical restriction, not permission to reuse content. */
export const crawlPolicySchema = z.object({
  version: z.literal(1),
  contactUrl: z.string().url().startsWith('https://').optional(),
  sites: z.array(z.object({
    origin: z.string().url().refine((value) => {
      try { return new URL(value).origin === value && ['http:', 'https:'].includes(new URL(value).protocol); }
      catch { return false; }
    }, 'Use an exact origin, without a trailing slash'),
    basis: z.enum(['permission', 'license', 'reviewed_terms', 'public_facts']),
    evidence: z.string().trim().min(10),
    reviewedAt: z.iso.date(),
    validUntil: z.iso.date(),
    allowedPaths: z.array(z.string().startsWith('/').refine((path) => !/[?#\\]/.test(path))).min(1),
    minDelayMs: z.number().int().min(2000).max(60_000).default(3000),
    maxPages: z.number().int().min(1).max(10).default(5),
  }).strict()),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.sites.map((site) => site.origin)).size !== value.sites.length)
    ctx.addIssue({ code: 'custom', message: 'Duplicate origins' });
  for (const site of value.sites) {
    if (site.reviewedAt > site.validUntil)
      ctx.addIssue({ code: 'custom', message: 'Review must precede expiry' });
  }
});
export type CrawlPolicy = z.infer<typeof crawlPolicySchema>;
export type SitePolicy = CrawlPolicy['sites'][number];

export function websiteUrl(value: string): URL {
  const url = new URL(value.includes('://') ? value : `https://${value}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search
    || (url.port && !['80', '443'].includes(url.port))) throw new Error('UNSAFE_URL');
  url.hash = '';
  return url;
}

/** Only canonical aliases, never an arbitrary external domain or an HTTPS downgrade. */
export function canonicalAlias(from: URL, to: URL): boolean {
  return from.hostname.replace(/^www\./, '') === to.hostname.replace(/^www\./, '')
    && !from.port && !to.port && !(from.protocol === 'https:' && to.protocol !== 'https:');
}

export function inScope(url: URL, site: Pick<SitePolicy, 'origin' | 'allowedPaths'>): boolean {
  if (url.origin !== site.origin || url.search || url.username || url.password) return false;
  let path: string;
  try { path = decodeURIComponent(url.pathname); } catch { return false; }
  if (/[\\\x00-\x1f]/.test(path) || /(?:^|\/)\.{1,2}(?:\/|$)/.test(path)) return false;
  if (/(?:^|\/)(?:login|logowanie|konto|account|admin|api|wp-admin|wp-json|rezerwacja|booking)(?:\/|$)/i.test(path)) return false;
  return site.allowedPaths.some((prefix) => {
    const base = prefix.replace(/\/$/, '');
    return !base || path === base || path.startsWith(`${base}/`);
  });
}

export function permissionFor(url: URL, policy: CrawlPolicy, now = new Date()): SitePolicy | null {
  const day = now.toISOString().slice(0, 10);
  return policy.sites.find((site) => site.origin === url.origin && site.reviewedAt <= day
    && site.validUntil >= day && inScope(url, site)) ?? null;
}
