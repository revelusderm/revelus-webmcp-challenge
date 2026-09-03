import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_ROUTES, createApiHandlers } from './api-core.mjs';
import { loadCuratedRecords } from './curated-loader.mjs';

export const BROWSER_MODULES = [
  'app.mjs','challenge-tools.mjs','challenge-contract.mjs','knowledge-client.mjs','common-questions.mjs',
  'booking-core.mjs','booking-contract.mjs','booking-catalog.mjs','schema-validator.mjs','model-context-shim.mjs','handoff.mjs',
  'input-privacy.mjs','nextpatient-adapter.mjs','concept-booking-policy.mjs','webmcp-response-inspector.mjs','latest-only-gate.mjs','service-scheduling-policy.mjs'
];
export const BROWSER_ASSETS = [
  'revelus-providers.png', 'ask-revelus-social-1200x630.png', 'site-header-logo-white.png', 'revelus-icon-white.png',
  'revelus-favicon-150.jpg', 'revelus-favicon-300.jpg',
  'fonts/SinkinSans-300Light.woff2', 'fonts/SinkinSans-300LightItalic.woff2',
  'fonts/SinkinSans-400Regular.woff2', 'fonts/SinkinSans-600SemiBold.woff2'
];
const TYPES = new Map([
  ['.html','text/html; charset=utf-8'],['.css','text/css; charset=utf-8'],
  ['.mjs','text/javascript; charset=utf-8'],['.json','application/json; charset=utf-8'],['.png','image/png'],
  ['.jpg','image/jpeg'],['.webmanifest','application/manifest+json; charset=utf-8'],
  ['.woff2','font/woff2']
]);
const MAX_API_BODY_BYTES = 8 * 1024;

function publicPaths() {
  // The corpus, search index, curated records, and patient-language registry
  // are deliberately NOT served — they stay server-side behind the API.
  const paths = new Map([
    ['/','index.html'],['/index.html','index.html'],['/handoff.html','handoff.html'],['/styles.css','styles.css'],
    ['/site.webmanifest','site.webmanifest']
  ]);
  for (const name of BROWSER_ASSETS) paths.set(`/assets/${name}`, `assets/${name}`);
  for (const name of BROWSER_MODULES) paths.set(`/src/${name}`, `src/${name}`);
  return paths;
}

async function loadApiHandlers(base) {
  const load = async relative => JSON.parse(await readFile(resolve(base, relative)));
  return createApiHandlers({
    corpus: await load('data/corpus.json'),
    searchIndex: await load('data/search-index.json'),
    curatedRecords: await loadCuratedRecords(new URL(`file://${resolve(base, 'data/curated')}/`)),
    registry: await load('data/patient-language-concepts.json')
  });
}

function readBoundedBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let size = 0;
    let exceeded = false;
    const chunks = [];
    request.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_API_BODY_BYTES) {
        // Keep draining so a normal 400 response can still be delivered.
        exceeded = true;
        chunks.length = 0;
        return;
      }
      if (!exceeded) chunks.push(chunk);
    });
    request.on('end', () => {
      if (exceeded) rejectBody(new Error('Request body too large'));
      else resolveBody(Buffer.concat(chunks).toString('utf8'));
    });
    request.on('error', rejectBody);
  });
}

export function createChallengeServer({ root }) {
  const base = resolve(root instanceof URL ? fileURLToPath(root) : root);
  const allowed = publicPaths();
  const apiPromise = loadApiHandlers(base);
  const securityHeaders = {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://nextpatient.co; img-src 'self' data: https://nextpatient.co https://revelusdermatology.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin'
  };
  return createServer(async (request, response) => {
    const pathname = (() => {
      try { return decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); } catch { return null; }
    })();
    const apiMethod = pathname ? API_ROUTES[pathname] : undefined;
    if (apiMethod) {
      try {
        if (request.method !== 'POST') {
          response.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', ...securityHeaders });
          response.end(JSON.stringify({ error: 'Use POST with a JSON body' }));
          return;
        }
        const api = await apiPromise;
        const raw = await readBoundedBody(request);
        let input;
        try { input = raw.length ? JSON.parse(raw) : {}; } catch { throw new Error('Request body must be JSON'); }
        const result = api[apiMethod](input);
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...securityHeaders });
        response.end(JSON.stringify(result));
      } catch (error) {
        response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...securityHeaders });
        response.end(JSON.stringify({ error: error?.message ?? 'Request failed' }));
      }
      return;
    }
    try {
      const relative = pathname ? allowed.get(pathname) : undefined;
      if (!relative) throw new Error('not found');
      const body = await readFile(resolve(base, relative));
      response.writeHead(200, {
        'Content-Type': TYPES.get(extname(relative)) ?? 'application/octet-stream',
        ...securityHeaders
      });
      response.end(body);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end('Not found');
    }
  });
}
