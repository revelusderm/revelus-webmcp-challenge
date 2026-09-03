import { createKnowledgeBase } from './knowledge-core.mjs';
import { createPatientLanguageResolver } from './patient-language-resolver.mjs';
import { sensitiveInputActions, sensitiveInputMessage, sensitiveInputReason } from './input-privacy.mjs';

// Server-side knowledge API. The corpus, search index, curated records, and
// patient-language registry stay on the server; the browser receives only
// individual answers — never the compiled data bundle.
export function createApiHandlers({ corpus, searchIndex, curatedRecords, registry }) {
  const knowledge = createKnowledgeBase({ corpus, searchIndex, curatedRecords });
  const allowedPublicNames = corpus.records.map(record => record.wordpressTitle);
  const resolver = createPatientLanguageResolver({ registry, allowedPublicNames });
  const conceptsById = new Map(registry.concepts.map(concept => [concept.conceptId, concept]));
  const demoExcludedSources = new Set(curatedRecords
    .filter(record => record.pageType === 'offer_collection')
    .map(record => record.source.url));
  const publicProviders = curatedRecords
    .filter(record => record.pageType === 'provider')
    .map(record => knowledge.providerForSource(record.source.url))
    .filter(Boolean);

  const conceptSummary = concept => ({
    conceptId: concept.conceptId,
    canonicalLabel: concept.canonicalLabel,
    kind: concept.kind,
    sourceUrl: concept.sourceUrl,
    bookingConfidence: concept.bookingConfidence ?? null,
    bookingRouteCandidate: concept.bookingRouteCandidate ?? null
  });

  return {
    search(input) {
      const reason = sensitiveInputReason(input?.query, { allowedPublicNames });
      if (reason) return {
        mode: 'refused',
        status: 'refused',
        query: input?.query ?? '',
        message: sensitiveInputMessage(reason),
        actions: sensitiveInputActions(reason),
        results: [],
        plan: null
      };
      const ranked = knowledge.searchPages(input);
      const language = resolver.resolve({ text: input.query });
      let preferredSources = [];
      if (language.status === 'resolved' || language.status === 'multi_match') {
        preferredSources = [...(language.concepts ?? []), ...(language.secondaryConcepts ?? [])].map(item => item.sourceUrl);
      } else if (language.status === 'ambiguous') {
        preferredSources = (language.ambiguity?.options ?? [])
          .map(option => conceptsById.get(option.conceptId)?.sourceUrl)
          .filter(Boolean);
      }
      preferredSources = preferredSources.filter(sourceUrl => !demoExcludedSources.has(sourceUrl));
      if (!preferredSources.length) return { ...ranked, plan: null };
      const bySource = new Map(ranked.results.map(result => [result.sourceUrl, result]));
      const orderedSources = [...new Set(preferredSources)];
      const preferredSet = new Set(orderedSources);
      const preferredCards = orderedSources.map(sourceUrl => bySource.get(sourceUrl) ?? knowledge.pageCardForSource(sourceUrl));
      const results = [...preferredCards, ...ranked.results.filter(result => !preferredSet.has(result.sourceUrl))].slice(0, input.limit ?? 5);
      return { ...ranked, mode: 'results', status: 'found', results, plan: null, languageStatus: language.status };
    },
    answer(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Answer input must be an object');
      const extra = Object.keys(input).filter(key => key !== 'entryId');
      if (extra.length) throw new Error(`Unsupported answer fields: ${extra.join(', ')}`);
      return knowledge.getPageAnswer({ entryId: input.entryId });
    },
    searchWithinSource(input) {
      return knowledge.searchWithinSource(input);
    },
    resolveLanguage(input) {
      const resolved = resolver.resolve(input);
      const project = item => ({
        ...item,
        ...conceptSummary(conceptsById.get(item.conceptId) ?? { conceptId: item.conceptId, canonicalLabel: item.canonicalLabel, kind: item.kind, sourceUrl: item.sourceUrl })
      });
      return {
        ...resolved,
        concepts: (resolved.concepts ?? []).map(project),
        ...(resolved.secondaryConcepts?.length ? { secondaryConcepts: resolved.secondaryConcepts.map(project) } : {})
      };
    },
    publicEntities() {
      // Published names and provider projections are public. The browser uses
      // stable provider ids to join route-level availability without
      // receiving the private corpus bundle.
      return { names: allowedPublicNames, providers: publicProviders };
    },
    concept(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Concept input must be an object');
      const extra = Object.keys(input).filter(key => key !== 'conceptId');
      if (extra.length) throw new Error(`Unsupported concept fields: ${extra.join(', ')}`);
      if (typeof input.conceptId !== 'string' || !/^[a-z0-9_]{3,80}$/.test(input.conceptId)) throw new Error('Concept id must be a lowercase identifier');
      const concept = conceptsById.get(input.conceptId);
      if (!concept) throw new Error('Unknown patient-language concept');
      return conceptSummary(concept);
    }
  };
}

export const API_ROUTES = Object.freeze({
  '/api/search': 'search',
  '/api/answer': 'answer',
  '/api/search-within-source': 'searchWithinSource',
  '/api/resolve-language': 'resolveLanguage',
  '/api/concept': 'concept',
  '/api/public-entities': 'publicEntities'
});
