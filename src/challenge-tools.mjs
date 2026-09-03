import {
  SEARCH_TOOL_NAME,
  ANSWER_TOOL_NAME,
  RESOLVE_TOOL_NAME,
  AVAILABILITY_TOOL_NAME,
  searchInputSchema,
  answerInputSchema,
  resolveInputSchema,
  availabilityInputSchema
} from './challenge-contract.mjs';

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
}

const READ_ONLY_ANNOTATIONS = Object.freeze({ readOnlyHint: true, untrustedContentHint: false });
const STATEFUL_ANNOTATIONS = Object.freeze({ readOnlyHint: false, untrustedContentHint: false });

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

function planMode(path) {
  if (path.bookingMode === 'call') return 'call';
  if (path.selection?.location === 'virtual') return 'self_schedule_online';
  return 'online';
}

function gateForResolution(result) {
  if (result?.status === 'clarification_required' && result.missingFields?.includes('medicare')) {
    return { kind: 'medicare_ask' };
  }
  if (result?.requiresPathChoice && result.paths?.length > 1) {
    return { kind: 'two_visit', title: 'Two appointments', text: result.explanation };
  }
  if (result?.status === 'staff_assistance_required') {
    return { kind: 'staff_assistance', reason: result.staffAssistance?.message ?? result.explanation ?? result.question };
  }
  return null;
}

function attachPath(path, cards) {
  return cards.find(card => card.bookingRouteKey === path.bookingRouteKey)
    ?? cards.find(card => card.actions?.some(action => action.bookingRouteKey === path.bookingRouteKey))
    ?? cards.find(card => card.visitOptions?.some(option => option.bookingRouteKey === path.bookingRouteKey))
    ?? cards[0]
    ?? null;
}

export function publicPlan(result, cards) {
  return {
    gate: gateForResolution(result),
    ...(result.status === 'choice_required' && !result.requiresPathChoice && result.question ? {
      evaluationAsk: {
        question: result.question,
        options: [
          { value: 'needs_evaluation', label: 'New or needs evaluation', outcome: 'online_evaluation' },
          { value: 'evaluated_by_revelus', label: 'Already evaluated by Revelus', outcome: 'call_office' }
        ]
      }
    } : {}),
    paths: (result.paths ?? []).map(path => {
      const card = attachPath(path, cards);
      return {
        pathId: path.pathId,
        bookingRouteKey: path.bookingRouteKey,
        reason: path.guidance,
        guidance: path.guidance,
        visitReason: path.selection?.visitReason ?? null,
        appointmentType: path.selection?.appointmentType ?? null,
        mode: planMode(path),
        location: path.selection?.location ?? null,
        ...(path.purpose ? { purpose: path.purpose } : {}),
        ...(path.selection?.location === 'virtual' ? {
          schedulingUrl: `https://revelusdermatology.com/schedule/#id=4214&reason_id=${path.selection.reasonId}&group=telemed`
        } : {}),
        attachTo: card?.pageId ?? null,
        ...(result.status === 'choice_required' ? { evaluationAsk: true } : {})
      };
    })
  };
}

export function projectAvailability(raw, context) {
  const { card, bookingRouteKey, purpose, providerForSource = () => null } = context ?? {};
  const liveBySource = new Map((raw.providers ?? [])
    .filter(provider => provider.profileUrl)
    .map(provider => [normalizeUrl(provider.profileUrl), provider]));
  const mode = raw.status === 'self_schedule_online' ? 'self_schedule_online'
    : raw.callRequired ? 'call'
      : 'online';
  const routeScoped = purpose === 'procedure_evaluation';
  const routeProviders = routeScoped
    ? (raw.providers ?? []).map(provider => providerForSource(provider.profileUrl)).filter(Boolean)
    : [];
  const providerCatalog = routeScoped ? routeProviders : (card?.providers ?? []);
  const providers = providerCatalog.map(provider => {
    const live = liveBySource.get(normalizeUrl(provider.sourceUrl));
    const eligible = provider.bookableFor.includes(bookingRouteKey);
    const bookable = Boolean(eligible && live && (live.slots?.length ?? 0) > 0);
    return {
      ...provider,
      providerId: provider.providerId,
      name: provider.name,
      slots: bookable ? live.slots.map(slot => ({
        date: slot.day ?? slot.startsAt?.slice(0, 10) ?? '',
        time: slot.time ?? slot.label ?? '',
        handoffUrl: slot.bookingUrl
      })) : [],
      more: bookable ? live.moreUrl ?? null : null,
      bookable,
      ...(!bookable ? {
        reason: !eligible
          ? 'This provider is listed on the page but is not online-bookable for this visit reason.'
          : live ? 'No online times are currently shown; call Revelus to schedule.' : 'The scheduler did not return this page-listed provider for the route.'
      } : {})
    };
  });
  return {
    status: raw.status,
    pathId: raw.pathId,
    providers,
    providerScope: routeScoped ? 'route' : 'page',
    banner: raw.notice ?? null,
    mode,
    ...(raw.selection ? { selection: raw.selection } : {}),
    ...(raw.schedulingUrl ? { schedulingUrl: raw.schedulingUrl } : {})
  };
}

