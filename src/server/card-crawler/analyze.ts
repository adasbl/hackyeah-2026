import { createHash } from 'node:crypto';
import { loadBuffer } from 'cheerio';
import type { CardProviderSlug } from '@repo/types';
import { inScope, websiteUrl, type SitePolicy } from './policy';

export interface Venue {
  id: string; slug: string; name: string; website: string | null;
  city: string | null; addressStreet: string | null; addressHouseNumber: string | null; phone: string | null;
}
export interface Evidence {
  provider: CardProviderSlug;
  suggestedStatus: 'accepted' | 'conditional' | 'not_accepted' | 'unknown';
  sourceUrl: string; excerpt: string; contentHash: string; retrievedAt: string;
  identitySignals: string[]; reasons: string[]; conditions: string | null;
  decision: 'eligible' | 'ambiguous';
}
const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase().replace(/ł/g, 'l').replace(/\s+/g, ' ').trim();
const PROVIDERS: [CardProviderSlug, RegExp][] = [
  ['multisport', /\bmulti[\s-]?sport\b/i], ['beactive', /\bbe[\s-]?active\b/i],
  ['medicover-sport', /\bmedicover\s+sport\b/i], ['pzu-sport', /\bpzu\s+sport\b/i],
];
const AFFIRMATIVE = /\b(?:akceptujemy|honorujemy|przyjmujemy|obslugujemy|respektujemy|akceptuje|honoruje|przyjmuje|akceptowane|honorowane)\b|\b(?:mozna|mozesz) (?:korzystac|wejsc)|\bwejscie (?:z|na) kart/;
const NEGATIVE = /\b(?:nie|bez|brak|oprocz|poza|wyjatkiem|ale|jednak|natomiast|niestety)\b|\b(?:zakonczy|rezygn|zawiesz)\w*\b/;
const CLEAR_REJECTION = /\bnie (?:akceptujemy|honorujemy|przyjmujemy|obslugujemy|akceptuje|honoruje|przyjmuje)\b/;
const UNCERTAIN = /\?|\b(?:czy|kiedys|dawniej|przestali|plan\w*|wkrotce|bedziemy|mozliwe|zamierz\w*|archiw\w*|aktualnosci)\b/;
const CONDITIONS = /\b(?:doplat\w*|rezerwac\w*|limit\w*|minut\w*|tylko|wylacznie|plus|classic|light|student|senior|kids|do \d|od \d)\b/;

export function identitySignals(text: string, venue: Venue): string[] {
  const flat = normalize(text), signals: string[] = [];
  const phone = venue.phone?.replace(/\D/g, '').slice(-9);
  const phones = (text.match(/\+?\d[\d ()-]{7,}\d/g) ?? []).map((value) => value.replace(/\D/g, ''));
  if (phone?.length === 9 && phones.some((value) => [9, 11].includes(value.length) && value.endsWith(phone))) signals.push('phone');
  if (venue.city && flat.includes(normalize(venue.city))) signals.push('city');
  if (venue.addressStreet && venue.addressHouseNumber) {
    const street = normalize(venue.addressStreet).replace(/^(?:ul\.?|ulica)\s+/, '');
    const house = normalize(venue.addressHouseNumber);
    const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (street.length >= 3 && new RegExp(`${escape(street)}\\s+${escape(house)}(?=$|[\\s,;])`).test(flat)) signals.push('street_house_number');
  }
  if (normalize(venue.name).length >= 5 && flat.includes(normalize(venue.name))) signals.push('name');
  return signals;
}

