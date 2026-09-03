// Browser-side client for the server-hosted knowledge API. The page never
// receives the corpus, search index, or patient-language registry — only the
// individual JSON responses to specific questions.
export function createKnowledgeClient({ baseUrl = '' } = {}) {
  async function post(path, input) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      body: JSON.stringify(input ?? {})
    });
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) throw new Error(payload?.error ?? `Knowledge API request failed (${response.status})`);
    return payload;
  }

  return {
    knowledge: {
      search: input => post('/api/search', input),
      getAnswer: input => post('/api/answer', input),
      searchWithinSource: input => post('/api/search-within-source', input)
    },
    resolver: {
      resolve: input => post('/api/resolve-language', input)
    },
    getConcept: conceptId => post('/api/concept', { conceptId }),
    getPublicEntities: () => post('/api/public-entities', {})
  };
}
