/**
 * SSRF-safe HTTP(S) GET/POST for fetching third-party pages found by search.
 * - Only http/https on ports 80/443.
 * - Every DNS answer (and IP-literal hosts) must be a public address; checked inside the socket's own
 *   lookup, so the address that is validated is the address that is connected to.
 * - Redirects are followed manually (max 4) with the same checks on every hop.
 * - Body size and total time are capped; gzip/deflate/brotli are decoded.
 */
import http from 'http';
import https from 'https';
import dns from 'dns';
import net from 'net';
import zlib from 'zlib';
import { pipeline } from 'stream';

export interface SafeFetchOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
  signal?: AbortSignal;
  maxRedirects?: number;
  /**
   * Only for admin-configured endpoints (e.g. a self-hosted SearXNG on localhost:8080): skip the
   * public-address and port checks for that endpoint's own origin. Redirects elsewhere are still checked.
   */
  allowPrivateNetwork?: boolean;
}

export interface SafeFetchResult {
  status: number;
  url: string;
  contentType: string;
  body: string;
  headers: http.IncomingHttpHeaders;
}

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedUrlError';
  }
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKS: Array<[string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
];

export function isPublicIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    return !V4_BLOCKS.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(ip)) {
    const h = expandIPv6(ip);
    if (!h) return false;
    const embeddedV4 = () => `${h[6] >> 8}.${h[6] & 255}.${h[7] >> 8}.${h[7] & 255}`;
    // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::/96) addresses carry an IPv4 address: judge that one
    if (h.slice(0, 5).every(x => x === 0) && h[5] === 0xffff) return isPublicIp(embeddedV4());
    if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every(x => x === 0)) return isPublicIp(embeddedV4());
    if (h.every(x => x === 0)) return false; // ::
    if (h.slice(0, 7).every(x => x === 0) && h[7] === 1) return false; // ::1
    if ((h[0] & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
    if ((h[0] & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
    if ((h[0] & 0xff00) === 0xff00) return false; // multicast
    if (h[0] === 0x2001 && h[1] === 0x0db8) return false; // documentation
    if (h[0] === 0x64 && h[1] === 0xff9b && h[2] === 1) return false; // local-use NAT64 64:ff9b:1::/48
    return true;
  }
  return false;
}

/** Expands an IPv6 address (incl. embedded dotted IPv4) to 8 16-bit groups. */
function expandIPv6(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0];
  const v4 = s.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    s = s.slice(0, -v4[0].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = s.split('::');
  const hp = head ? head.split(':') : [];
  const tp = tail !== undefined && tail !== '' ? tail.split(':') : [];
  const missing = 8 - hp.length - tp.length;
  if (s.includes('::') ? missing < 0 : hp.length !== 8) return null;
  const groups = [...hp, ...Array(s.includes('::') ? missing : 0).fill('0'), ...tp].map(g => parseInt(g, 16));
  return groups.length === 8 && groups.every(g => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

/** socket lookup that refuses private/loopback/link-local answers */
function safeLookup(hostname: string, options: any, callback: any) {
  dns.lookup(hostname, { all: true, family: options?.family || 0 }, (err, addresses) => {
    if (err) return callback(err);
    const list = addresses as dns.LookupAddress[];
    if (!list.length) return callback(new BlockedUrlError(`No address for ${hostname}`));
    const bad = list.find(a => !isPublicIp(a.address));
    if (bad) return callback(new BlockedUrlError(`Blocked non-public address for ${hostname}`));
    if (options?.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

export function assertFetchableUrl(raw: string, trusted = false): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new BlockedUrlError('Invalid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new BlockedUrlError('Only http(s) URLs can be fetched');
  if (u.username || u.password) throw new BlockedUrlError('URLs with credentials are not fetched');
  if (trusted) return u;
  const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
  if (port !== 80 && port !== 443) throw new BlockedUrlError('Only ports 80 and 443 are allowed');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new BlockedUrlError('Local hostnames are not fetched');
  }
  if (net.isIP(host) && !isPublicIp(host)) throw new BlockedUrlError('Private addresses are not fetched');
  return u;
}

function requestOnce(u: URL, opts: SafeFetchOptions, deadline: number): Promise<{ res: http.IncomingMessage; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === 'https:' ? https : http;
    const maxBytes = opts.maxBytes ?? 2_000_000;
    let settled = false;
    let req: http.ClientRequest;
    // Every exit (success, error, abort, timeout) goes through here exactly once
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      opts.signal?.removeEventListener('abort', onAbort);
      fn();
    };
    const fail = (e: Error) =>
      settle(() => {
        req?.destroy();
        reject(e);
      });
    const onAbort = () => fail(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
    // Hard deadline: the socket `timeout` option only catches idle sockets, not slow-drip servers
    const hardTimer = setTimeout(() => fail(new Error('Request timed out')), Math.max(1, deadline - Date.now()));

    req = lib.request(
      u,
      {
        method: opts.method || 'GET',
        headers: {
          'Accept-Encoding': 'gzip, deflate, br',
          ...(opts.body ? { 'Content-Length': Buffer.byteLength(opts.body).toString() } : {}),
          ...opts.headers
        },
        lookup: opts.allowPrivateNetwork ? undefined : (safeLookup as any),
        timeout: Math.max(1, deadline - Date.now())
      },
      res => {
        res.on('error', fail);
        const status = res.statusCode || 0;
        // Redirects: no body needed. Handled before any decompression so a bogus body can't throw.
        if (status >= 300 && status < 400) {
          settle(() => resolve({ res, body: Buffer.alloc(0) }));
          req.destroy();
          return;
        }

        const enc = String(res.headers['content-encoding'] || '').toLowerCase();
        const decoder =
          enc === 'gzip' || enc === 'x-gzip' ? zlib.createGunzip() : enc === 'deflate' ? zlib.createInflate() : enc === 'br' ? zlib.createBrotliDecompress() : null;
        // pipeline forwards errors from either side (corrupt or truncated compressed bodies)
        const stream: NodeJS.ReadableStream = decoder ? decoder : res;
        if (decoder) pipeline(res, decoder, err => (err ? fail(err) : undefined));
        else res.on('close', () => (!res.complete ? fail(new Error('Connection closed before the response finished')) : undefined));

        const chunks: Buffer[] = [];
        let size = 0;
        stream.on('data', (c: Buffer) => {
          if (settled) return;
          const room = maxBytes - size;
          size += c.length;
          if (size >= maxBytes) {
            // Huge page: keep the first maxBytes (enough to compare) and stop downloading
            if (room > 0) chunks.push(c.subarray(0, room));
            settle(() => resolve({ res, body: Buffer.concat(chunks) }));
            req.destroy();
            return;
          }
          chunks.push(c);
        });
        stream.on('end', () => {
          // The decoder can finish before the HTTP body did (truncated/lying Content-Length): not a success
          if (!res.complete) return fail(new Error('Connection closed before the response finished'));
          settle(() => resolve({ res, body: Buffer.concat(chunks) }));
        });
        stream.on('error', fail);
      }
    );
    if (opts.signal) {
      if (opts.signal.aborted) return onAbort();
      opts.signal.addEventListener('abort', onAbort, { once: true });
    }
    req.on('timeout', () => fail(new Error('Request timed out')));
    req.on('error', fail);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

/** Charset from the Content-Type header, else from a <meta> tag in the first bytes of an HTML body. */
function detectCharset(contentType: string, buf: Buffer): string {
  const fromHeader = contentType.match(/charset=["']?([\w.:-]+)/i)?.[1];
  if (fromHeader) return fromHeader.toLowerCase();
  if (/html|xml/.test(contentType) || !contentType) {
    const head = buf.subarray(0, 4096).toString('latin1');
    const meta = head.match(/<meta[^>]+charset=["']?\s*([\w.:-]+)/i)?.[1];
    if (meta) return meta.toLowerCase();
  }
  return 'utf-8';
}

export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const deadline = Date.now() + (opts.timeoutMs ?? 8000);
  let u = assertFetchableUrl(rawUrl, opts.allowPrivateNetwork);
  const trustedOrigin = opts.allowPrivateNetwork ? u.origin : null;
  let method = opts.method || 'GET';
  let body = opts.body;
  for (let hop = 0; hop <= (opts.maxRedirects ?? 4); hop++) {
    if (Date.now() >= deadline) throw new Error('Request timed out');
    const trusted = trustedOrigin !== null && u.origin === trustedOrigin;
    const { res, body: buf } = await requestOnce(u, { ...opts, method, body, allowPrivateNetwork: trusted }, deadline);
    const status = res.statusCode || 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      const next = new URL(res.headers.location, u);
      u = assertFetchableUrl(next.toString(), trustedOrigin !== null && next.origin === trustedOrigin);
      // 303 (and legacy 301/302 for POST) continue as GET
      if (status === 303 || ((status === 301 || status === 302) && method === 'POST')) {
        method = 'GET';
        body = undefined;
      }
      continue;
    }
    const contentType = String(res.headers['content-type'] || '').toLowerCase();
    const charset = detectCharset(contentType, buf);
    let text: string;
    try {
      text = new TextDecoder(charset === 'utf8' ? 'utf-8' : charset).decode(buf);
    } catch {
      text = buf.toString('utf8');
    }
    return { status, url: u.toString(), contentType, body: text, headers: res.headers };
  }
  throw new Error('Too many redirects');
}
