import { sensitiveInputReason } from './input-privacy.mjs';
import { schedulingPolicyForSource } from './service-scheduling-policy.mjs';

function normalize(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function containsPhrase(text, phrase) {
  const needle = normalize(phrase);
  return needle && ` ${text} `.includes(` ${needle} `);
}

function distance(left, right) {
  const rows = Array.from({ length: left.length + 1 }, (_, index) => [index]);
  rows[0] = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
    }
  }
  return rows[left.length][right.length];
}

function fuzzyPhrase(text, phrase) {
  const queryTokens = normalize(text).split(' ').filter(Boolean);
  const phraseTokens = normalize(phrase).split(' ').filter(Boolean);
  if (phraseTokens.length < 2) return false;
  let exactMatches = 0;
  const allMatched = phraseTokens.every(token => queryTokens.some(candidate => {
    if (candidate === token) {
      exactMatches += 1;
      return true;
    }
    if (token.length < 5 || candidate.length < 5) return false;
    return distance(candidate, token) <= 2;
  }));
  return allMatched && exactMatches >= 1;
}

function bestMatch(concept, text, excluded = new Set()) {
  if (concept.negativeSignals.some(surface => containsPhrase(text, surface))) return null;
  const groups = [
    ['T1', 'strong', 100, concept.strongSignals],
    ['T1', 'patient_phrase', 100, concept.patientPhrases],
    ['T2', 'misspelling', 80, concept.commonMisspellings],
    ['T3', 'weak', 50, concept.weakSignals]
  ];
  const exactMatches = [];
  for (const [tier, matchType, score, surfaces] of groups) {
    for (const surface of surfaces) {
      if (excluded.has(normalize(surface)) || !containsPhrase(text, surface)) continue;
      exactMatches.push({ concept, tier, matchType, score, matchedSurface: surface });
    }
  }
  if (exactMatches.length) {
    exactMatches.sort((a, b) => b.score - a.score || normalize(b.matchedSurface).length - normalize(a.matchedSurface).length);
    const exact = exactMatches[0];
    const fuzzySpecific = [concept.canonicalLabel, ...concept.patientPhrases].find(surface =>
      !excluded.has(normalize(surface)) &&
      normalize(surface).length > normalize(exact.matchedSurface).length &&
      containsPhrase(normalize(surface), exact.matchedSurface) &&
      fuzzyPhrase(text, surface)
    );
    if (fuzzySpecific) return { concept, tier: 'T2', matchType: 'fuzzy', score: 70, matchedSurface: fuzzySpecific };
    return exact;
  }
  const fuzzySurface = [concept.canonicalLabel, ...concept.patientPhrases].find(surface => !excluded.has(normalize(surface)) && fuzzyPhrase(text, surface));
  if (fuzzySurface) return { concept, tier: 'T2', matchType: 'fuzzy', score: 70, matchedSurface: fuzzySurface };
  return null;
}

function conceptView(match) {
  const { concept } = match;
  return {
    conceptId: concept.conceptId,
    canonicalLabel: concept.canonicalLabel,
    kind: concept.kind,
    sourceUrl: concept.sourceUrl,
    matchedSurface: match.matchedSurface,
    matchType: match.matchType
  };
}

function canonicalMentions(text, concepts) {
  const mentions = [];
  for (const concept of concepts) {
    const phrase = normalize(concept.canonicalLabel);
    let index = ` ${text} `.indexOf(` ${phrase} `);
    if (index >= 0) mentions.push({ concept, phrase, start: index, end: index + phrase.length });
  }
  mentions.sort((a, b) => (b.end - b.start) - (a.end - a.start));
  const selected = [];
  for (const mention of mentions) {
    if (!selected.some(item => mention.start >= item.start && mention.end <= item.end)) selected.push(mention);
  }
  return selected;
}

function output(status, confidenceTier, concepts = [], ambiguity = null, rejectionReason = null) {
  return { status, confidenceTier, concepts, ambiguity, rejectionReason, bookingAllowed: false };
}

