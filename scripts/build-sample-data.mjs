import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const dataDirectory = new URL('data/', root);
const curatedDirectory = new URL('data/curated/', root);
const testDirectory = new URL('test/', root);
const generatedAt = '2026-09-03T00:00:00.000Z';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;

const samples = [
  {
    pageId: 'eczema-demo', pageType: 'condition', kind: 'condition', wordpressId: 9001,
    title: 'Eczema information', url: 'https://revelusdermatology.com/conditions/eczema/',
    summary: 'A synthetic demonstration record explaining that recurring itchy patches can be discussed with a dermatology professional.',
    phrases: ['eczema', 'itchy patch on my elbow', 'recurring itchy patch'],
    bookingRouteCandidate: 'medical_focused',
    faqs: [{
      question: 'Can a dermatologist evaluate a recurring itchy patch?',
      answer: 'Yes. A dermatology visit can evaluate a recurring itchy patch. This demonstration does not diagnose the cause.'
    }]
  },
  {
    pageId: 'acne-demo', pageType: 'condition', kind: 'condition', wordpressId: 9002,
    title: 'Acne information', url: 'https://revelusdermatology.com/conditions/acne/',
    summary: 'A synthetic demonstration record covering adult acne, breakouts, and the role of an acne evaluation.',
    phrases: ['acne', 'adult acne', 'breakouts', 'in my 30s still get breakouts', 'breakout treatment options'],
    bookingRouteCandidate: 'medical_acne',
    faqs: [{
      question: "I'm in my 30s and still get breakouts. What are my options?",
      answer: 'Yes. Adults with persistent breakouts can schedule an acne evaluation to discuss appropriate options.'
    }]
  },
  {
    pageId: 'hair-loss-demo', pageType: 'condition', kind: 'condition', wordpressId: 9003,
    title: 'Hair loss information', url: 'https://revelusdermatology.com/conditions/hair-loss/',
    summary: 'A synthetic demonstration record for questions about thinning hair and hair-loss evaluations.',
    phrases: ['hair loss', 'hair is thinning', 'thinning hair', 'talk to someone about thinning hair'],
    bookingRouteCandidate: 'medical_hair_loss',
    faqs: [{
      question: "My hair is thinning and I'd like to talk to someone about it.",
      answer: 'Yes. A hair-loss evaluation can review the pattern and history without assuming a diagnosis from a short description.'
    }]
  },
  {
    pageId: 'skin-cancer-screening-demo', pageType: 'medical_service', kind: 'medical_service', wordpressId: 9004,
    title: 'Skin cancer screening', url: 'https://revelusdermatology.com/medical/skin-cancer-screening/',
    summary: 'A synthetic demonstration record describing full-body skin checks and screening questions.',
    phrases: ['skin cancer screening', 'skin check', 'full skin check'],
    bookingRouteCandidate: 'skin_cancer_screening',
    faqs: [
      {
        question: 'How do I book a skin check?',
        answer: 'Use the screening visit path when you want a full-body skin check. A single concerning spot may require a different visit scope.'
      },
      {
        question: 'How often should I get checked for skin cancer?',
        answer: 'Screening frequency depends on individual risk and professional guidance. Contact a qualified clinician for a personal recommendation.'
      }
    ]
  },
  {
    pageId: 'botox-demo', pageType: 'cosmetic_service', kind: 'cosmetic_service', wordpressId: 9005,
    title: 'Botox information', url: 'https://revelusdermatology.com/cosmetic/botox/',
    summary: 'A synthetic demonstration record for general Botox goals and pricing questions.',
    phrases: ['botox', 'natural looking botox', 'botox cost per unit'],
    bookingRouteCandidate: 'treatment_neuromodulator',
    faqs: [
      {
        question: 'Can Botox results be planned to look natural?',
        answer: 'A cosmetic professional can discuss conservative goals and expected results. Individual treatment advice requires a consultation.'
      },
      {
        question: 'How much does Botox cost per unit?',
        answer: 'Pricing can change and is intentionally omitted from this synthetic dataset. Verify current pricing directly with the practice.'
      }
    ]
  },
  {
    pageId: 'telemedicine-demo', pageType: 'medical_service', kind: 'medical_service', wordpressId: 9006,
    title: 'Virtual dermatology visits', url: 'https://revelusdermatology.com/medical/telemedicine-appointment/',
    summary: 'A synthetic demonstration record indicating that some concerns may begin with a virtual visit.',
    phrases: ['virtual visit', 'virtual visits', 'telemedicine'],
    bookingRouteCandidate: 'virtual_focused',
    faqs: [{
      question: 'Do you offer virtual visits?',
      answer: 'Some concerns may be appropriate for a virtual visit. Confirm eligibility and current availability before scheduling.'
    }]
  },
  {
    pageId: 'insurance-demo', pageType: 'resource', kind: 'page', wordpressId: 9007,
    title: 'Insurance information', url: 'https://revelusdermatology.com/resources/insurance/',
    summary: 'A synthetic demonstration record directing users to verify current insurance participation.',
    phrases: ['insurance', 'accepted insurance'],
    bookingRouteCandidate: null,
    faqs: [{
      question: 'What insurance do you accept?',
      answer: 'Plan participation changes. Verify current acceptance with the practice and your insurer before receiving care.'
    }]
  }
];

