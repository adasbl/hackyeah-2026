import { createHash } from 'node:crypto';
import { loadBuffer } from 'cheerio';
import { BOT, inScope, websiteUrl, type SitePolicy } from './policy';

export interface SourceProof {
  url: string;
  excerpt: string;
  contentHash: string;
  retrievedAt: string;
  basis: 'license' | 'permission';
  licenseUrl?: string;
}
export interface SourceAssessment {
  decision: 'allowed' | 'facts_only' | 'blocked' | 'uncertain';
  reason: string;
  origin: string;
  checked: { url: string; outcome: string; retrievedAt: string; contentHash?: string }[];
  proof?: SourceProof;
  policy?: SitePolicy;
}
const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase().replace(/ł/g, 'l').replace(/\s+/g, ' ').trim();
const scope = /(?:\b(?:tresc|tresci|zawartosc|wszystkie informacje|wszystkie dane) (?:na |z )?(?:tej|niniejszej|naszej) (?:stron\w*|witryn\w*|serwis\w*)\b|\b(?:informacje|informacji|dane|danych) o (?:akceptacji |akceptowanych )?kartach sportowych\b|\b(?:all )?content (?:on |of )this (?:site|website)\b)/;
const automation = /\b(?:automatyczn\w* (?:pobierani\w*|odczyt\w*|zbierani\w*)|scraping|automated (?:access|collection|retrieval))\b/;
const ban = /(?:\b(?:zakaz\w*|zabrani\w*|niedozwolon\w*|zabronion\w*|nie zezwalamy|nie wolno|nie mozna|nie dopuszczamy)\b.{0,180}(?:automatyczn\w*|scraping|robot\w*|bot\w*|ponown\w* wykorzyst\w*|kopiow\w*|publikow\w*|eksplorac\w*|tdm)|\b(?:scraping|automated (?:access|collection)|reuse|redistribution|text and data mining|tdm)\b.{0,100}\b(?:prohibited|forbidden|not (?:allowed|permitted))\b|\b(?:automatyczn\w* (?:pobierani\w*|odczyt\w*)|scraping|publikowani\w*|ponown\w* wykorzyst\w*|eksplorac\w*)\b.{0,100}(?:\b(?:zabronion\w*|niedozwolon\w*|wymaga\w* .{0,40}zgod\w*)\b))/;
const ambiguous = /\?|\b(?:przyklad\w*|przykladow\w*|example|hipotetyczn\w*|planowane|w przyszlosci|jezeli|jesli|pod warunkiem|z wyjatkiem|z wylaczeniem|chyba ze|except|unless|nie (?:jest|sa)|nie obejmuje)\b/;
const permission = /\b(?:zezwalamy|dopuszczamy|dozwolone jest)\b/;
const publishing = /\b(?:publikowani\w*|publikacj\w*|rozpowszechni\w*)\b/;
const commercial = /\bkomercyjn\w* (?:wykorzystani\w*|uzyci\w*)\b/;
const unconditional = /\bbez (?:dodatkowych warunkow|ograniczen)\b/;
const licenseDeclaration = /\b(?:(?:sa|jest) (?:udostepnian\w*|udostepnion\w*|objete|objeta|na licencji|dostepn\w*|licencjonowan\w*)|(?:is|are) (?:licensed|released|dedicated|available))\b.{0,80}\bcc0\b/;
const assetScope = /\b(?:zdjec\w*|fotografi\w*|ikon\w*|logo\w*|obraz\w*|image\w*|photo\w*|illustrat\w*|software|oprogramowan\w*|cc[- ]?by)\b/;
const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/';