const TOOL_META = Object.freeze({
  [SEARCH_TOOL_NAME]: {
    title: 'Search Revelus Information',
    description: 'Search published Revelus conditions, services, providers, and canonical Q&A. Each result is a complete page card with its published summary, FAQs, relationships, providers, actions, scheduling policy, responseGuidance, and source URL; use it directly without a follow-up answer lookup. Use responseGuidance.practiceStatement together with responseGuidance.clinicalBoundary as written. A page match never determines a patient diagnosis, treatment choice, or provider choice, and responseGuidance.patientConclusion always remains not_determined. Start with limit 4 and request more only when needed. Describe the topic or symptom in short, de-identified terms (e.g. "itchy rash", "hair loss options"). Never include patient identity — names, contact details, dates of birth — or photos, records requests, or personal medical history.',
    inputSchema: searchInputSchema,
    phase: 'search'
  },
  [ANSWER_TOOL_NAME]: {
    title: 'Get Revelus Standard Answer',
    description: 'Return an exact published Revelus answer or a source-page fallback for a result from revelus.search_information. This is informational only and does not diagnose or personalize treatment.',
    inputSchema: answerInputSchema,
    phase: 'answer',
    // Search already returns the complete page card. Keep this action for the
    // page accordion and /api/answer compatibility, but do not make an agent
    // spend another native WebMCP round trip retrieving duplicate content.
    exposeToWebMcp: false
  },
  [RESOLVE_TOOL_NAME]: {
    title: 'Resolve Revelus Visit Path',
    description: 'Resolve structured, non-diagnostic booking facts into validated Revelus appointment paths or staff-assisted procedure guidance. Pass only the structured fields defined by the schema — never patient identity, contact details, DOB, insurance IDs, photos, free-text symptoms, or medical history.',
    inputSchema: resolveInputSchema,
    phase: 'resolved'
  },
  [AVAILABILITY_TOOL_NAME]: {
    title: 'Get Revelus Availability',
    description: 'Return current rendered NextPatient providers, times, and exact review links for a current resolved path. This does not hold, reserve, book, or accept patient information.',
    inputSchema: availabilityInputSchema,
    phase: 'availability'
  }
});

// The page and native WebMCP share this single action layer. It owns the
// current result cards and path joins so neither caller can drift into a
// different response shape or match providers by display name.
export function createChallengeActions({
  knowledge,
  session,
  availabilityExecutor = input => session.getFixtureAvailability(input),
  providerForSource = sourceUrl => knowledge.providerForSource?.(sourceUrl) ?? null,
  captureContext = () => null,
  onUpdate = () => {}
}) {
  let currentCards = [];
  const pathContexts = new Map();

  const execute = {
    [SEARCH_TOOL_NAME]: async input => {
      const result = await (knowledge.searchPages ? knowledge.searchPages(input) : knowledge.search(input));
      currentCards = result.results ?? [];
      pathContexts.clear();
      return { ...result, plan: result.plan ?? null };
    },
    [ANSWER_TOOL_NAME]: input => knowledge.getPageAnswer ? knowledge.getPageAnswer(input) : knowledge.getAnswer(input),
    [RESOLVE_TOOL_NAME]: (input, options = {}) => {
      const resolution = session.resolveVisitPath(input);
      const plan = publicPlan(resolution, currentCards);
      if (options.attachTo && currentCards.some(card => card.pageId === options.attachTo)) {
        for (const path of plan.paths) path.attachTo = options.attachTo;
      }
      pathContexts.clear();
      for (const path of plan.paths) {
        pathContexts.set(path.pathId, {
          bookingRouteKey: path.bookingRouteKey,
          card: currentCards.find(card => card.pageId === path.attachTo) ?? currentCards[0] ?? null,
          purpose: path.purpose ?? null,
          providerForSource
        });
      }
      return { ...resolution, plan };
    },
    [AVAILABILITY_TOOL_NAME]: async (input, options) => projectAvailability(
      await availabilityExecutor(input, options),
      pathContexts.get(input.pathId)
    )
  };

  async function invoke(toolName, input, options = {}) {
    const { signal, source = 'page' } = options;
    const meta = TOOL_META[toolName];
    if (!meta || !execute[toolName]) throw new Error(`Unknown Revelus tool: ${toolName}`);
    const contextToken = captureContext();
    throwIfAborted(signal);
    const result = await execute[toolName](input, { ...options, signal });
    throwIfAborted(signal);
    onUpdate({ phase: meta.phase, toolName, contextToken, source, result });
    return result;
  }

  return {
    invoke,
    search: (input, options) => invoke(SEARCH_TOOL_NAME, input, options),
    answer: (input, options) => invoke(ANSWER_TOOL_NAME, input, options),
    resolve: (input, options) => invoke(RESOLVE_TOOL_NAME, input, options),
    availability: (input, options) => invoke(AVAILABILITY_TOOL_NAME, input, options),
    definitions: Object.entries(TOOL_META)
      .filter(([, meta]) => meta.exposeToWebMcp !== false)
      .map(([name, meta]) => {
        const { exposeToWebMcp: _exposeToWebMcp, ...definition } = meta;
        return { name, ...definition };
      })
  };
}

export async function registerChallengeTools(options) {
  const { modelContext } = options;
  if (!modelContext?.registerTool) throw new Error('WebMCP ModelContext is unavailable');
  const actions = options.actions ?? createChallengeActions(options);
  for (const definition of actions.definitions) {
    await modelContext.registerTool({
      name: definition.name,
      title: definition.title,
      description: definition.description,
      inputSchema: definition.inputSchema,
      annotations: definition.name === RESOLVE_TOOL_NAME ? STATEFUL_ANNOTATIONS : READ_ONLY_ANNOTATIONS,
      execute: (input, { signal } = {}) => actions.invoke(definition.name, input, { signal, source: 'webmcp' })
    });
  }
  return actions;
}
