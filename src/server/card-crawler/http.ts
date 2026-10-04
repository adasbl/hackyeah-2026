import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { loadBuffer } from 'cheerio';
import { websiteUrl } from './policy';

export interface PageResponse { status: number; headers: Record<string, string>; body: Buffer; retrievedAt?: string }
export type Transport = (url: URL, userAgent: string, signal?: AbortSignal) => Promise<PageResponse>;

/** A form's reCAPTCHA script does not mean the public page is an access challenge. */
export function isAccessChallenge(response: PageResponse): boolean {
  if (response.headers['cf-mitigated']?.toLowerCase() === 'challenge') return true;
  const $ = loadBuffer(response.body, { encoding: { defaultEncoding: 'utf-8' } });
  if (/just a moment|attention required|security verification|verify (?:you are )?human|access denied/i.test($('title').text())) return true;
  if ($('#challenge-form, #challenge-running, #cf-challenge-running').length) return true;
  $('script, style, noscript, template').remove();
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  return (text.length < 1500 && /verify you are human|checking your browser|enable javascript and cookies|complete the captcha to continue/i.test(text))
    || (text.length < 300 && /cf-chl-/i.test(response.body.toString('utf8')));
}

export function isPublicAddress(value: string): boolean {
  try {
    const address = ipaddr.process(value);
    // Includes loopback, link-local, CGNAT, multicast, documentation ranges and mapped IPv4.
    if (address.range() !== 'unicast') return false;
    return address.kind() !== 'ipv6' || (address as ipaddr.IPv6).match(ipaddr.parse('2000::') as ipaddr.IPv6, 3);
  } catch { return false; }
}

/** Pin the validated DNS result to the actual socket; do not resolve a second time. */
export const publicHttp: Transport = async (url, userAgent, signal) => {
  websiteUrl(url.href);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) throw new Error('PRIVATE_NETWORK_BLOCKED');
  const pinned = addresses[0];
  const abort = AbortSignal.any([AbortSignal.timeout(15_000), ...(signal ? [signal] : [])]);
  return new Promise<PageResponse>((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method: 'GET', agent: false, signal: abort, family: pinned.family,
      lookup: (_host, options, callback) => {
        if (typeof options === 'object' && options.all)
          callback(null, [{ address: pinned.address, family: pinned.family }]);
        else callback(null, pinned.address, pinned.family);
      },
      headers: { 'User-Agent': userAgent, Accept: 'text/html,text/plain;q=0.8', 'Accept-Encoding': 'identity' },
    }, (response) => {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(response.headers)) headers[key] = Array.isArray(value) ? value.join(',') : value ?? '';
      const status = response.statusCode ?? 0;
      if (status !== 200) {
        response.destroy(); resolve({ status, headers, body: Buffer.alloc(0) }); return;
      }
      if (headers['content-encoding'] && headers['content-encoding'] !== 'identity') {
        response.destroy(); reject(new Error('UNSUPPORTED_ENCODING')); return;
      }
      if (url.pathname !== '/robots.txt' && !/^(?:text\/(?:html|plain)|application\/xhtml\+xml)(?:;|$)/i.test(headers['content-type'] ?? '')) {
        response.destroy(); reject(new Error('UNSUPPORTED_CONTENT_TYPE')); return;
      }
      const limit = url.pathname === '/robots.txt' ? 512_000 : 1_000_000;
      let size = 0;
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > limit) { response.destroy(); reject(new Error('BODY_LIMIT')); }
        else chunks.push(chunk);
      });
      response.on('end', () => resolve({ status, headers, body: Buffer.concat(chunks) }));
      response.on('error', reject);
      response.on('aborted', () => reject(new Error('BODY_ABORTED')));
    });
    request.on('error', reject);
    request.end();
  });
};