/** A conservative recognizer, not a legal opinion. A badge or robots Allow is insufficient. */
export function inspectSourcePage(body: Buffer, url: string, retrievedAt: string, contentType = '') {
  const charset = contentType.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1];
  const $ = loadBuffer(body, { encoding: { defaultEncoding: 'utf-8', transportLayerEncodingLabel: charset } });
  const contentHash = createHash('sha256').update(body).digest('hex');
  const robotMeta = $(`meta[name="robots"], meta[name="${BOT}"]`).map((_, el) => $(el).attr('content') ?? '').get().join(',');
  const restricted = /\b(?:noarchive|nosnippet|noai)\b/i.test(robotMeta)
    || $('meta[name="tdm-reservation"]').toArray().some((el) => $(el).attr('content')?.trim() === '1');
  const links: string[] = [];
  if (!/\b(?:nofollow|none)\b/i.test(robotMeta)) {
    $('a[href]').each((_, el) => {
      if (/\bnofollow\b/i.test($(el).attr('rel') ?? '')) return;
      const href = $(el).attr('href') ?? '';
      if (!/(regulamin|licencj|warunki|terms|licen[sc]e|copyright|prawa-autorskie|polityka-prywatnosci|privacy)/i.test(normalize(href + ' ' + $(el).text()))) return;
      try {
        const target = websiteUrl(new URL(href, url).href);
        const site = { origin: new URL(url).origin, allowedPaths: ['/'] };
        if (inScope(target, site) && !/\.(?:pdf|jpg|png|zip|docx?)$/i.test(target.pathname)) links.push(target.href);
      } catch { /* Only public, same-origin HTML paths are assessed. */ }
    });
  }
  $('script, style, noscript, template, svg, nav, pre, code, blockquote, [hidden], [aria-hidden="true"], [style*="display:none"], [style*="display: none"]').remove();
  const text = normalize($('body').text());
  const blocked = ban.test(text);
  const proofs: SourceProof[] = [];
  if (!restricted && !blocked) {
    $('p, li, footer, div, section').each((_, el) => {
      // Do not join one block's scope with another block's unrelated asset licence.
      if ($(el).find('p, li, footer, div, section').length) return;
      const block = $(el).text().replace(/\s+/g, ' ').trim();
      if (!block || block.length > 1000) return;
      const flat = normalize(block);
      if (!scope.test(flat) || ambiguous.test(flat)) return;
      const licensed = licenseDeclaration.test(flat) && !assetScope.test(flat) && $(el).find('a[href]').toArray().some((link) => {
        try { const target = new URL($(link).attr('href')!, url); return target.href.replace(/^http:/, 'https:') === CC0; }
        catch { return false; }
      });
      const permitted = permission.test(flat) && automation.test(flat) && publishing.test(flat)
        && commercial.test(flat) && unconditional.test(flat) && !/\b(?:niekomercyjn\w*|nie (?:zezwalamy|dopuszczamy))\b/.test(flat);
      if (licensed || permitted) proofs.push({ url, excerpt: block, contentHash, retrievedAt,
        basis: licensed ? 'license' : 'permission', ...(licensed ? { licenseUrl: CC0 } : {}) });
    });
  }
  return { contentHash, restricted, blocked, proofs, links: [...new Set(links)],
    nofollow: /\b(?:nofollow|none)\b/i.test(robotMeta) };
}

export function discoveredSite(origin: string, proof: SourceProof): SitePolicy {
  const date = new Date(proof.retrievedAt);
  return { origin, basis: proof.basis,
    evidence: `${proof.url} | sha256:${proof.contentHash} | ${proof.excerpt}`,
    reviewedAt: date.toISOString().slice(0, 10),
    validUntil: new Date(date.getTime() + 30 * 86_400_000).toISOString().slice(0, 10),
    allowedPaths: ['/'], minDelayMs: 3000, maxPages: 5 };
}

/** An operational factual-reading decision, NOT a licence or inferred owner permission. */
export function publicFactsSite(origin: string, retrievedAt: string): SitePolicy {
  const date = new Date(retrievedAt);
  return { origin, basis: 'public_facts', evidence: 'Limited public facts; no explicit restriction detected in bounded policy inspection; not a legal clearance',
    reviewedAt: date.toISOString().slice(0, 10),
    validUntil: new Date(date.getTime() + 30 * 86_400_000).toISOString().slice(0, 10),
    allowedPaths: ['/'], minDelayMs: 3000, maxPages: 5 };
}