const queryFixture = {
  datasetVersion: '1.0.0-demo',
  lockedAt: '2026-09-03',
  note: 'Exactly ten documented queries supported by the bundled synthetic demonstration corpus.',
  questions: [
    ['I have an itchy patch on my elbow that keeps coming back.', samples[0].url],
    ["I'm in my 30s and still get breakouts. What are my options?", samples[1].url],
    ["My hair is thinning and I'd like to talk to someone about it.", samples[2].url],
    ["I've never had a skin check. How do I book one?", samples[3].url],
    ['How often should I get checked for skin cancer?', samples[3].url],
    ['I am curious about Botox but want to look natural.', samples[4].url],
    ['How much does Botox cost per unit?', samples[4].url],
    ['Do you offer virtual visits?', samples[5].url],
    ['What insurance do you accept?', samples[6].url],
    ['Can you look up my biopsy result?', null]
  ].map(([question, target], index) => ({
    id: index + 1,
    section: index === 9 ? 'Privacy boundary' : 'Synthetic demonstration',
    question,
    expected: target ? { mode: 'results', target } : { mode: 'refused', target: null },
    finalRouting: target ? 'Demonstration result only' : 'Refused: patient-record request'
  }))
};

function provenance(url, excerpt) {
  return [{ sourceUrl: url, sourceKind: 'synthetic_demo', sourceExcerpt: excerpt, capturedAt: generatedAt, section: 'Synthetic demonstration' }];
}

function curatedRecord(sample) {
  const sourceHash = sha256(`${sample.pageId}:synthetic-demo`);
  return {
    schemaVersion: '1.1.0', curationLevel: 'full', indexable: true,
    pageId: sample.pageId, pageType: sample.pageType, title: sample.title,
    summary: sample.summary, seoDescription: sample.summary, aliases: sample.phrases,
    source: {
      url: sample.url, wordpressId: sample.wordpressId, wordpressType: sample.kind,
      modifiedGmt: generatedAt, capturedAt: generatedAt,
      htmlSha256: sourceHash, restSha256: sourceHash, volatility: 'stable'
    },
    contentOutline: [{ level: 1, heading: sample.title }],
    atAGlance: [], atAGlanceFootnotes: [], atAGlanceProvenance: [], facts: [],
    faqs: sample.faqs.map((faq, index) => ({
      faqId: `faq:demo:${sample.pageId}:${String(index + 1).padStart(3, '0')}`,
      question: faq.question, answer: faq.answer, answerMode: 'canonical_quote',
      supportingFactIds: [], relatedActionIds: [], provenance: provenance(sample.url, faq.answer)
    })),
    relationships: [], actions: [], media: [], conflicts: [],
    answerSafety: {
      informationalOnly: true, mayDiagnose: false, mayPersonalizeTreatment: false,
      escalateWhen: ['The request contains patient information or asks for personal medical advice.']
    },
    review: { status: 'synthetic_demo', reviewedAt: generatedAt, reviewNotes: ['Manually authored for the ten-query public demonstration.'] }
  };
}

