import { installModelContextShim } from './model-context-shim.mjs';
import { createKnowledgeClient } from './knowledge-client.mjs';
import { createBookingSession } from './booking-core.mjs';
import { createChallengeActions, registerChallengeTools } from './challenge-tools.mjs';
import { createNextPatientAvailabilityExecutor } from './nextpatient-adapter.mjs';
import { formatWebMcpInspector } from './webmcp-response-inspector.mjs';
import { createLatestOnlyGate } from './latest-only-gate.mjs';
import { COMMON_QUESTIONS } from './common-questions.mjs';

const PHONE = '(512) 815-2559';
const TEL = 'tel:+15128152559';
const CHAT = 'https://patient.klara.com/#/widget/signup/8824/verify';
const gates = createLatestOnlyGate();

const dom = Object.fromEntries([
  'question-form', 'question-input', 'ask-button', 'question-pool-toggle', 'question-pool',
  'topic-chips', 'gate-chips', 'connection-status', 'results', 'results-title',
  'results-nav-link', 'results-list', 'result-gate', 'view-more-button', 'ask-again-button',
  'webmcp-response-tool', 'webmcp-response-source', 'webmcp-response-output',
  'tool-call-log', 'live-region', 'faq-more-button'
].map(id => [id, document.getElementById(id)]));

const state = {
  knowledge: null,
  resolver: null,
  getConcept: null,
  publicEntityNames: [],
  publicProvidersBySource: new Map(),
  session: null,
  actions: null,
  query: '',
  results: [],
  shown: 4,
  searchStatus: 'idle',
  questionGate: null,
  pageGate: null,
  gateAcknowledged: false,
  cardState: new Map(),
  pendingCardId: null,
  toolLog: []
};

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function externalLink(label, href, className = '') {
  const anchor = node('a', className, label);
  anchor.href = href;
  if (/^https:/i.test(href)) {
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.referrerPolicy = 'no-referrer';
  }
  return anchor;
}