export function createPatientLanguageResolver({ registry, allowedPublicNames = [] }) {
  if (!registry?.concepts || !registry?.ambiguities) throw new Error('Patient-language registry is unavailable');
  const concepts = registry.concepts;
  const publicNames = [...allowedPublicNames, ...concepts.map(concept => concept.canonicalLabel)];
  const byId = new Map(concepts.map(concept => [concept.conceptId, concept]));

  const resolveCore = input => {
    {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Resolver input must be an object');
      const extra = Object.keys(input).filter(key => key !== 'text');
      if (extra.length) throw new Error(`Unsupported resolver fields: ${extra.join(', ')}`);
      if (typeof input.text !== 'string' || input.text.length < 2 || input.text.length > 180) throw new Error('Resolver text must contain 2 to 180 characters');
      const reason = sensitiveInputReason(input.text, { allowedPublicNames: publicNames });
      if (reason) return output('rejected', 'T4', [], null, reason);
      const text = normalize(input.text);
      const negationText = input.text.toLowerCase().replace(/['’]/g, '');
      if (/\b(?:not|dont|do not|anything but|anything except|except|without|avoid)\b/.test(negationText)) return output('no_match', 'T4');
      if (text.includes(' i mean ')) {
        const intended = text.split(' i mean ').at(-1);
        const mentions = canonicalMentions(intended, concepts);
        if (mentions.length === 1) {
          const match = { concept: mentions[0].concept, matchedSurface: mentions[0].concept.canonicalLabel, matchType: 'explicit_choice' };
          return output('resolved', 'T1', [conceptView(match)]);
        }
      }
      const explicitMentions = canonicalMentions(text, concepts);
      const acneScarContext = !explicitMentions.some(item => item.concept.canonicalLabel === 'Acne Scars') && /\bacne\b/.test(text) && /\bscars?\b/.test(text);
      if (explicitMentions.length >= 2 && /\b(?:and|or|versus|vs)\b/.test(text) && !acneScarContext) {
        const views = explicitMentions.map(item => conceptView({ concept: item.concept, matchedSurface: item.concept.canonicalLabel, matchType: 'explicit_multi' }));
        return output('multi_match', 'T2', views);
      }
      // When active acne and its resulting scars are discussed as one
      // sequencing concern, the compound condition is more specific than
      // treating the two separated words as unrelated generic topics.
      if (acneScarContext) {
        const acneScars = concepts.find(concept => concept.canonicalLabel === 'Acne Scars');
        if (acneScars) {
          return output('resolved', 'T2', [conceptView({
            concept: acneScars,
            matchedSurface: 'acne scars',
            matchType: 'compound_context'
          })]);
        }
      }
      if (explicitMentions.length === 1 && schedulingPolicyForSource(explicitMentions[0].concept.sourceUrl)) {
        const item = explicitMentions[0];
        return output('resolved', 'T1', [conceptView({ concept: item.concept, matchedSurface: item.concept.canonicalLabel, matchType: 'explicit_choice' })]);
      }
      for (const item of registry.ambiguities) {
        const trigger = item.triggerPhrases.find(phrase => containsPhrase(text, phrase));
        if (!trigger) continue;
        const excluded = new Set(item.triggerPhrases.map(normalize));
        const discriminatingMatches = concepts
          .map(concept => bestMatch(concept, text, excluded))
          .filter(Boolean)
          .filter(match => match.matchType !== 'fuzzy')
          .filter(match => !containsPhrase(trigger, match.matchedSurface))
          .sort((a, b) => b.score - a.score || normalize(b.matchedSurface).length - normalize(a.matchedSurface).length);
        if (discriminatingMatches.length) {
          const best = discriminatingMatches[0];
          const tied = discriminatingMatches.filter(match => match.score === best.score && normalize(match.matchedSurface).length === normalize(best.matchedSurface).length);
          if (tied.length === 1 && best.score >= 70) return output('resolved', best.tier, [conceptView(best)]);
        }
        const candidateMatches = item.candidateConceptIds
          .map(conceptId => bestMatch(byId.get(conceptId), text, excluded))
          .filter(Boolean)
          .filter(match => !containsPhrase(trigger, match.matchedSurface))
          .sort((a, b) => b.score - a.score);
        const candidate = candidateMatches[0];
        const qualifiedFuzzy = candidate?.matchType === 'fuzzy' &&
          normalize(candidate.matchedSurface).split(' ').length > normalize(trigger).split(' ').length &&
          containsPhrase(normalize(candidate.matchedSurface), trigger);
        if (candidateMatches.length === 1 && candidate.score >= 70 && (candidate.matchType !== 'fuzzy' || qualifiedFuzzy)) {
          return output('resolved', candidate.tier, [conceptView(candidate)]);
        }
        const ambiguity = {
          ambiguityId: item.ambiguityId,
          candidateConceptIds: item.candidateConceptIds,
          clarificationQuestion: item.clarificationQuestion,
          options: item.options
        };
        return output('ambiguous', 'T3', [], ambiguity);
      }
      const matches = concepts.map(concept => bestMatch(concept, text)).filter(Boolean).sort((a, b) => b.score - a.score || normalize(b.matchedSurface).length - normalize(a.matchedSurface).length);
      if (!matches.length) return output('no_match', 'T4');
      const exactTop = matches[0];
      const moreSpecificFuzzy = matches.find(match =>
        match.matchType === 'fuzzy' &&
        normalize(match.matchedSurface).length > normalize(exactTop.matchedSurface).length &&
        containsPhrase(normalize(match.matchedSurface), exactTop.matchedSurface)
      );
      if (moreSpecificFuzzy) {
        matches.splice(matches.indexOf(moreSpecificFuzzy), 1);
        matches.unshift(moreSpecificFuzzy);
      }
      const topLength = normalize(matches[0].matchedSurface).length;
      const topMatches = matches.filter(match => match.score === matches[0].score && normalize(match.matchedSurface).length === topLength);
      if (topMatches.length > 1 || matches[0].score < 70) {
        const candidates = topMatches.map(match => match.concept.conceptId);
        return output('ambiguous', 'T3', [], {
          ambiguityId: null,
          candidateConceptIds: candidates,
          clarificationQuestion: 'Which of these topics did you mean?',
          options: topMatches.map(match => ({ label: match.concept.canonicalLabel, conceptId: match.concept.conceptId }))
        });
      }
      return output('resolved', matches[0].tier, [conceptView(matches[0])]);
    }
  };

  // Secondary-concern scan: after a question resolves to one concept, any
  // OTHER concept with its own exact (non-fuzzy) surface in the text is kept
  // as a secondary concern so multi-concern questions never drop a topic.
  // Surfaces that overlap the primary match are ignored.
  const secondaryConceptsFor = (result, rawText) => {
    const primary = result.concepts[0];
    if (!primary) return [];
    const text = normalize(rawText);
    const primarySurface = normalize(primary.matchedSurface ?? '');
    const primaryConcept = byId.get(primary.conceptId);
    const primaryUrl = primaryConcept?.sourceUrl ?? null;
    const found = [];
    for (const concept of concepts) {
      if (concept.conceptId === primary.conceptId) continue;
      if (primaryConcept?.canonicalLabel === 'Acne Scars' && concept.canonicalLabel === 'Scars') continue;
      if (primaryUrl && concept.sourceUrl === primaryUrl) continue;
      const match = bestMatch(concept, text);
      if (!match || match.matchType === 'fuzzy' || match.tier === 'T3') continue;
      const surface = normalize(match.matchedSurface);
      if (!surface || surface === primarySurface) continue;
      if (primarySurface.includes(surface) || surface.includes(primarySurface)) continue;
      // "…is that a keloid?" names a differential of the same concern, not a
      // second concern.
      if (new RegExp(`\\b(?:is|could) (?:that|this|it) (?:be )?(?:a |an )?${surface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)) continue;
      found.push(match);
    }
    found.sort((a, b) => b.score - a.score || normalize(b.matchedSurface).length - normalize(a.matchedSurface).length);
    const seen = new Set();
    const views = [];
    for (const match of found) {
      const url = match.concept.sourceUrl;
      if (seen.has(url)) continue;
      seen.add(url);
      views.push(conceptView(match));
      if (views.length === 2) break;
    }
    return views;
  };

  return {
    resolve(input) {
      const result = resolveCore(input);
      if (result.status === 'resolved') {
        const secondary = secondaryConceptsFor(result, input.text);
        if (secondary.length) return { ...result, secondaryConcepts: secondary };
      }
      return result;
    }
  };
}