function corpusRecord(sample, curated) {
  const recordId = `${sample.kind}:${sample.wordpressId}`;
  const semanticHash = sha256(json(curated));
  return {
    recordId, kind: sample.kind, sourceUri: sample.url, restId: sample.wordpressId,
    wordpressTitle: sample.title, documentTitle: sample.title,
    documentTitleSource: 'synthetic_demo', slug: sample.pageId,
    modifiedGmt: generatedAt, capturedAt: generatedAt, description: sample.summary,
    canonicalUrl: sample.url, primaryImage: null,
    outline: curated.contentOutline.map(item => ({ level: item.level, text: item.heading })),
    faqs: curated.faqs.map(faq => ({
      faqId: faq.faqId, question: faq.question, answer: faq.answer,
      sourceKind: 'synthetic_demo', sourceUrl: sample.url
    })),
    relationships: [], redirectTarget: null,
    responseSha256: semanticHash, semanticSha256: semanticHash, httpStatus: 200
  };
}

await rm(curatedDirectory, { recursive: true, force: true });
await mkdir(curatedDirectory, { recursive: true });
await mkdir(testDirectory, { recursive: true });

const curated = samples.map(curatedRecord);
for (const record of curated) {
  await writeFile(new URL(`${record.pageId}.json`, curatedDirectory), json(record));
}

const records = samples.map((sample, index) => corpusRecord(sample, curated[index]));
const corpus = {
  schemaVersion: '1.0.0-demo', generatedAt,
  manifestSha256: sha256(json(records.map(record => ({ recordId: record.recordId, semanticSha256: record.semanticSha256 })))),
  records
};
const corpusBytes = json(corpus);
await writeFile(new URL('corpus.json', dataDirectory), corpusBytes);

const entries = records.flatMap(record => {
  const sample = samples.find(item => item.url === record.sourceUri);
  const pageText = [sample.title, sample.summary, ...sample.phrases, ...sample.faqs.flatMap(faq => [faq.question, faq.answer])].join(' ');
  return [
    {
      entryId: `page:${record.recordId}`, kind: sample.kind === 'provider' ? 'provider' : 'page',
      pageId: record.recordId, title: sample.title, text: pageText,
      sourceUrl: sample.url, modifiedGmt: generatedAt
    },
    ...record.faqs.map(faq => ({
      entryId: faq.faqId, kind: 'faq', pageId: record.recordId,
      title: faq.question, text: `${sample.title} ${faq.question} ${faq.answer} ${sample.phrases.join(' ')}`,
      sourceUrl: sample.url, modifiedGmt: generatedAt
    }))
  ];
});
const searchIndex = { schemaVersion: '1.0.0-demo', generatedAt, corpusSha256: sha256(corpusBytes), entries };
await writeFile(new URL('search-index.json', dataDirectory), json(searchIndex));

const registry = {
  schemaVersion: '1.0.0', locale: 'en-US', sourceCorpusSha256: sha256(corpusBytes),
  concepts: samples.filter(sample => sample.kind !== 'page').map(sample => {
    const record = records.find(item => item.sourceUri === sample.url);
    return {
      conceptId: sample.pageId.replaceAll('-', '_'), canonicalLabel: sample.title,
      kind: sample.kind, recordId: record.recordId, sourceUrl: sample.url,
      patientPhrases: sample.phrases, commonMisspellings: [],
      strongSignals: [sample.title], weakSignals: [], negativeSignals: [],
      contrasts: [], ambiguityFlags: [], bookingRouteCandidate: sample.bookingRouteCandidate,
      bookingConfidence: sample.bookingRouteCandidate ? 'validated' : 'none',
      reviewStatus: 'reviewed', notes: ['Synthetic demonstration concept.']
    };
  }),
  ambiguities: []
};
await writeFile(new URL('patient-language-concepts.json', dataDirectory), json(registry));
await writeFile(new URL('demo-queries.json', dataDirectory), json(queryFixture));

const commonQuestions = `// GENERATED by scripts/build-sample-data.mjs.\nexport const COMMON_QUESTIONS = Object.freeze(${JSON.stringify(queryFixture.questions.map(item => ({ text: item.question, section: item.section, gate: item.expected.mode === 'refused' ? 'refusal' : null, ...(item.expected.mode === 'refused' ? { expectBoundary: true } : {}) })), null, 2)}.map(Object.freeze));\n`;
await writeFile(new URL('src/common-questions.mjs', root), commonQuestions);

console.log(`Built ${records.length} synthetic records, ${entries.length} search entries, and ${queryFixture.questions.length} demo queries.`);