/** Explicit statements can be published automatically when identity and context agree. */
export function analyzeHtml(body: Buffer, sourceUrl: string, venue: Venue, site: SitePolicy,
  retrievedAt = new Date().toISOString(), contentType = '') {
  const charset = contentType.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1];
  const $ = loadBuffer(body, { encoding: { defaultEncoding: 'utf-8', transportLayerEncodingLabel: charset } });
  const contentHash = createHash('sha256').update(body).digest('hex');
  const robotMeta = $('meta[name="robots"], meta[name="FitPassEvidenceBot"]').map((_, el) => $(el).attr('content') ?? '').get().join(',').toLowerCase();
  if (/\b(?:noarchive|nosnippet|noai)\b/.test(robotMeta)
    || $('meta[name="tdm-reservation"]').toArray().some((el) => $(el).attr('content')?.trim() === '1'))
    return { evidence: [] as Evidence[], links: [] as string[], restricted: true, contentHash };
  const links: string[] = [];
  if (!/\b(?:nofollow|none)\b/.test(robotMeta)) {
    $('a[href]').each((_, el) => {
      if (/\bnofollow\b/i.test($(el).attr('rel') ?? '')) return;
      const href = $(el).attr('href') ?? '', label = normalize($(el).text());
      if (!/(kontakt|cennik|oferta|regulamin|faq|partner|kart|multisport|beactive|medicover|pzu)/.test(normalize(href) + ' ' + label)) return;
      try {
        const url = websiteUrl(new URL(href, sourceUrl).href);
        if (inScope(url, site) && !/\.(?:pdf|jpg|png|zip|docx?)$/i.test(url.pathname)) links.push(url.href);
      } catch { /* Unsupported URLs are never followed. */ }
    });
  }
  $('script, style, noscript, template, svg, nav, [hidden], [aria-hidden="true"], [style*="display:none"], [style*="display: none"]').remove();
  const datedContent = $('time[datetime]').toArray().some((el) => {
    const date = Date.parse($(el).attr('datetime') ?? '');
    return Number.isFinite(date) && Date.parse(retrievedAt) - date > 90 * 86_400_000;
  });
  const identityText = $('body').text();
  const signals = identitySignals(identityText, venue);
  $('footer, header, aside').remove();
  $('br').replaceWith('\n');
  // Preserve block boundaries. Otherwise nested HTML can concatenate unrelated claims.
  $('p, li, tr, div, section, h1, h2, h3, h4, td').append('\n');
  const sentences = $('body').text().split(/[\n.!;]+/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const evidence: Evidence[] = [];
  for (let index = 0; index < sentences.length; index++) {
    const sentence = sentences[index];
    const normalized = normalize(sentence);
    for (const [provider, pattern] of PROVIDERS) {
      if (!pattern.test(normalized)) continue;
      const reasons: string[] = [];
      let suggestedStatus: Evidence['suggestedStatus'] = 'unknown';
      if (sentence.length > 240 || UNCERTAIN.test(normalized)) reasons.push('ambiguous_or_historical');
      else if (CLEAR_REJECTION.test(normalized) && !AFFIRMATIVE.test(normalized.replace(CLEAR_REJECTION, '')))
        suggestedStatus = 'not_accepted';
      else if (AFFIRMATIVE.test(normalized) && !NEGATIVE.test(normalized))
        suggestedStatus = CONDITIONS.test(normalized) ? 'conditional' : 'accepted';
      else reasons.push('mention_without_unambiguous_acceptance');
      if (!(signals.includes('street_house_number') && signals.includes('city')) && !signals.includes('phone'))
        reasons.push('branch_identity_unconfirmed');
      if (!signals.includes('name')) reasons.push('venue_name_unconfirmed');
      if (datedContent) reasons.push('dated_content');
      if (/\b(?:nasze kluby|inne oddzialy|wybrane (?:kluby|obiekty)|wszystkich oddzialach)\b/.test(normalize(identityText)))
        reasons.push('multiple_branch_context');
      const context = [sentence];
      for (const next of sentences.slice(index + 1, index + 3)) {
        if (!CONDITIONS.test(normalize(next)) || PROVIDERS.some(([other, expression]) => other !== provider && expression.test(normalize(next)))) break;
        context.push(next);
      }
      const conditions = CONDITIONS.test(normalize(context.join(' '))) ? context.join('. ') : null;
      if (conditions && PROVIDERS.filter(([, expression]) => expression.test(normalized)).length > 1)
        reasons.push('provider_conditions_ambiguous');
      if (conditions && suggestedStatus === 'accepted') suggestedStatus = 'conditional';
      if (conditions && conditions.length > 600) reasons.push('conditions_too_long');
      if (context.slice(1).some((part) => NEGATIVE.test(normalize(part)) || UNCERTAIN.test(normalize(part))))
        reasons.push('ambiguous_conditions');
      evidence.push({ provider, suggestedStatus, sourceUrl, excerpt: sentence.slice(0, 240), retrievedAt,
        contentHash, identitySignals: signals, reasons, conditions: conditions?.slice(0, 600) ?? null,
        decision: suggestedStatus !== 'unknown' && !reasons.length ? 'eligible' : 'ambiguous' });
    }
  }
  return { evidence, links: [...new Set(links)], restricted: false, contentHash };
}