function normalizedPublicUrl(value) {
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

function announce(message) {
  dom['live-region'].textContent = '';
  requestAnimationFrame(() => { dom['live-region'].textContent = message; });
}

function cardStateFor(pageId) {
  if (!state.cardState.has(pageId)) {
    state.cardState.set(pageId, {
      open: new Set(),
      openFaqs: new Set(),
      answered: false,
      loadingPlan: false,
      selectedVisit: '',
      medicare: null,
      planResult: null,
      pathLoading: new Set(),
      availability: new Map(),
      handoff: null,
      localCallReason: null
    });
  }
  return state.cardState.get(pageId);
}

function recordResponse(update) {
  const source = update.source === 'webmcp' ? 'webmcp' : 'shared_handler';
  try {
    const view = formatWebMcpInspector({
      toolName: update.toolName,
      source,
      result: update.result,
      allowedPublicNames: state.publicEntityNames
    });
    dom['webmcp-response-tool'].textContent = view.toolName;
    dom['webmcp-response-source'].textContent = view.sourceLabel;
    dom['webmcp-response-output'].textContent = view.clearText;
    state.toolLog.push({ toolName: view.toolName, source: view.sourceLabel });
    state.toolLog = state.toolLog.slice(-12);
    dom['tool-call-log'].replaceChildren(...state.toolLog.map((item, index) => {
      const row = node('div', 'tool-call');
      row.append(node('code', '', `${index + 1}. ${item.toolName}`), node('span', '', item.source));
      return row;
    }));
  } catch (error) {
    dom['webmcp-response-tool'].textContent = 'Response withheld';
    dom['webmcp-response-source'].textContent = 'Safety policy';
    dom['webmcp-response-output'].textContent = 'The response was not displayed because it failed the inspector safety policy.';
  }
}

function resetQuestionState() {
  state.results = [];
  state.shown = 4;
  state.questionGate = null;
  state.pageGate = null;
  state.gateAcknowledged = false;
  state.cardState = new Map();
  state.pendingCardId = null;
  state.session?.invalidateResolvedPaths();
}

function applySearch(result) {
  state.query = result.query ?? state.query;
  if (result.query) dom['question-input'].value = result.query;
  resetQuestionState();
  state.searchStatus = result.mode === 'refused' ? 'refused' : result.results?.length ? 'results' : 'no_match';
  state.results = result.results ?? [];
  if (state.results.length === 1 && state.results[0].match?.expander) {
    const cardState = cardStateFor(state.results[0].pageId);
    const key = state.results[0].match.expander === 'read' ? 'key'
      : state.results[0].match.expander === 'times' ? 'providers'
        : state.results[0].match.expander;
    if (['key', 'questions', 'providers', 'availability'].includes(key)) cardState.open.add(key === 'availability' ? 'providers' : key);
    if (state.results[0].match.faqId) cardState.openFaqs.add(state.results[0].match.faqId);
  }
  if (result.mode === 'refused') {
    state.questionGate = { kind: 'privacy', message: result.message, actions: result.actions ?? [] };
  } else if (state.questionGate?.kind !== 'two_visit' && currentQuestionMeta()?.gate === 'two_visit') {
    state.questionGate = {
      kind: 'two_visit',
      title: 'two separate appointments',
      text: 'Some concerns need separate visits so each one follows the correct Revelus scheduling path.'
    };
  }
  renderResults();
  announce(result.mode === 'refused' ? 'That request was stopped for privacy.' : `${state.results.length} matching published ${state.results.length === 1 ? 'page' : 'pages'} found.`);
}

function applyAnswer(card) {
  const index = state.results.findIndex(result => result.pageId === card.pageId);
  if (index >= 0) state.results[index] = { ...card, match: card.match ?? state.results[index].match };
  const cardState = cardStateFor(card.pageId);
  cardState.answered = true;
  renderResults();
}

function applyPlan(result) {
  const plan = result.plan ?? { gate: null, paths: [] };
  const fallbackId = state.pendingCardId ?? plan.paths?.[0]?.attachTo ?? state.results[0]?.pageId;
  const targetIds = new Set((plan.paths ?? []).map(path => path.attachTo).filter(Boolean));
  if (!targetIds.size && fallbackId) targetIds.add(fallbackId);
  for (const pageId of targetIds) {
    const cardState = cardStateFor(pageId);
    cardState.loadingPlan = false;
    cardState.planResult = result;
    cardState.localCallReason = null;
    cardState.handoff = null;
  }
  if (plan.gate?.kind === 'two_visit') {
    state.pageGate = plan.gate;
    state.gateAcknowledged = false;
  }
  state.pendingCardId = null;
  renderResults();
}

function applyAvailability(result) {
  for (const card of state.results) {
    const cardState = cardStateFor(card.pageId);
    const ownsPath = cardState.planResult?.plan?.paths?.some(path => path.pathId === result.pathId);
    if (!ownsPath) continue;
    cardState.pathLoading.delete(result.pathId);
    cardState.availability.set(result.pathId, result);
  }
  renderResults();
}

function onToolUpdate(update) {
  if (update.phase === 'availability' && !gates.isCurrent(update.contextToken)) return;
  recordResponse(update);
  if (update.phase === 'search') applySearch(update.result);
  else if (update.phase === 'answer') applyAnswer(update.result);
  else if (update.phase === 'resolved') applyPlan(update.result);
  else if (update.phase === 'availability') applyAvailability(update.result);
}

function currentQuestionMeta() {
  const normalized = state.query.trim().toLowerCase();
  return COMMON_QUESTIONS.find(item => item.text.toLowerCase() === normalized) ?? null;
}

function gateForCurrentQuestion() {
  const reviewed = currentQuestionMeta()?.gate ?? null;
  if (reviewed) return reviewed;
  return /\bmedicare(?:\s+advantage)?\b/i.test(state.query) ? 'medicare' : null;
}

function kindLabel(kind) {
  return ({
    condition: 'skin condition',
    medical_service: 'medical service',
    cosmetic_service: 'cosmetic service',
    provider: 'provider',
    resource: 'practice resource'
  })[kind] ?? kind;
}

function meterElement(meter) {
  const wrap = node('div', 'meter');
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', `${meter.value} out of ${meter.scale}`);
  for (let index = 0; index < meter.scale; index += 1) wrap.append(node('span', index < meter.value ? 'is-filled' : ''));
  return wrap;
}

function renderKeyInfo(card) {
  const wrap = node('div', 'key-info');
  for (const item of card.atAGlance) {
    const row = node('div', 'key-info-row');
    row.append(node('p', '', item.label));
    const value = node('div');
    value.append(node('p', '', item.value));
    if (item.meter) value.append(meterElement(item.meter));
    row.append(value);
    wrap.append(row);
  }
  for (const footnote of card.atAGlanceFootnotes ?? []) wrap.append(node('p', 'footnote', `${footnote.ref} ${footnote.text}`));
  return wrap;
}

function renderQuestions(card, cardState) {
  const wrap = node('div', 'question-rows');
  for (const faq of card.faqs.slice(0, 3)) {
    const row = node('div', 'question-row');
    const button = node('button', 'accordion-trigger question-trigger');
    const panelId = `${card.pageId}-${faq.faqId}-answer`;
    const open = cardState.openFaqs.has(faq.faqId);
    button.type = 'button';
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-controls', panelId);
    button.append(node('span', '', faq.question));
    button.addEventListener('click', () => {
      if (cardState.openFaqs.has(faq.faqId)) cardState.openFaqs.delete(faq.faqId);
      else cardState.openFaqs.add(faq.faqId);
      renderResults();
    });
    row.append(button);
    const answer = node('p', 'question-answer', faq.answer);
    answer.id = panelId;
    answer.hidden = !open;
    row.append(answer);
    wrap.append(row);
  }
  return wrap;
}

function relationshipList(items) {
  const wrap = node('div', 'relationship-grid');
  for (const item of items.slice(0, 4)) wrap.append(externalLink(item.title, item.sourceUrl, 'relationship-link'));
  return wrap;
}

function schedulingRoute(card) {
  if (card.bookingRouteKey && card.bookingRouteKey !== 'none') return card.bookingRouteKey;
  // Resource pages may list several unrelated scheduler links. Choosing the
  // first one would silently turn a generic scheduling question into an
  // arbitrary visit reason.
  if (card.kind === 'resource') return null;
  return card.actions?.find(action => action.kind === 'schedule' && action.bookingRouteKey && action.bookingRouteKey !== 'none')?.bookingRouteKey ?? null;
}

function routeForCurrentQuestion(routeKey) {
  if (!/\b(?:virtual(?:ly)?|telemed(?:icine)?|video\s+(?:visit|appointment|call))\b/i.test(state.query)) return routeKey;
  return ({
    medical_acne: 'virtual_acne',
    medical_prescription_refill: 'virtual_prescription_refill',
    medical_follow_up: 'virtual_follow_up',
    medical_rash: 'virtual_focused',
    medical_hair_loss: 'virtual_focused',
    medical_focused: 'virtual_focused'
  })[routeKey] ?? routeKey;
}

function callState(message = 'This visit is scheduled directly by our office.') {
  const wrap = node('div', 'call-state');
  const strong = node('strong', '', 'CALL TO SCHEDULE: ');
  strong.append(externalLink(PHONE, TEL));
  wrap.append(strong, node('p', '', `*${message} Nothing has been requested on your behalf.`));
  return wrap;
}

function routeMeta(path, result) {
  const wrap = node('p', 'route-meta');
  const reason = path?.visitReason || path?.reason || result?.question || 'Revelus appointment';
  wrap.append(node('strong', '', reason));
  const location = path?.location === 'virtual' ? 'telemedicine · schedule online'
    : path?.mode === 'call' ? 'in-office · South Austin · scheduled by our office'
      : 'in-office · South Austin · book online';
  wrap.append(node('span', '', location));
  return wrap;
}

function selectControl(label, options, value, helper, onChange) {
  const wrap = node('div', 'step-select');
  const id = `select-${Math.random().toString(36).slice(2)}`;
  const labelNode = node('label', '', label);
  labelNode.htmlFor = id;
  const select = node('select');
  select.id = id;
  const placeholder = node('option', '', '- Choose -');
  placeholder.value = '';
  select.append(placeholder);
  for (const option of options) {
    const optionNode = node('option', '', option.label);
    optionNode.value = option.value;
    select.append(optionNode);
  }
  select.value = value ?? '';
  select.addEventListener('change', event => onChange(event.target.value));
  wrap.append(labelNode, select);
  if (helper) wrap.append(node('p', '', helper));
  return wrap;
}

function loadingTiles() {
  const grid = node('div', 'slot-skeleton-grid');
  for (let index = 0; index < 4; index += 1) grid.append(node('div', 'slot-skeleton'));
  grid.setAttribute('aria-label', 'Loading current times');
  return grid;
}

function handoffView(cardState) {
  const { provider, slot, url } = cardState.handoff;
  const wrap = node('div', 'handoff-view');
  wrap.append(node('h4', '', 'continuing to secure scheduling'));
  wrap.append(node('p', '', slot
    ? `${provider.name} · ${slot.date}, ${slot.time}. Review and complete scheduling securely with NextPatient.`
    : `${provider.name} · view additional current times securely with NextPatient.`));
  const actions = node('div', 'handoff-actions');
  actions.append(externalLink('Continue to NextPatient', url, 'inline-button'));
  const back = node('button', 'inline-button', 'Back');
  back.type = 'button';
  back.addEventListener('click', () => { cardState.handoff = null; renderResults(); });
  actions.append(back);
  wrap.append(actions, node('p', 'disclaimer', '*Nothing is held or booked until you complete scheduling there.'));
  return wrap;
}

function renderProviderRows(card, cardState, availability) {
  const wrap = node('div');
  if (cardState.handoff) return handoffView(cardState);
  if (availability?.banner) wrap.append(node('p', 'schedule-banner', `*${availability.banner}`));
  const projected = new Map((availability?.providers ?? []).map(provider => [provider.providerId, provider]));
  const displayProviders = availability?.providerScope === 'route' ? availability.providers : card.providers;
  for (const provider of displayProviders) {
    const row = node('div', 'provider-row');
    if (provider.portraitUrl) {
      const image = node('img');
      image.src = provider.portraitUrl;
      image.alt = `${provider.name} portrait`;
      image.referrerPolicy = 'no-referrer';
      row.append(image);
    } else row.append(node('div', 'provider-placeholder'));
    const header = node('div', 'provider-header');
    const name = node('p', 'provider-name');
    name.append(externalLink(provider.name, provider.sourceUrl));
    header.append(name, node('p', 'provider-role', provider.role || provider.credential));
    row.append(header);
    const body = node('div', 'provider-body');
    const live = projected.get(provider.providerId);
    if (!availability || cardState.pathLoading.size) {
      body.append(loadingTiles());
    } else if (!live?.bookable) {
      body.append(callState(live?.reason || 'No online times are currently shown for this provider and visit type.'));
    } else {
      const grid = node('div', 'slot-grid');
      for (const slot of live.slots.slice(0, 3)) {
        const button = node('button', 'slot-tile');
        button.type = 'button';
        button.append(node('strong', '', slot.date), node('span', '', slot.time));
        button.addEventListener('click', () => {
          cardState.handoff = { provider, slot, url: slot.handoffUrl };
          renderResults();
        });
        grid.append(button);
      }
      if (live.more) {
        const more = node('button', 'slot-tile');
        more.type = 'button';
        more.append(node('strong', '', 'More…'));
        more.addEventListener('click', () => {
          cardState.handoff = { provider, slot: null, url: live.more };
          renderResults();
        });
        grid.append(more);
      }
      body.append(grid);
    }
    row.append(body);
    wrap.append(row);
  }
  return wrap;
}

function renderPlanClarification(card, cardState, result) {
  const plan = result.plan ?? {};
  if (result.status === 'clarification_required' && result.missingFields?.includes('medicare')) {
    return selectControl(
      'are you a Medicare patient?',
      [{ value: 'yes', label: 'yes' }, { value: 'no', label: 'no' }],
      '',
      'Medicare patients are seen in a dedicated Medicare appointment.',
      value => {
        if (!value) return;
        cardState.medicare = value === 'yes';
        if (cardState.medicare) {
          resolveCard(card, {
            intent: 'general_medical_concerns',
            preferredLocation: 'in-office',
            patientStatus: 'unknown',
            medicare: true,
            concernCount: 1,
            concerns: [concernForCard(card)],
            needsSkinCancerScreening: card.pageId === 'skin-cancer-screening'
          });
        } else {
          cardState.planResult = null;
          ensureCardPlan(card);
        }
      }
    );
  }
  if (plan.evaluationAsk) {
    return selectControl(
      'have you already been evaluated for this at Revelus?',
      [
        { value: 'evaluated_by_revelus', label: 'yes' },
        { value: 'needs_evaluation', label: 'no' }
      ],
      '',
      'If Revelus already recommended the procedure, the office schedules it directly. Otherwise, start with an evaluation.',
      value => value && resolveCard(card, {
        intent: 'staff_scheduled_procedure',
        procedureKey: card.schedulingPolicy.procedureKey,
        evaluationStatus: value
      })
    );
  }
  if (result.status === 'clarification_required' && result.missingFields?.includes('hasRecentConsultOrPackage')) {
    return selectControl(
      'do you have an existing package or a consultation within the last 90 days?',
      [{ value: 'yes', label: 'yes' }, { value: 'no', label: 'no' }],
      '',
      result.question,
      value => value && resolveCard(card, {
        routeKey: cardState.selectedVisit || schedulingRoute(card),
        hasRecentConsultOrPackage: value === 'yes'
      })
    );
  }
  return null;
}

function renderProviders(card, cardState) {
  const wrap = node('div');
  if (card.match?.entryKind === 'provider_relationship' && card.providers?.length) {
    const directory = node('div', 'provider-directory');
    for (const provider of card.providers) {
      const row = node('div', 'provider-row provider-directory-row');
      if (provider.portraitUrl) {
        const image = node('img');
        image.src = provider.portraitUrl;
        image.alt = `${provider.name} portrait`;
        image.referrerPolicy = 'no-referrer';
        row.append(image);
      } else row.append(node('div', 'provider-placeholder'));
      const header = node('div', 'provider-header');
      const name = node('p', 'provider-name');
      name.append(externalLink(provider.name, provider.sourceUrl));
      header.append(name, node('p', 'provider-role', provider.role || provider.credential));
      row.append(header);
      directory.append(row);
    }
    wrap.append(directory, node('p', 'disclaimer', '*Provider list is based on relationships published by Revelus.'));
    return wrap;
  }
  if (card.kind === 'provider') {
    if (!card.visitOptions?.length) {
      wrap.append(callState('This provider’s visits are scheduled directly by the Revelus office.'));
      return wrap;
    }
    wrap.append(selectControl(
      'schedule online',
      card.visitOptions.map(option => ({ value: option.bookingRouteKey, label: option.label })),
      cardState.selectedVisit,
      cardState.selectedVisit ? null : `Choose a visit type to see ${card.title.replace(/,.*$/, '')}’s current scheduling mode and next available times.`,
      value => {
        cardState.selectedVisit = value;
        cardState.planResult = null;
        cardState.availability.clear();
        cardState.handoff = null;
        if (value) resolveCard(card, { routeKey: value });
        else renderResults();
      }
    ));
    if (!cardState.selectedVisit) return wrap;
  }

  if (cardState.loadingPlan) {
    wrap.append(node('p', 'schedule-banner', '*Finding the validated visit path…'), loadingTiles());
    return wrap;
  }
  if (cardState.localCallReason) {
    wrap.append(callState(cardState.localCallReason));
    return wrap;
  }
  const result = cardState.planResult;
  if (!result) {
    wrap.append(node('p', 'schedule-banner', '*Open this section to resolve the appropriate Revelus visit path.'));
    return wrap;
  }
  const clarification = renderPlanClarification(card, cardState, result);
  if (clarification) {
    wrap.append(clarification);
    return wrap;
  }
  if (result.staffAssistance && !(result.plan?.paths?.length)) {
    wrap.append(callState(result.staffAssistance.message));
    return wrap;
  }
  const paths = (result.plan?.paths ?? []).filter(path => !path.attachTo || path.attachTo === card.pageId);
  if (!paths.length) {
    wrap.append(callState(result.plan?.gate?.reason || 'This page does not expose an online appointment path.'));
    return wrap;
  }
  for (const path of paths) {
    wrap.append(routeMeta(path, result));
    if (path.mode === 'self_schedule_online' || path.schedulingUrl) {
      wrap.append(externalLink('Open Secure Scheduling', path.schedulingUrl, 'inline-button'));
      wrap.append(node('p', 'disclaimer', '*Nothing is held until you finish scheduling there.'));
      continue;
    }
    if (path.mode === 'call') {
      wrap.append(callState(path.guidance));
      continue;
    }
    const availability = cardState.availability.get(path.pathId);
    if (availability?.mode === 'self_schedule_online' && availability.schedulingUrl) {
      wrap.append(externalLink('Open Secure Scheduling', availability.schedulingUrl, 'inline-button'));
    } else if (availability?.mode === 'call' && !availability.providers?.length) {
      wrap.append(callState(availability.banner || 'Online scheduling is unavailable right now.'));
    } else {
      wrap.append(renderProviderRows(card, cardState, availability));
    }
  }
  return wrap;
}

function accordionPanel(card, cardState, key) {
  if (key === 'key') return renderKeyInfo(card);
  if (key === 'questions') return renderQuestions(card, cardState);
  if (key === 'treatments') return relationshipList(card.relationships.treatment_for);
  if (key === 'conditions') {
    const merged = [...(card.relationships.condition_addressed ?? []), ...(card.conditionsAddressed ?? [])];
    const unique = [...new Map(merged.map(item => [item.pageId, item])).values()];
    return relationshipList(unique);
  }
  if (key === 'related') return relationshipList(card.relationships.related_condition);
  if (key === 'providers') return renderProviders(card, cardState);
  return node('div');
}

function accordionDefinitions(card) {
  const definitions = [];
  if (card.atAGlance?.length) definitions.push({ key: 'key', label: 'key information' });
  if (card.faqs?.length) definitions.push({ key: 'questions', label: 'questions' });
  if (card.relationships?.treatment_for?.length) definitions.push({ key: 'treatments', label: 'treatments' });
  const conditions = [...(card.relationships?.condition_addressed ?? []), ...(card.conditionsAddressed ?? [])];
  if (conditions.length) definitions.push({ key: 'conditions', label: 'conditions' });
  if (card.relationships?.related_condition?.length) definitions.push({ key: 'related', label: 'related' });
  const hasRoute = schedulingRoute(card) || card.schedulingPolicy?.type === 'staff_scheduled_procedure';
  if (card.kind === 'provider' || card.providers?.length || hasRoute) {
    definitions.push({ key: 'providers', label: card.kind === 'provider' ? 'availability' : 'providers' });
  }
  return definitions;
}

function renderCard(card) {
  const cardState = cardStateFor(card.pageId);
  const article = node('article', 'result-card');
  article.dataset.pageId = card.pageId;
  const root = node('div', 'card-root');
  const copy = node('div', 'card-copy');
  const title = node('h3', 'card-title');
  title.append(externalLink(card.title, card.sourceUrl));
  copy.append(title, node('p', 'card-kind', kindLabel(card.kind)), node('p', 'card-summary', card.summary));
  root.append(copy);
  if (card.hero?.url) {
    const image = node('img', 'card-image');
    image.src = card.hero.url;
    image.alt = card.hero.alt || '';
    image.referrerPolicy = 'no-referrer';
    root.append(image);
  } else root.append(node('div', 'card-image-placeholder'));
  article.append(root);

  const accordions = node('div', 'card-accordions');
  for (const definition of accordionDefinitions(card)) {
    const section = node('div', 'card-accordion');
    const button = node('button', 'accordion-trigger');
    const panelId = `${card.pageId}-${definition.key}-panel`;
    const open = cardState.open.has(definition.key);
    button.type = 'button';
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-controls', panelId);
    button.append(node('span', '', definition.label));
    button.addEventListener('click', async () => {
      const opening = !cardState.open.has(definition.key);
      if (opening) cardState.open.add(definition.key);
      else cardState.open.delete(definition.key);
      renderResults();
      if (!opening) return;
      try {
        if (definition.key === 'providers' && card.match?.entryKind !== 'provider_relationship') await ensureCardPlan(card);
        else if (!cardState.answered && card.match?.entryId) await state.actions.answer({ entryId: card.match.entryId });
      } catch (error) {
        showCardError(card, error);
      }
    });
    section.append(button);
    const panel = node('div', 'accordion-panel');
    panel.id = panelId;
    panel.hidden = !open;
    if (open) panel.append(accordionPanel(card, cardState, definition.key));
    section.append(panel);
    accordions.append(section);
  }
  article.append(accordions);
  return article;
}

function renderGate() {
  const gate = state.questionGate ?? state.pageGate;
  dom['result-gate'].replaceChildren();
  dom['result-gate'].className = 'result-gate';
  if (!gate || (gate.kind === 'two_visit' && state.gateAcknowledged)) {
    dom['result-gate'].classList.add('is-hidden');
    return;
  }
  if (gate.kind === 'privacy') {
    dom['result-gate'].classList.add('is-private');
    dom['result-gate'].append(node('h3', '', "let's keep that private"), node('p', '', gate.message));
    const actions = node('div', 'gate-actions');
    for (const action of gate.actions) actions.append(externalLink(action.label, action.url ?? action.href, 'inline-button'));
    actions.append(node('span', 'disclaimer', '*Nothing was searched, saved, or scheduled.'));
    dom['result-gate'].append(actions);
    return;
  }
  dom['result-gate'].append(node('h3', '', gate.title ?? 'two separate appointments'), node('p', '', gate.text));
  const actions = node('div', 'gate-actions');
  const acknowledge = node('button', 'inline-button', 'I Understand');
  acknowledge.type = 'button';
  acknowledge.addEventListener('click', async () => {
    state.gateAcknowledged = true;
    renderResults();
    dom['results-title'].focus({ preventScroll: true });
    await loadEveryResolvedPath();
  });
  actions.append(acknowledge);
  dom['result-gate'].append(actions);
}

function renderResults() {
  const visible = state.searchStatus !== 'idle';
  dom.results.classList.toggle('is-hidden', !visible);
  dom['results-nav-link'].classList.toggle('is-hidden', !visible);
  if (!visible) return;
  renderGate();
  if (state.searchStatus === 'loading') {
    const loading = node('div', 'result-card result-status-card');
    loading.append(node('h3', '', 'searching published Revelus pages'), node('p', '', 'Checking the practice’s published information…'));
    dom['results-list'].replaceChildren(loading);
    dom['results-list'].classList.remove('is-dimmed');
    dom['results-list'].removeAttribute('inert');
    dom['results-list'].setAttribute('aria-hidden', 'false');
    dom['view-more-button'].classList.add('is-hidden');
    return;
  }
  dom['results-list'].replaceChildren(...state.results.slice(0, state.shown).map(renderCard));
  const blocked = Boolean((state.questionGate?.kind === 'two_visit' || state.pageGate?.kind === 'two_visit') && !state.gateAcknowledged);
  dom['results-list'].classList.toggle('is-dimmed', blocked);
  dom['results-list'].toggleAttribute('inert', blocked);
  dom['results-list'].setAttribute('aria-hidden', blocked ? 'true' : 'false');
  if (!state.results.length && state.searchStatus !== 'refused') {
    const empty = node('div', 'result-card');
    if (state.searchStatus === 'error') {
      empty.append(node('h3', '', 'search is temporarily unavailable'), node('p', '', 'Please try again. If you need help now, contact Revelus by secure chat or phone.'));
    } else {
      empty.append(node('h3', '', 'no published page matched that question'), node('p', '', 'Try naming a condition, treatment, provider, price, or appointment topic.'));
    }
    dom['results-list'].append(empty);
  }
  dom['view-more-button'].classList.toggle('is-hidden', state.shown >= state.results.length);
}

function showCardError(card, error) {
  console.error(error);
  const cardState = cardStateFor(card.pageId);
  cardState.loadingPlan = false;
  cardState.pathLoading.clear();
  cardState.localCallReason = 'Online scheduling is unavailable right now. Call Revelus to continue.';
  renderResults();
  announce('Online scheduling is unavailable. Call Revelus to continue.');
}

function directInputFor(card) {
  if (card.schedulingPolicy?.type === 'staff_scheduled_procedure') {
    return { intent: 'staff_scheduled_procedure', procedureKey: card.schedulingPolicy.procedureKey, evaluationStatus: 'unknown' };
  }
  const routeKey = schedulingRoute(card);
  return routeKey ? { routeKey: routeForCurrentQuestion(routeKey) } : null;
}

function concernForCard(card) {
  return ({ acne: 'acne', 'hair-loss': 'hair_loss', 'rash-evaluation': 'rash', 'prescription-refills': 'prescription_refill', 'follow-up-evaluation': 'follow_up' })[card.pageId] ?? 'other';
}

async function ensureCardPlan(card) {
  const cardState = cardStateFor(card.pageId);
  if (card.kind === 'provider') {
    if (!card.visitOptions?.length) {
      cardState.localCallReason = 'This provider’s visits are scheduled directly by the Revelus office.';
      renderResults();
    }
    return;
  }
  if (cardState.planResult || cardState.loadingPlan || cardState.localCallReason) return;
  if (gateForCurrentQuestion() === 'medicare' && card.kind !== 'cosmetic_service' && cardState.medicare === null) {
    cardState.planResult = {
      status: 'clarification_required',
      missingFields: ['medicare'],
      question: 'Are you a Medicare patient?',
      plan: { gate: { kind: 'medicare_ask' }, paths: [] }
    };
    renderResults();
    return;
  }
  let input = directInputFor(card);
  if (!input) {
    const language = await state.resolver.resolve({ text: state.query });
    const concepts = [...(language.concepts ?? []), ...(language.secondaryConcepts ?? [])];
    const concept = concepts.find(item => item.sourceUrl === card.sourceUrl);
    if (concept?.bookingRouteCandidate) {
      input = { routeKey: routeForCurrentQuestion(concept.bookingRouteCandidate) };
    }
  }
  if (!input) {
    cardState.localCallReason = card.providers?.length
      ? 'This page lists Revelus providers but does not publish a direct online visit route.'
      : 'This page is informational and does not publish an online visit route.';
    renderResults();
    return;
  }
  await resolveCard(card, input);
}

async function resolveCard(card, input) {
  const cardState = cardStateFor(card.pageId);
  cardState.loadingPlan = true;
  cardState.planResult = null;
  cardState.availability.clear();
  cardState.handoff = null;
  state.pendingCardId = card.pageId;
  renderResults();
  try {
    const result = await state.actions.resolve(input, { attachTo: card.pageId });
    if (result.plan?.evaluationAsk || result.status === 'clarification_required' || result.plan?.gate?.kind === 'two_visit' || (result.staffAssistance && !result.plan?.paths?.length)) return;
    await loadPaths(card.pageId, result.plan?.paths ?? []);
  } catch (error) {
    showCardError(card, error);
  }
}

async function loadPaths(pageId, paths) {
  const cardState = cardStateFor(pageId);
  const owned = paths.filter(path => !path.attachTo || path.attachTo === pageId);
  for (const path of owned) cardState.pathLoading.add(path.pathId);
  renderResults();
  await Promise.all(owned.map(async path => {
    try {
      await state.actions.availability({ pathId: path.pathId });
    } catch (error) {
      const card = state.results.find(item => item.pageId === pageId);
      if (card) showCardError(card, error);
    }
  }));
}

async function loadEveryResolvedPath() {
  for (const card of state.results) {
    const cardState = cardStateFor(card.pageId);
    if (cardState.planResult?.plan?.paths?.length) await loadPaths(card.pageId, cardState.planResult.plan.paths);
  }
}

async function runSearch(query) {
  const clean = query.trim();
  if (clean.length < 2) {
    dom['question-input'].focus();
    announce('Please enter at least two characters.');
    return;
  }
  await pageReady;
  gates.begin();
  resetQuestionState();
  state.query = clean;
  state.searchStatus = 'loading';
  state.questionGate = currentQuestionMeta()?.gate === 'two_visit' ? { kind: 'two_visit' } : null;
  dom['question-form'].classList.add('is-loading');
  dom['ask-button'].disabled = true;
  renderResults();
  announce('Searching published Revelus pages…');
  try {
    await state.actions.search({ query: clean, limit: 10 });
    if (state.results.length === 1 && cardStateFor(state.results[0].pageId).open.has('providers')) {
      await ensureCardPlan(state.results[0]);
    }
    requestAnimationFrame(() => {
      const offset = document.querySelector('.site-header').offsetHeight + document.querySelector('.page-nav').offsetHeight + 20;
      window.scrollTo({ top: dom.results.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
      const gateAction = dom['result-gate'].querySelector('button, a');
      (gateAction ?? dom['results-title']).focus({ preventScroll: true });
    });
  } catch (error) {
    console.error(error);
    resetQuestionState();
    state.query = clean;
    state.searchStatus = 'error';
    renderResults();
    announce('The search could not be completed. Please try again or contact Revelus.');
  } finally {
    dom['question-form'].classList.remove('is-loading');
    dom['ask-button'].disabled = false;
  }
}

function initializeQuestionPool() {
  const sections = [...new Set(COMMON_QUESTIONS.map(item => item.section))];
  const cursors = new Map();
  function fillFrom(items, key) {
    const cursor = cursors.get(key) ?? 0;
    dom['question-input'].value = items[cursor % items.length].text;
    cursors.set(key, cursor + 1);
    dom['question-input'].focus();
  }
  for (const section of [...sections, 'Any question']) {
    const items = section === 'Any question' ? COMMON_QUESTIONS : COMMON_QUESTIONS.filter(item => item.section === section);
    const button = node('button', 'question-chip', section);
    button.type = 'button';
    button.addEventListener('click', () => fillFrom(items, section));
    dom['topic-chips'].append(button);
  }
  const gateLabels = [
    ['two_visit', 'two appointments'],
    ['medicare', 'medicare'],
    ['staff_assistance', 'call to schedule'],
    ['refusal', 'about my records']
  ];
  for (const [gate, label] of gateLabels) {
    const items = COMMON_QUESTIONS.filter(item => item.gate === gate);
    const button = node('button', 'question-chip', label);
    button.type = 'button';
    button.addEventListener('click', () => fillFrom(items, gate));
    dom['gate-chips'].append(button);
  }
}

async function initialize() {
  const client = createKnowledgeClient();
  state.knowledge = client.knowledge;
  state.resolver = client.resolver;
  state.getConcept = client.getConcept;
  const publicEntities = await client.getPublicEntities();
  state.publicEntityNames = publicEntities.names;
  state.publicProvidersBySource = new Map((publicEntities.providers ?? []).map(provider => [normalizedPublicUrl(provider.sourceUrl), provider]));
  const handoffBaseUrl = new URL('/handoff.html', location.origin).href;
  state.session = createBookingSession({
    handoffBaseUrl,
    ...(location.protocol === 'https:' ? { trustedHttpsOrigin: location.origin } : {})
  });
  const availabilityExecutor = createNextPatientAvailabilityExecutor({ session: state.session });
  state.actions = createChallengeActions({
    knowledge: state.knowledge,
    session: state.session,
    availabilityExecutor,
    providerForSource: sourceUrl => state.publicProvidersBySource.get(normalizedPublicUrl(sourceUrl)) ?? null,
    captureContext: () => gates.capture(),
    onUpdate: onToolUpdate
  });
  let native = Boolean(document.modelContext?.registerTool);
  if (!native) ({ native } = installModelContextShim(document));
  await registerChallengeTools({ modelContext: document.modelContext, actions: state.actions });
  dom['connection-status'].textContent = native ? 'Native WebMCP connected' : 'WebMCP demo connected';
  dom['question-input'].disabled = false;
  dom['ask-button'].disabled = false;
  dom['question-pool-toggle'].disabled = false;
  announce(native ? 'Native WebMCP connected.' : 'WebMCP demo connected.');
}

dom['question-form'].addEventListener('submit', event => {
  event.preventDefault();
  runSearch(dom['question-input'].value);
});
dom['question-pool-toggle'].addEventListener('click', () => {
  const open = dom['question-pool-toggle'].getAttribute('aria-expanded') !== 'true';
  dom['question-pool-toggle'].setAttribute('aria-expanded', String(open));
  dom['question-pool'].classList.toggle('is-hidden', !open);
});
dom['view-more-button'].addEventListener('click', () => {
  const firstNewResult = state.shown;
  state.shown += 4;
  renderResults();
  document.querySelectorAll('.result-card')[firstNewResult]?.querySelector('a, button')?.focus({ preventScroll: true });
  announce(`${Math.min(state.shown, state.results.length)} results are now visible.`);
});
dom['ask-again-button'].addEventListener('click', () => {
  dom['question-input'].focus();
  dom['question-input'].select();
  document.getElementById('ask').scrollIntoView({ behavior: 'smooth' });
});
dom['faq-more-button'].addEventListener('click', () => {
  for (const item of document.querySelectorAll('.faq-extra')) item.classList.remove('is-hidden');
  dom['faq-more-button'].classList.add('is-hidden');
});

for (const button of document.querySelectorAll('.faq-trigger')) {
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    document.getElementById(button.getAttribute('aria-controls')).hidden = !open;
  });
}

initializeQuestionPool();
renderResults();
const pageReady = initialize().catch(error => {
  console.error(error);
  dom['connection-status'].textContent = 'WebMCP could not initialize';
  announce('This experience could not initialize. Please refresh or contact Revelus.');
  throw error;
});
