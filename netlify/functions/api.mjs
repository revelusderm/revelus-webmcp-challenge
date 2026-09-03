import { API_ROUTES, createApiHandlers } from '../../src/api-core.mjs';
import corpus from '../../data/corpus.json';
import searchIndex from '../../data/search-index.json';
import registry from '../../data/patient-language-concepts.json';
import { loadCuratedRecords } from '../../src/curated-loader.mjs';

const MAX_API_BODY_BYTES = 8 * 1024;

const api = createApiHandlers({
  corpus,
  searchIndex,
  registry,
  curatedRecords: await loadCuratedRecords(new URL('../../data/curated/', import.meta.url))
});

const jsonResponse = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  }
});

// Accept both direct /api/<name> paths and the rewritten
// /.netlify/functions/api/<name> form.
const METHOD_BY_SEGMENT = Object.fromEntries(
  Object.entries(API_ROUTES).map(([route, method]) => [route.split('/').pop(), method])
);

export default async request => {
  const pathname = new URL(request.url).pathname;
  const method = API_ROUTES[pathname] ?? METHOD_BY_SEGMENT[pathname.split('/').filter(Boolean).pop()];
  if (!method) return jsonResponse(404, { error: 'Not found' });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Use POST with a JSON body' });
  try {
    const raw = await request.text();
    if (raw.length > MAX_API_BODY_BYTES) throw new Error('Request body too large');
    let input;
    try { input = raw.length ? JSON.parse(raw) : {}; } catch { throw new Error('Request body must be JSON'); }
    return jsonResponse(200, api[method](input));
  } catch (error) {
    return jsonResponse(400, { error: error?.message ?? 'Request failed' });
  }
};

export const config = {
  path: Object.keys(API_ROUTES)
};
