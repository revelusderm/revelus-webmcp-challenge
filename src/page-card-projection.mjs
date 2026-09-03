import { routeByKey } from './booking-catalog.mjs';
import { schedulingPolicyForSource } from './service-scheduling-policy.mjs';

const RELATIONSHIP_GROUPS = [
  'treatment_for',
  'provider_addressing',
  'provider_offering',
  'related_condition',
  'condition_addressed',
  'related_service'
];

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname === '/' ? '/' : `${url.pathname.replace(/\/+$/, '')}/`;
    return url.href;
  } catch {
    return null;
  }
}

function publicKind(record) {
  if (['condition', 'medical_service', 'cosmetic_service', 'provider'].includes(record.pageType)) return record.pageType;
  return 'resource';
}

function emptyRelationshipGroups() {
  return Object.fromEntries(RELATIONSHIP_GROUPS.map(kind => [kind, []]));
}

function publicSchedulingPolicy(record, bookingRouteKey) {
  const explicit = schedulingPolicyForSource(record.source.url);
  if (explicit?.type === 'staff_scheduled_procedure') {
    return { type: 'staff_scheduled_procedure', procedureKey: explicit.procedureKey };
  }
  if (explicit?.type === 'direct_route') return { type: 'direct_route' };
  const route = bookingRouteKey ? routeByKey.get(bookingRouteKey) : null;
  if (!route) return { type: 'none' };
  if (route.bookingMode === 'call') return { type: 'office_controlled' };
  if (route.branch === 'virtual_medical') return { type: 'virtual' };
  return { type: 'direct_route' };
}

function matchedFaq(record, entry) {
  if (entry?.kind !== 'faq') return null;
  const normalizedQuestion = String(entry.title ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  return record.faqs.find(faq => faq.question.replace(/\s+/g, ' ').trim().toLowerCase() === normalizedQuestion) ?? null;
}

function firstSentence(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.match(/^(.+?[.!?])(?:\s|$)/)?.[1] ?? text;
}

function displaySummary(record) {
  if (record.pageType === 'provider') return record.summary;
  const subject = record.pageId.replace(/-/g, ' ').toLowerCase();
  const definition = (record.faqs ?? []).find(faq => {
    const question = faq.question.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    return [`what is ${subject}`, `what is a ${subject}`, `what is an ${subject}`, `what are ${subject}`].includes(question);
  });
  return definition ? firstSentence(definition.answer) : record.summary;
}

export function createPageCardProjector({ corpus, curatedRecords }) {
  const curatedByUrl = new Map(curatedRecords.map(record => [normalizeUrl(record.source.url), record]));
  const corpusByUrl = new Map(corpus.records.map(record => [normalizeUrl(record.sourceUri), record]));
  const curatedByPageId = new Map(curatedRecords.map(record => [record.pageId, record]));

  function relationshipTarget(relationship) {
    const target = curatedByUrl.get(normalizeUrl(relationship.targetUrl));
    if (!target) return null;
    return {
      pageId: target.pageId,
      slug: target.pageId,
      title: target.title,
      sourceUrl: target.source.url,
      kind: publicKind(target)
    };
  }

  function providerProjection(provider) {
    const corpusRecord = corpusByUrl.get(normalizeUrl(provider.source.url));
    const profile = provider.providerProfile ?? {};
    return {
      providerId: corpusRecord?.recordId ?? `provider:${provider.source.wordpressId}`,
      slug: provider.pageId,
      name: profile.name || corpusRecord?.wordpressTitle || provider.title,
      credential: profile.credential ?? '',
      role: profile.role ?? '',
      portraitUrl: provider.media.find(item => item.kind === 'hero')?.url ?? null,
      sourceUrl: provider.source.url,
      bookableFor: [...(provider.bookableFor ?? [])]
    };
  }

  function project(recordOrPageId, { entry = null } = {}) {
    const record = typeof recordOrPageId === 'string' ? curatedByPageId.get(recordOrPageId) : recordOrPageId;
    if (!record) throw new Error('Unknown curated page');
    const grouped = emptyRelationshipGroups();
    for (const relationship of record.relationships ?? []) {
      if (relationship.reviewStatus !== 'verified' || !Object.hasOwn(grouped, relationship.relationshipKind)) continue;
      const target = relationshipTarget(relationship);
      if (target && !grouped[relationship.relationshipKind].some(item => item.pageId === target.pageId)) {
        grouped[relationship.relationshipKind].push(target);
      }
    }
    const providerIds = new Set();
    const providers = [];
    for (const kind of ['provider_addressing', 'provider_offering']) {
      for (const item of grouped[kind]) {
        const provider = curatedByPageId.get(item.pageId);
        if (provider?.pageType !== 'provider') continue;
        const projection = providerProjection(provider);
        if (!providerIds.has(projection.providerId)) {
          providerIds.add(projection.providerId);
          providers.push(projection);
        }
      }
    }
    for (const sourceUrl of entry?.providerSourceUrls ?? []) {
      const provider = curatedByUrl.get(normalizeUrl(sourceUrl));
      if (provider?.pageType !== 'provider') continue;
      const projection = providerProjection(provider);
      if (!providerIds.has(projection.providerId)) {
        providerIds.add(projection.providerId);
        providers.push(projection);
      }
    }
    if (record.pageType === 'provider' && providers.length === 0) providers.push(providerProjection(record));
    const explicitPolicy = schedulingPolicyForSource(record.source.url);
    const capturedRoute = record.actions?.find(action => action.kind === 'schedule' && action.bookingRouteKey && action.bookingRouteKey !== 'none')?.bookingRouteKey ?? null;
    const primaryRoute = ['condition', 'resource', 'homepage', 'offer_collection', 'page'].includes(record.pageType)
      ? null
      : capturedRoute ?? (explicitPolicy?.type === 'direct_route' ? explicitPolicy.routeKey : null);
    const faqMatch = matchedFaq(record, entry);
    const faqs = (record.faqs ?? []).map(faq => ({ faqId: faq.faqId, question: faq.question, answer: faq.answer }));
    if (faqMatch) {
      const index = faqs.findIndex(faq => faq.faqId === faqMatch.faqId);
      if (index > 0) faqs.unshift(...faqs.splice(index, 1));
    }
    const card = {
      pageId: record.pageId,
      slug: record.pageId,
      sourceUrl: record.source.url,
      title: record.title,
      kind: publicKind(record),
      summary: displaySummary(record),
      hero: (() => {
        const hero = record.media?.find(item => item.kind === 'hero');
        return hero ? { url: hero.url, alt: hero.alt } : null;
      })(),
      atAGlance: structuredClone(record.atAGlance ?? []),
      atAGlanceFootnotes: structuredClone(record.atAGlanceFootnotes ?? []),
      faqs,
      relationships: grouped,
      providers,
      actions: (record.actions ?? [])
        .filter(action => ['schedule', 'call', 'chat'].includes(action.kind))
        .filter(action => action.kind !== 'schedule' || (action.bookingRouteKey && action.bookingRouteKey !== 'none'))
        .map(action => ({ kind: action.kind, label: action.label, url: action.url, bookingRouteKey: action.bookingRouteKey })),
      bookingRouteKey: primaryRoute,
      schedulingPolicy: publicSchedulingPolicy(record, primaryRoute),
      answerSafety: structuredClone(record.answerSafety)
    };
    if (record.pageType === 'provider') {
      card.conditionsAddressed = grouped.provider_addressing.filter(item => item.kind === 'condition');
      card.bookableFor = [...(record.bookableFor ?? [])];
      // The complete widget reason catalog belongs once on the provider card.
      // Repeating it inside every nested provider projection nearly doubles
      // broad search responses and adds no UI or agent-facing information.
      card.visitOptions = structuredClone(record.visitOptions ?? []);
    }
    return card;
  }

  function bySourceUrl(sourceUrl, options) {
    const record = curatedByUrl.get(normalizeUrl(sourceUrl));
    if (!record) throw new Error(`No curated page for source: ${sourceUrl}`);
    return project(record, options);
  }

  function providerBySourceUrl(sourceUrl) {
    const provider = curatedByUrl.get(normalizeUrl(sourceUrl));
    return provider?.pageType === 'provider' ? providerProjection(provider) : null;
  }

  return { project, bySourceUrl, providerBySourceUrl, normalizeUrl };
}
