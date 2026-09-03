import { assertNoPatientInformation } from './input-privacy.mjs';
import { schedulingPolicyForSource } from './service-scheduling-policy.mjs';
import { createPageCardProjector } from './page-card-projection.mjs';

const STOP = new Set([
  'a','about','also','an','and','are','at','be','been','but','can','could','do','does',
  'for','get','got','had','has','have','how','i','in','is','it','me','mostly','my','of',
  'or','please','should','something','that','the','there','this','to','under','what',
  'with','would','you','your'
]);
const SANITY_FILLER = new Set([...STOP, 'about', 'any', 'current', 'doctor', 'dr', 'published', 'tell', 'there', 'treat', 'who']);
const EXCLUDED_SEARCH_TERMS = /\botchere\b/i;
const ALIASES = new Map([
  ['full skin check', 'skin cancer screening full body exam'],
  ['skin check', 'skin cancer screening'],
  ['botox price', 'botox cost pricing per unit'],
  ['hair thinning', 'hair loss alopecia'],
  ['kid', 'children minors younger pediatric'],
  ['child', 'children minors younger pediatric'],
  ['minor', 'children kids younger pediatric'],
  ['what happens during a skin biopsy', 'skin biopsy procedure numbed anesthetic sample shave punch excisional'],
  ['how does coolsculpting work', 'coolsculpting cryolipolysis controlled cooling freeze fat cells'],
  // Layman phrasing → published vocabulary.
  ['bald', 'hair loss alopecia'],
  ['thinning', 'hair loss'],
  ['losing my hair', 'hair loss alopecia'],
  ['white patches', 'vitiligo'],
  ['white spots', 'vitiligo'],
  ['light patches', 'tinea versicolor vitiligo discolored summer chest back'],
  ['sweat', 'hyperhidrosis sweating'],
  ['itchy', 'rash eczema'],
  ['zits', 'acne'],
  ['pimples', 'acne'],
  ['breakouts', 'acne'],
  ['blackheads', 'acne'],
  ['wrinkle injection', 'botox neuromodulator'],
  ['skin cancer check', 'skin cancer screening'],
  ['cancer screening', 'skin cancer screening'],
  ['flaky scalp', 'dandruff seborrheic'],
  ['dry scalp', 'dandruff seborrheic'],
  ['double chin', 'kybella'],
  ['lip injections', 'juvederm lip filler'],
  ['lip filler', 'juvederm fillers in austin'],
  // Common misspellings → published condition names.
  ['sorriasis', 'psoriasis'],
  ['soriasis', 'psoriasis'],
  ['psorasis', 'psoriasis'],
  ['psoriases', 'psoriasis'],
  ['rosecea', 'rosacea'],
  ['rosacia', 'rosacea'],
  ['roscea', 'rosacea'],
  ['excema', 'eczema'],
  ['exema', 'eczema'],
  ['egzema', 'eczema'],
  ['ezcema', 'eczema'],
  ['vitilago', 'vitiligo'],
  ['vitigo', 'vitiligo'],
  ['melonoma', 'melanoma'],
  ['melinoma', 'melanoma'],
  ['akne', 'acne'],
  ['hyperhydrosis', 'hyperhidrosis'],
  ['dandruf ', 'dandruff'],
  ['keloyd', 'keloid'],
  ['juvaderm', 'juvederm'],
  ['juviderm', 'juvederm'],
  ['kybela', 'kybella'],
  ['botoks', 'botox'],
  ['melasama', 'melasma'],
  ['acnee', 'acne'],
  ['psoraisis', 'psoriasis'],
  // Symptom descriptions → published condition vocabulary.
  ['wont tan', 'tinea versicolor vitiligo'],
  ['elbows and knees', 'psoriasis'],
  ['silvery scaly patches', 'psoriasis plaques'],
  ['welts', 'hives'],
  ['flushed', 'rosacea redness'],
  ['flushing', 'rosacea redness'],
  ['red face', 'rosacea'],
  ['red dots', 'cherry angioma'],
  ['toenail', 'nail fungus'],
  ['blisters on one side', 'shingles'],
  ['pearly', 'molluscum'],
  ['rough bumps', 'keratosis pilaris'],
  ['back of my arms', 'keratosis pilaris'],
  ['chicken skin', 'keratosis pilaris'],
  ['waxy', 'seborrheic keratosis'],
  ['stuck on', 'seborrheic keratosis'],
  ['from sun', 'sun damage actinic keratosis'],
  ['from the sun', 'sun damage actinic keratosis'],
  ['pregnancy', 'melasma'],
  ['dark patches', 'melasma hyperpigmentation'],
  ['uneven skin tone', 'hyperpigmentation melasma discoloration'],
  ['changed color', 'melanoma mole'],
  ['changing mole', 'melanoma'],
  ['spot that keeps growing', 'melanoma mole'],
  ['raised scar', 'keloid'],
  ['accutane', 'isotretinoin acne evaluation management'],
  ['bleeds', 'basal cell carcinoma'],
  ['wont heal', 'squamous cell carcinoma basal'],
  ['skin cancer surgery', 'mohs'],
  ['lump', 'cyst lipoma'],
  ['fatty', 'lipoma'],
  ['frown lines', 'botox neuromodulator wrinkle'],
  ['crows feet', 'botox wrinkles'],
  ['stubborn fat', 'coolsculpting'],
  ['spider veins', 'sclerotherapy'],
  ['yearly', 'annual skin cancer screening'],
  ['skin exam', 'skin cancer screening'],
  ['video visit', 'telemedicine'],
  ['video call', 'telemedicine'],
  ['follow up appointment', 'follow-up evaluation'],
  ['follow up visit', 'follow-up evaluation'],
  // 2026-09-02 randomizer feedback remaps (practice-reviewed).
  ['flush', 'rosacea facial redness'],
  ['around my mouth', 'perioral dermatitis'],
  ['between my toes', 'ringworm athletes foot tinea'],
  ['ingrown hair', 'folliculitis razor bumps'],
  ['underarms are darker', 'hyperpigmentation dark patches'],
  ['tanning bed', 'skin cancer screening sun damage'],
  ['full body check', 'skin cancer screening'],
  ['full body scan', 'skin cancer screening'],
  ['between my eyebrows', 'botox frown lines'],
  ['red veins', 'sclerotherapy spider veins'],
  ['dull', 'facial diamondglow'],
  ['cracked hands', 'dry skin'],
  ['hands crack', 'dry skin'],
  ['dry patches', 'dry skin'],
  ['chapped', 'dry skin lips'],
  ['part looks wider', 'hair loss thinning'],
  ['widening part', 'hair loss'],
  ['wider than it used to', 'hair loss thinning'],
  ['walk in', 'schedule appointment'],
  ['price list', 'estimate cost'],
  ['self pay', 'payments cash cost'],
  ['self pay price for an office visit', 'schedule dermatology appointment cost without insurance estimate'],
  ['reschedule my thursday appointment', 'schedule appointment cancellation'],
  ['medicare advantage', 'insurance accepted plans'],
  ['medicare', 'insurance accepted plans'],
  ['what services', 'about revelus dermatology practice'],
  ['never seen a dermatologist', 'what to expect first visit new patient'],
  ['had my baby', 'postpartum shedding'],
  ['having a baby', 'postpartum shedding'],
  ['after pregnancy', 'postpartum'],
  ['how much is', 'cost price'],
  ['taking new patients', 'what to expect new patient'],
  ['new patient', 'what to expect first visit'],
  ['three different things', 'standard appointment concerns'],
  ['fewer wrinkles', 'skin wrinkles treatments'],
  ['not ready for injections', 'skin wrinkles laser chemical peels'],
  ['elbow creases', 'eczema'],
  ['itchy every winter', 'dry skin'],
  ['soonest', 'schedule online appointment'],
  ['weekend appointments', 'contact hours'],
  ['evening or weekend', 'contact hours'],
  ['how often should i get checked', 'skin cancer screening'],
  ['virtual visit', 'telemedicine virtual appointment'],
  ['peel package', 'chemical peels'],
  ['facial or a peel', 'facials chemical peels aesthetician consultation'],
  ['focused visit', 'focused dermatology appointment'],
  ['standard appointment', 'standard medical appointment'],
  ['after being in the sun', 'sun damage']
]);
const TOPIC_ANCHORS = [
  { test: /\bbotox\b/, terms: ['botox'] },
  { test: /\bpsoriasis\b/, terms: ['psoriasis'] },
  { test: /\bpsoraisis\b/, terms: ['psoriasis'] },
  { test: /\bhair\s+loss\b/, terms: ['hair', 'loss'] },
  { test: /\bskin\s+biops(?:y|ies)\b/, terms: ['skin', 'biopsy'] },
  { test: /\bcoolsculpting\b/, terms: ['coolsculpting'] },
  { test: /\bacne\s+scars?\b/, terms: ['acne', 'scar'] },
  { test: /\bacne\b/, terms: ['acne'] },
  { test: /\bacnee\b/, terms: ['acne'] },
  { test: /\brash(?:es)?\b/, terms: ['rash'] },
  { test: /\b(?:full\s+)?skin\s+check\b/, terms: ['screening'] },
  { test: /\bwhite\s+(?:patches|spots)\b/, terms: ['vitiligo'] },
  { test: /\blight\s+patches\b/, terms: ['tinea', 'versicolor'], sourceOnly: true, multiCandidate: true },
  { test: /\blight\s+patches\b/, terms: ['vitiligo'], sourceOnly: true, multiCandidate: true },
  { test: /\btoenails?\b|\bnail\s+problem\b/, terms: ['nail'], sourceOnly: true },
  { test: /\bkeloids?\b|\braised\s+scar\b|\bscar\s+is\s+raised\b/, terms: ['keloid'], sourceOnly: true, multiCandidate: true },
  { test: /\bkeloids?\b|\braised\s+scar\b|\bscar\s+is\s+raised\b/, terms: ['scar'], sourceOnly: true, multiCandidate: true },
  { test: /\bskin\s+tags?\b/, terms: ['skin', 'tag'], sourceOnly: true },
  { test: /\bfacials?\b/, terms: ['facial'] },
  { test: /\bpeels?\b/, terms: ['peel'] },
  { test: /\bfocused\s+(?:visit|appointment)\b/, terms: ['focused'], sourceOnly: true },
  { test: /\bstandard\s+(?:visit|appointment)\b/, terms: ['standard', 'appointment'], sourceOnly: true },
  { test: /\bproviders?\b.*\bcosmetic\s+treatments?\b|\bcosmetic\s+treatments?\b.*\bproviders?\b/, terms: ['cosmetic'], sourceOnly: true },
  { test: /\bwrinkle\s+injections?\b|\banti[- ]wrinkle\b/, terms: ['botox'] },
  { test: /\blip\s+(?:injections?|fillers?)\b/, terms: ['juvederm'], sourceOnly: true, multiCandidate: true, boost: 24 },
  { test: /\blip\s+(?:injections?|fillers?)\b/, terms: ['restylane'], sourceOnly: true, multiCandidate: true },
  { test: /\bbirthmarks?\b/, terms: ['birthmark'] },
  { test: /\bwelts\b/, terms: ['hives'] },
  { test: /\bsilvery\s+scaly\s+patches\b/, terms: ['psoriasis'], sourceOnly: true },
  // Misspelled condition names anchor to the intended page.
  { test: /\bsorriasis\b|\bsoriasis\b|\bpsorasis\b|\bpsoriases\b/, terms: ['psoriasis'] },
  { test: /\brosecea\b|\brosacia\b|\broscea\b/, terms: ['rosacea'] },
  { test: /\bexcema\b|\bexema\b|\begzema\b|\bezcema\b/, terms: ['eczema'] },
  { test: /\bvitilago\b|\bvitigo\b/, terms: ['vitiligo'] },
  { test: /\bmelonoma\b|\bmelinoma\b/, terms: ['melanoma'] },
  { test: /\bjuv[ai]derm\b/, terms: ['juvederm'] },
  { test: /\bhyperhydrosis\b/, terms: ['hyperhidrosis'] },
  // 2026-09-02 randomizer feedback remaps (practice-reviewed). Anchors match
  // the raw normalized query; terms must appear in the entry title or URL.
  { test: /\bflush(?:es|ing|ed)?\b/, terms: ['rosacea'] },
  { test: /\b(?:around|near) (?:my )?mouth\b/, terms: ['perioral'] },
  { test: /\bbetween (?:my )?toes\b|\bathletes? foot\b/, terms: ['ringworm'] },
  { test: /\bingrown hairs?\b|\brazor bumps?\b/, terms: ['folliculitis'] },
  { test: /\bunderarms? (?:are |look )?darker\b|\bdark underarms?\b/, terms: ['hyperpigmentation'] },
  { test: /\btanning beds?\b/, terms: ['screening'] },
  { test: /\bfull[\s-]?body (?:check|scan|exam)\b/, terms: ['screening'] },
  { test: /\bhow often\b.*\bcheck/, terms: ['screening'] },
  { test: /\b(?:lines?|wrinkles?) between\b|\bfrown lines?\b/, terms: ['botox'] },
  { test: /\bred veins?\b|\bspider veins?\b/, terms: ['sclerotherapy'] },
  { test: /\bdull\b/, terms: ['facial'], multiCandidate: true },
  { test: /\bdull\b/, terms: ['diamond', 'glow'], sourceOnly: true, multiCandidate: true, boost: 36 },
  { test: /\bget screened for skin cancer\b|\bscreened for skin cancer\b/, terms: ['skin', 'cancer', 'screening'], sourceOnly: true },
  { test: /\bcracked hands?\b|\bhands? crack\b/, terms: ['dry skin'] },
  { test: /\bdry patches\b/, terms: ['dry skin'] },
  { test: /\bchapped\b|\bcracked at the corners\b/, terms: ['dry skin'] },
  { test: /\bself[\s-]?pay price\b.*\boffice visit\b/, terms: ['schedule'], sourceOnly: true },
  { test: /\bnot ready for injections?\b/, terms: ['wrinkle', 'consultation'] },
  { test: /\bnever seen a dermatologist\b.*\bfirst appointment\b/, terms: ['what', 'expect'] },
  { test: /\breschedule\b.*\bappointment\b/, terms: ['com schedule'] },
  { test: /\bcancel\b.*\bappointment\b/, terms: ['schedule'] },
  { test: /\bpart (?:looks? |is |gets? )?wider\b|\bwidening part\b/, terms: ['hair loss'] },
  { test: /\bwarts?\b/, terms: ['wart'] },
  { test: /\bwalk[\s-]?ins?\b/, terms: ['com schedule'] },
  { test: /\b(?:evening|weekend)s? (?:appointments?|hours|openings?)\b|\bevening or weekend\b|\bclinic hours\b/, terms: ['contact us'] },
  { test: /\bsoonest\b/, terms: ['com schedule'] },
  { test: /^(?:where|how) can i schedule(?: an appointment)?$|^schedule (?:an )?appointment$/, terms: ['com schedule'] },
  { test: /\bspecials?\b|\bpromotions?\b/, terms: ['cosmetic specials'] },
  { test: /^(?:how (?:do|can) i )?(?:contact|reach) (?:you|revelus|the office|the clinic)$/, terms: ['contact us'] },
  // Keep the generic insurance resource discoverable without overriding an
  // exact provider FAQ such as "what insurance does Dr. Patel accept?".
  { test: /^(?:(?:what|which) insurance(?: plans?)?(?: do you accept)?|do you accept insurance)$/, terms: ['resources insurance'] },
  { test: /\bcare process\b/, terms: ['care process'] },
  // "Taking/accepting new patients" is not published — honest contact path.
  { test: /\b(?:taking|accepting) new patients?\b/, terms: ['contact us'] },
  { test: /\bnew patients?\b/, terms: ['expect'] },
  { test: /\bprice list\b/, terms: ['estimate'] },
  { test: /\bself[\s-]?pay\b|\bcash price\b/, terms: ['payment'] },
  // Medicare is a plan gate attached to a relevant card, never a standalone
  // result card. Historical proposal/archive pages remain light-curated but
  // any patient Medicare query resolves to the current insurance resource.
  { test: /\bmedicare\b/, terms: ['resources insurance'] },
  { test: /\bwhat services\b|\bservices does\b/, terms: ['about us'] },
  { test: /\bthree\b.*\b(?:things|concerns|issues)\b/, terms: ['standard'] },
  { test: /\bbumps? (?:after|from)\b.*\bsun\b|\bafter being in the sun\b/, terms: ['sun damage'] },
  { test: /\bfewer wrinkles\b|\bnot ready for injections?\b/, terms: ['wrinkle'] },
  { test: /\belbow creases?\b/, terms: ['eczema'] },
  { test: /\bitch\w*\b.*\bwinter\b|\bwinter\b.*\bitch\w*\b/, terms: ['dry skin'] }
];
const FAQ_POLICIES = new Map([
  ['faq:medical_service:1368:014', {
    relatedBookingRoute: null,
    suppressPageConflicts: true,
    includeCallAction: true,
    bookingGuidance: 'Routine full-body screening is not automatically recommended for minors. Call Revelus about a specific spot check or pediatric dermatology referral.'
  }]
]);
const SOURCE_ROUTES = new Map([
  ['/cosmetic/botox/', 'treatment_neuromodulator'],
  ['/medical/skin-cancer-screening/', 'skin_cancer_screening'],
  ['/conditions/hair-loss/', 'medical_hair_loss'],
  ['/medical/hair-loss-evaluation/', 'medical_hair_loss'],
  ['/conditions/acne/', 'medical_acne'],
  ['/medical/acne-evaluation/', 'medical_acne'],
  ['/medical/rash-evaluation/', 'medical_rash'],
  // Page → visit-route map, derived from each published page's own
  // scheduling CTA (audited 2026-08-31 against the live site). Staff-
  // scheduled and office-controlled sources are handled by the scheduling
  // policy layer, not listed here.
  // Conditions whose CTA is a dedicated evaluation:
  ['/conditions/alopecia-areata/', 'medical_hair_loss'],
  // Conditions whose CTA is a cosmetic consultation:
  ['/conditions/skin-wrinkles/', 'consult_wrinkles'],
  ['/conditions/aging-skin/', 'consult_aging_skin'],
  ['/conditions/sun-damage/', 'consult_aging_skin'],
  // Practice decision (2026-09-02): medical dryness (dry, cracked, chapped
  // skin) is evaluated medically, never routed to the cosmetic consult.
  ['/conditions/dry-skin/', 'medical_focused'],
  ['/conditions/melasma/', 'consult_discoloration'],
  ['/conditions/stretch-marks/', 'consult_discoloration'],
  // Every other condition page's CTA is the focused single-concern
  // medical evaluation (reason 50633):
  ['/conditions/contact-dermatitis/', 'medical_focused'],
  ['/conditions/eczema/', 'medical_focused'],
  ['/conditions/hives/', 'medical_focused'],
  ['/conditions/poison-ivy/', 'medical_focused'],
  ['/conditions/perioral-dermatitis/', 'medical_focused'],
  ['/conditions/ringworm/', 'medical_focused'],
  ['/conditions/shingles/', 'medical_focused'],
  ['/conditions/tinea-versicolor/', 'medical_focused'],
  ['/conditions/folliculitis/', 'medical_focused'],
  ['/conditions/melanoma/', 'medical_focused'],
  ['/conditions/basal-cell-carcinoma/', 'medical_focused'],
  ['/conditions/squamous-cell-carcinoma/', 'medical_focused'],
  ['/conditions/actinic-keratosis/', 'medical_focused'],
  ['/conditions/moles/', 'medical_focused'],
  ['/conditions/seborrheic-keratosis/', 'medical_focused'],
  ['/conditions/psoriasis/', 'medical_focused'],
  ['/conditions/rosacea/', 'medical_focused'],
  ['/conditions/vitiligo/', 'medical_focused'],
  ['/conditions/hyperpigmentation/', 'medical_focused'],
  ['/conditions/hyperhidrosis/', 'medical_focused'],
  ['/conditions/warts/', 'medical_focused'],
  ['/conditions/cysts/', 'medical_focused'],
  ['/conditions/lipoma/', 'medical_focused'],
  ['/conditions/skin-tags/', 'medical_focused'],
  ['/conditions/birthmarks/', 'medical_focused'],
  ['/conditions/molluscum/', 'medical_focused'],
  ['/conditions/nail-fungus/', 'medical_focused'],
  ['/conditions/keloid/', 'medical_focused'],
  ['/conditions/scars/', 'medical_focused'],
  ['/conditions/dandruff/', 'medical_focused'],
  ['/conditions/keratosis-pilaris/', 'medical_focused'],
  ['/conditions/acne-scars/', 'medical_focused'],
  ['/conditions/cherry-angioma/', 'medical_focused'],
  ['/conditions/sebaceous-hyperplasia/', 'medical_focused'],
  ['/conditions/hidradenitis-suppurativa/', 'medical_focused'],
  ['/conditions/lupus/', 'medical_focused'],
  // Cosmetic services — each page's CTA reason:
  ['/cosmetic/standard-consultation/', 'consult_wrinkles'],
  ['/cosmetic/sculptra/', 'consult_wrinkles'],
  ['/cosmetic/prp/', 'consult_wrinkles'],
  ['/cosmetic/sclerotherapy/', 'consult_wrinkles'],
  ['/cosmetic/excelv-laser/', 'consult_wrinkles'],
  ['/cosmetic/kybella/', 'consult_wrinkles'],
  ['/cosmetic/restylane/', 'consult_wrinkles'],
  ['/cosmetic/juvederm/', 'consult_wrinkles'],
  ['/cosmetic/radiesse/', 'consult_wrinkles'],
  ['/cosmetic/subcision/', 'consult_wrinkles'],
  ['/cosmetic/coolpeel-laser/', 'consult_wrinkles'],
  ['/cosmetic/wrinkle-consultation/', 'consult_wrinkles'],
  ['/cosmetic/aesthetician-consultation/', 'consult_aging_skin'],
  ['/cosmetic/aging-skin-consultation/', 'consult_aging_skin'],
  ['/cosmetic/ipl-laser-photofacial/', 'consult_aging_skin'],
  ['/cosmetic/photofractional-laser/', 'consult_aging_skin'],
  ['/cosmetic/madonna-eye-lift/', 'consult_aging_skin'],
  ['/cosmetic/visia-skin-analysis/', 'consult_aging_skin'],
  ['/cosmetic/body-sculpting-consultation/', 'consult_body_sculpting'],
  ['/cosmetic/cooltone/', 'consult_body_sculpting'],
  ['/cosmetic/discoloration-consultation/', 'consult_discoloration'],
  ['/cosmetic/laser-genesis/', 'consult_discoloration'],
  ['/cosmetic/diamond-glow/', 'facial_diamond_glow'],
  // Package-gated treatments (site parity: bookable with a recent
  // consultation/package, otherwise the resolver redirects to the consult):
  ['/cosmetic/laser-hair-removal/', 'treatment_laser_hair_removal'],
  ['/cosmetic/chemical-peels/', 'treatment_chemical_peel'],
  ['/cosmetic/microneedling/', 'treatment_skinpen'],
  ['/cosmetic/resurfx-laser/', 'treatment_ipl_resurfx'],
  ['/cosmetic/rf-microneedling/', 'treatment_rf_microneedling'],
  // Pages without a direct booking CTA → nearest consultation/virtual visit:
  ['/cosmetic/coolsculpting-elite/', 'consult_body_sculpting'],
  ['/cosmetic/facials/', 'consult_aging_skin'],
  ['/cosmetic/scar-reduction/', 'consult_wrinkles'],
  ['/cosmetic/co2-laser/', 'consult_aging_skin'],
  ['/medical/telemedicine-appointment/', 'virtual_focused'],
  // Medical services — each page's CTA reason:
  ['/medical/focused-appointment/', 'medical_focused'],
  ['/medical/skin-disease-management/', 'medical_focused'],
  ['/medical/specialty-referral/', 'medical_focused'],
  ['/medical/follow-up-evaluation/', 'medical_follow_up'],
  ['/medical/prescription-refills/', 'medical_prescription_refill'],
  ['/medical/referral-appointment/', 'medical_referral'],
  // Providers with a page-specific booking CTA:
  ['/providers/peije-fincher-la/', 'consult_aging_skin']
]);
const MATCHABLE_ENTITY_KINDS = new Set(['condition', 'cosmetic_service', 'medical_service', 'provider']);
const RELATIONSHIP_SOURCE_KINDS = new Set(['condition', 'cosmetic_service', 'medical_service']);
const PROVIDER_INTENT = /(?:\bwho\b.*\b(?:does|performs?|provides?|offers?|handles?|treats?|providers?|doctors?|dermatologists?|surgeons?)\b|\bwhich\s+(?:providers?|doctors?|dermatologists?|surgeons?)\b|\b(?:providers?|doctors?|dermatologists?|surgeons?)\s+(?:for|who|does|do|performs?|offer|offers?|handles?|treats?)\b|\bdoes\s+(?!revelus\b)(?:dr\s+)?[a-z][a-z.-]+\s+[a-z][a-z.-]+\b.*\b(?:perform|provide|offer|handle|treat)s?\b)/i;
function normalize(value) {
  // Fold diacritics so published names like "Juvéderm" match the plain
  // spellings patients type.
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function buildEntityMatchers(records) {
  const byPhrase = new Map();
  for (const record of records) {
    if (!MATCHABLE_ENTITY_KINDS.has(record.kind)) continue;
    const labels = [record.wordpressTitle, record.slug];
    if (record.kind === 'provider') labels.push(String(record.wordpressTitle).split(',')[0]);
    for (const label of labels) {
      const phrase = normalize(label);
      if (!phrase || phrase.length < 3) continue;
      if (!byPhrase.has(phrase)) byPhrase.set(phrase, new Set());
      byPhrase.get(phrase).add(record.sourceUri);
    }
  }
  const matchers = [];
  for (const [phrase, urls] of byPhrase) {
    if (urls.size === 1) matchers.push({ phrase, sourceUrl: [...urls][0] });
  }
  return matchers.sort((a, b) => b.phrase.length - a.phrase.length || a.phrase.localeCompare(b.phrase));
}

function explicitSourceForQuery(query, matchers) {
  const padded = ` ${normalize(query)} `;
  return matchers.find(candidate => padded.includes(` ${candidate.phrase} `))?.sourceUrl ?? null;
}

function tokens(value) {
  return normalize(value).split(' ').filter(token => token && !STOP.has(token));
}

function expandQuery(query) {
  const normalized = normalize(query);
  const additions = [...ALIASES].filter(([phrase]) => normalized.includes(phrase)).map(([, extra]) => extra);
  return `${query} ${additions.join(' ')}`.trim();
}

function log1p(value) {
  return Math.log(1 + value);
}

function queryIntent(query) {
  const normalized = normalize(query);
  if (PROVIDER_INTENT.test(normalized)) return 'provider_lookup';
  if (/\b(?:versus|vs|difference|different|better)\b|\bor\b/.test(normalized)) return 'comparison';
  if (/\b(?:price|cost|how much|self pay|cash)\b/.test(normalized)) return 'price_policy';
  if (/\b(?:and|also)\b/.test(normalized)) return 'multi_concern';
  if (/\b(?:appointment|visit|schedule|book)\b/.test(normalized)) return 'visit_routing';
  if (/^(?:do|does|is|are|can|what|which|who|how|when|where|why)\b/.test(normalized)) return 'direct_answer';
  return 'topic_exploration';
}

function topicMatches(topic, topicSubject, sourceUrl) {
  const target = topic.sourceOnly ? sourceUrl : topicSubject;
  return topic.terms.every(term => target.includes(term));
}

function scoreEntry(query, entry, explicitSourceUrl = null, applyTopicAnchor = true) {
  const queryTerms = [...new Set(tokens(expandQuery(query)))].sort();
  if (!queryTerms.length) return 0;
  const intent = queryIntent(query);
  const providerIntent = PROVIDER_INTENT.test(normalize(query));
  if (entry.kind === 'provider_relationship' && !providerIntent) return 0;
  const allowRelatedSources = (
    ['comparison', 'multi_concern'].includes(intent) && !explicitSourceUrl?.includes('/providers/')
  ) || /\bscar\s+is\s+raised\b/.test(normalize(query));
  if (explicitSourceUrl && entry.sourceUrl !== explicitSourceUrl && !allowRelatedSources) return 0;
  const broadOverview = /^(?:does revelus treat|what should i know about|who is)\b/.test(normalize(query));
  if (broadOverview && !providerIntent && !entry.entryId.startsWith('page:')) return 0;
  const matchedTopics = applyTopicAnchor ? TOPIC_ANCHORS.filter(candidate => candidate.test.test(normalize(query))) : [];
  const topics = ['comparison', 'multi_concern'].includes(intent) || matchedTopics.some(topic => topic.multiCandidate)
    ? matchedTopics
    : matchedTopics.slice(0, 1);
  const topicSubject = normalize(`${entry.title} ${entry.sourceUrl}`);
  const title = normalize(entry.title);
  const text = normalize(entry.text);
  const url = normalize(entry.sourceUrl);
  if (topics.length && !topics.some(topic => topicMatches(topic, topicSubject, url))) return 0;
  let score = 0;
  let matched = 0;
  for (const term of queryTerms) {
    const titleCount = title.split(term).length - 1;
    const textCount = text.split(term).length - 1;
    const urlCount = url.split(term).length - 1;
    if (titleCount || textCount || urlCount) matched += 1;
    score += titleCount * 8;
    score += log1p(textCount) * 2.5;
    score += Math.min(urlCount, 2) * 3;
  }
  score += 10 * matched / queryTerms.length;
  if (queryTerms.every(term => title.includes(term))) score += 12;
  const phrase = tokens(query).join(' ');
  if (phrase && tokens(entry.title).join(' ').includes(phrase)) score += 18;
  const evidenceTitle = tokens(entry.title).join(' ');
  if (evidenceTitle.length >= 5 && phrase.includes(evidenceTitle)) score += 36;
  const factPrecisionIntent = /\b(?:minimum|maximum|duration)\b/.test(normalize(query));
  const directIntent = ['direct_answer', 'price_policy', 'comparison'].includes(intent);
  if (entry.kind === 'faq' && directIntent && !factPrecisionIntent) {
    const questionTerms = new Set(tokens(entry.title));
    const coreQueryTerms = [...new Set(tokens(query))];
    const overlap = coreQueryTerms.filter(term => questionTerms.has(term)).length;
    const coverage = coreQueryTerms.length ? overlap / coreQueryTerms.length : 0;
    score += coverage * 55;
    if (coverage >= 0.6) score += 30;
  }
  if (entry.kind === 'fact') {
    const factLabel = normalize(entry.title.split(':').slice(1).join(':'));
    if (factLabel.length >= 3 && normalize(query).includes(factLabel)) score += 140;
  }
  if (entry.kind === 'provider_relationship' && providerIntent) score += 120;
  if (entry.kind === 'provider_relationship' && providerIntent) score += 100;
  if (entry.kind === 'offer_collection' && /\b(?:specials?|promotions?|offers?)\b/i.test(normalize(query))) score += 120;
  if (entry.kind === 'fact' && /\b(?:what happens|during|procedure|performed|done)\b/i.test(normalize(query))) score += 18;
  if (entry.kind === 'fact' && factPrecisionIntent) score += 90;
  if (!matched) return 0;
  if (entry.kind === 'faq') score += 4;
  if (FAQ_POLICIES.has(entry.entryId) && /\b(?:kids?|children|minors?|pediatric)\b/.test(normalize(query))) score += 40;
  if (explicitSourceUrl && entry.sourceUrl === explicitSourceUrl) score += 30;
  for (const topic of topics) {
    if (!topicMatches(topic, topicSubject, url)) continue;
    score += 12 + topic.terms.length * 3 + (topic.boost ?? 0);
    if (topic.terms.every(term => url.includes(term))) score += 32;
  }
  if (entry.sourceUrl.replace(/\/$/, '') === 'https://revelusdermatology.com') score -= 2;
  return score;
}

function assertSafeQuery(input, allowedPublicNames = []) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Knowledge search input must be an object');
  const extra = Object.keys(input).filter(key => !['query', 'limit'].includes(key));
  if (extra.length) throw new Error(`Unsupported knowledge search fields: ${extra.join(', ')}`);
  if (typeof input.query !== 'string' || input.query.length < 2 || input.query.length > 180) throw new Error('Query must contain 2 to 180 characters');
  if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 10)) throw new Error('Limit must be an integer from 1 to 10');
  assertNoPatientInformation(input.query, { allowedPublicNames });
}

function safePathname(sourceUrl) {
  try { return new URL(sourceUrl).pathname; } catch { return String(sourceUrl ?? ''); }
}

function routeForSource(sourceUrl) {
  return SOURCE_ROUTES.get(safePathname(sourceUrl)) ?? null;
}

function withSchedulingPolicy(answer) {
  const policy = schedulingPolicyForSource(answer.sourceUrl);
  return policy ? { ...answer, schedulingPolicy: policy } : answer;
}

function warningForFact(fact) {
  if (fact.volatility === 'time_sensitive') {
    const messages = {
      pricing: 'Pricing and coverage details are time-sensitive. Verify current terms with Revelus and, when applicable, the insurer.',
      logistics: 'Availability and scheduling claims are time-sensitive. Verify current availability with Revelus.',
      offer: 'Promotion and financing terms are time-sensitive. Verify current terms with Revelus.',
      policy: 'This policy is time-sensitive. Verify current terms with Revelus.',
      other: 'This claim is time-sensitive. Verify the current information with Revelus.'
    };
    return messages[fact.category] ?? messages.other;
  }
  if (fact.volatility === 'moderate') {
    if (fact.category === 'pricing') return 'Pricing details may change. Verify current terms with Revelus.';
    if (fact.category === 'offer') return 'Offer terms may change. Verify current terms with Revelus.';
    return 'This detail may change. Verify current information with Revelus.';
  }
  return null;
}

function buildCuratedProjection(curatedRecords) {
  const searchEntries = [];
  const facts = new Map();
  const offerCollections = new Map();
  for (const record of curatedRecords) {
    const sourceUrl = record.source?.url;
    if (!sourceUrl?.startsWith('https://')) continue;
    for (const fact of record.facts ?? []) {
      const entryId = `fact:${record.pageId}:${fact.factId}`;
      facts.set(entryId, { fact, record });
      searchEntries.push({
        entryId, kind: 'fact', pageId: record.pageId, sourceUrl,
        title: `${record.title}: ${fact.label}`,
        text: [record.title, ...(record.aliases ?? []), fact.label, String(fact.value), ...(fact.qualifiers ?? []), ...(fact.provenance ?? []).map(item => item.sourceExcerpt)].join(' ')
      });
    }
    if (record.offers?.length) {
      const entryId = `offer_collection:${record.pageId}`;
      offerCollections.set(entryId, record);
      searchEntries.push({
        entryId, kind: 'offer_collection', pageId: record.pageId, sourceUrl,
        title: `${record.title}: current published offers`,
        text: [record.title, ...(record.aliases ?? []), 'current specials offers discounts prices', ...record.offers.flatMap(offer => [offer.title, offer.price, offer.discount, ...(offer.termsSummary ?? [])])].filter(Boolean).join(' ')
      });
    }
  }
  return { searchEntries, facts, offerCollections };
}

function joinNames(names) {
  if (names.length < 2) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
}

function relationshipSections(relationship) {
  return (relationship.sections ?? []).filter(section => /^providers (?:offering|addressing)\b/i.test(section));
}

function buildProviderRelationshipProjection(records) {
  const recordsByUrl = new Map(records.map(record => [record.sourceUri, record]));
  const searchEntries = [];
  const answers = new Map();
  for (const record of records) {
    if (!RELATIONSHIP_SOURCE_KINDS.has(record.kind)) continue;
    const providers = [];
    const seen = new Set();
    for (const relationship of record.relationships ?? []) {
      if (relationship.targetKind !== 'provider' || !relationshipSections(relationship).length) continue;
      const provider = recordsByUrl.get(relationship.targetUrl);
      if (provider?.kind !== 'provider' || seen.has(provider.sourceUri)) continue;
      seen.add(provider.sourceUri);
      providers.push(provider);
    }
    if (!providers.length) continue;
    const entryId = `provider_relationship:${record.recordId}`;
    const relationshipLabel = record.kind === 'condition' ? 'addressing' : 'offering';
    const providerNames = providers.map(provider => provider.wordpressTitle);
    searchEntries.push({
      entryId,
      kind: 'provider_relationship',
      pageId: record.recordId,
      sourceUrl: record.sourceUri,
      title: `Who provides ${record.wordpressTitle} at Revelus?`,
      text: [
        record.wordpressTitle,
        `who provides performs offers handles treats ${record.wordpressTitle}`,
        ...providerNames,
        ...providers.map(provider => provider.description ?? '')
      ].join(' ')
    });
    answers.set(entryId, { record, providers, relationshipLabel, providerNames });
  }
  const cosmeticOverview = records.find(record => record.sourceUri === 'https://revelusdermatology.com/cosmetic/');
  const cosmeticProviders = records.filter(record =>
    record.kind === 'provider' &&
    (record.relationships ?? []).some(relationship => relationship.targetKind === 'cosmetic_service')
  );
  if (cosmeticOverview && cosmeticProviders.length) {
    const entryId = 'provider_relationship:cosmetic-services';
    const providerNames = cosmeticProviders.map(provider => provider.wordpressTitle);
    searchEntries.push({
      entryId,
      kind: 'provider_relationship',
      pageId: cosmeticOverview.recordId,
      sourceUrl: cosmeticOverview.sourceUri,
      providerSourceUrls: cosmeticProviders.map(provider => provider.sourceUri),
      title: 'Which providers offer cosmetic treatments at Revelus?',
      text: [
        'cosmetic providers cosmetic dermatology treatments services who offers performs provides',
        ...providerNames,
        ...cosmeticProviders.map(provider => provider.description ?? '')
      ].join(' ')
    });
    answers.set(entryId, {
      record: cosmeticOverview,
      providers: cosmeticProviders,
      relationshipLabel: 'offering',
      providerNames
    });
  }
  return { searchEntries, answers };
}

function expanderForMatch(entryKind, card) {
  if (entryKind === 'faq') return 'questions';
  if (entryKind === 'provider_relationship') return 'providers';
  if (entryKind === 'fact' && card.atAGlance?.length) return 'key_information';
  return null;
}

export function createKnowledgeBase({ corpus, searchIndex, curatedRecords = [] }) {
  if (!corpus?.records || !searchIndex?.entries) throw new Error('Knowledge artifacts are unavailable');
  const curatedProjection = buildCuratedProjection(curatedRecords);
  const publicEntityNames = corpus.records.map(record => record.wordpressTitle);
  const providerProjection = buildProviderRelationshipProjection(corpus.records);
  const searchEntries = [...searchIndex.entries, ...curatedProjection.searchEntries, ...providerProjection.searchEntries];
  const searchVocabulary = new Set(searchEntries.flatMap(entry => tokens(`${entry.title} ${entry.text} ${entry.sourceUrl}`)));
  const entries = new Map(searchEntries.map(entry => [entry.entryId, entry]));
  const pages = new Map(corpus.records.map(record => [record.recordId, record]));
  const faqs = new Map();
  for (const page of corpus.records) {
    for (const faq of page.faqs ?? []) faqs.set(faq.faqId, { faq, page });
  }
  const curatedBySource = new Map(curatedRecords.map(record => [record.source.url, record]));
  const entityMatchers = buildEntityMatchers(corpus.records);
  const pageCards = createPageCardProjector({ corpus, curatedRecords });

  function rankedEntries(input) {
    assertSafeQuery(input, publicEntityNames);
    if (EXCLUDED_SEARCH_TERMS.test(input.query)) return [];
    const normalizedQuery = normalize(input.query);
    const aliasApplied = [...ALIASES.keys()].some(phrase => normalizedQuery.includes(phrase));
    const sanityTerms = [...new Set(normalizedQuery.split(' ').filter(term => term && !SANITY_FILLER.has(term)))];
    if (!aliasApplied && sanityTerms.length <= 2 && sanityTerms.some(term => term.length >= 8 && !searchVocabulary.has(term))) return [];
    const explicitSourceUrl = explicitSourceForQuery(expandQuery(input.query), entityMatchers);
    const httpsEntries = searchEntries.filter(entry => entry.sourceUrl.startsWith('https://'));
    let scored = httpsEntries
      .map(entry => ({ entry, score: scoreEntry(input.query, entry, explicitSourceUrl) }))
      .filter(item => item.score > 0);
    if (!scored.length && explicitSourceUrl) {
      scored = httpsEntries
        .map(entry => ({ entry, score: scoreEntry(input.query, entry, null) }))
        .filter(item => item.score > 0);
    }
    return scored.sort((a, b) => b.score - a.score || a.entry.entryId.localeCompare(b.entry.entryId));
  }

  return {
    search(input) {
      const limit = input.limit ?? 5;
      const ranked = rankedEntries(input)
        .slice(0, limit)
        .map(({ entry, score }) => ({
          entryId: entry.entryId,
          kind: entry.kind,
          title: entry.title,
          sourceUrl: entry.sourceUrl,
          pageId: entry.pageId,
          score: Number(score.toFixed(4)),
          preview: entry.text.slice(0, 280)
        }));
      return { status: ranked.length ? 'found' : 'no_match', query: input.query, results: ranked };
    },

    searchPages(input) {
      const limit = input.limit ?? 5;
      const bestBySource = new Map();
      for (const candidate of rankedEntries(input)) {
        if (curatedBySource.get(candidate.entry.sourceUrl)?.pageType === 'offer_collection') continue;
        if (!bestBySource.has(candidate.entry.sourceUrl)) bestBySource.set(candidate.entry.sourceUrl, candidate);
      }
      const candidates = [...bestBySource.values()];
      const topScore = candidates[0]?.score ?? 0;
      const intent = queryIntent(input.query);
      const intentCap = intent === 'provider_lookup' ? 4 : intent === 'comparison' ? 3 : intent === 'multi_concern' ? 5 : 5;
      const relevant = candidates
        .filter(candidate => candidate.score >= Math.max(10, topScore * 0.35))
        .slice(0, Math.min(limit, intentCap));
      const results = relevant.map(({ entry, score }) => {
        const card = pageCards.bySourceUrl(entry.sourceUrl, { entry });
        const entryKind = ['faq', 'fact', 'provider_relationship'].includes(entry.kind) ? entry.kind : 'page';
        const match = {
          entryKind,
          entryId: entry.entryId,
          expander: expanderForMatch(entryKind, card),
          ...(entryKind === 'faq' && card.faqs[0] ? { faqId: card.faqs[0].faqId } : {})
        };
        return {
          ...card,
          match,
          // Compatibility aliases for pre-Solution-3 clients. New UIs use match.
          entryId: entry.entryId,
          score: Number(score.toFixed(4)),
          preview: entry.text.slice(0, 280)
        };
      });
      return {
        mode: results.length ? 'results' : 'no_match',
        status: results.length ? 'found' : 'no_match',
        query: input.query,
        results
      };
    },

    getPageAnswer(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => key !== 'entryId')) throw new Error('Answer input accepts only entryId');
      if (typeof input.entryId !== 'string' || input.entryId.length > 220) throw new Error('Invalid entryId');
      const entry = entries.get(input.entryId);
      if (!entry || !entry.sourceUrl.startsWith('https://')) throw new Error('Unknown or internal-only knowledge entry');
      const card = pageCards.bySourceUrl(entry.sourceUrl, { entry });
      const entryKind = ['faq', 'fact', 'provider_relationship'].includes(entry.kind) ? entry.kind : 'page';
      return {
        status: 'answered',
        ...card,
        match: {
          entryKind,
          entryId: entry.entryId,
          expander: expanderForMatch(entryKind, card),
          ...(entryKind === 'faq' && card.faqs[0] ? { faqId: card.faqs[0].faqId } : {})
        }
      };
    },

    pageCardForSource(sourceUrl) {
      const card = pageCards.bySourceUrl(sourceUrl);
      const corpusPage = corpus.records.find(record => record.sourceUri === sourceUrl);
      const entryId = corpusPage ? `page:${corpusPage.recordId}` : `page:${card.pageId}`;
      return {
        ...card,
        match: { entryKind: 'page', entryId, expander: null },
        entryId,
        score: null,
        preview: card.summary
      };
    },

    providerForSource(sourceUrl) {
      return pageCards.providerBySourceUrl(sourceUrl);
    },

    searchWithinSource(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Source search input must be an object');
      const extra = Object.keys(input).filter(key => !['query', 'sourceUrl', 'limit'].includes(key));
      if (extra.length) throw new Error(`Unsupported source search fields: ${extra.join(', ')}`);
      assertSafeQuery({ query: input.query, ...(input.limit === undefined ? {} : { limit: input.limit }) }, publicEntityNames);
      if (typeof input.sourceUrl !== 'string' || !corpus.records.some(record => record.sourceUri === input.sourceUrl)) throw new Error('Unknown source URL');
      const ranked = searchEntries
        .filter(entry => entry.sourceUrl === input.sourceUrl)
        .map(entry => ({ entry, score: scoreEntry(input.query, entry, input.sourceUrl, false) }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score || a.entry.entryId.localeCompare(b.entry.entryId))
        .slice(0, input.limit ?? 5)
        .map(({ entry, score }) => ({
          entryId: entry.entryId, kind: entry.kind, title: entry.title, sourceUrl: entry.sourceUrl,
          pageId: entry.pageId, score: Number(score.toFixed(4)), preview: entry.text.slice(0, 280)
        }));
      return { status: ranked.length ? 'found' : 'no_match', query: input.query, results: ranked };
    },

    getAnswer(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => key !== 'entryId')) throw new Error('Answer input accepts only entryId');
      if (typeof input.entryId !== 'string' || input.entryId.length > 220) throw new Error('Invalid entryId');
      const entry = entries.get(input.entryId);
      if (!entry || !entry.sourceUrl.startsWith('https://')) throw new Error('Unknown or internal-only knowledge entry');
      if (entry.kind === 'provider_relationship') {
        const found = providerProjection.answers.get(entry.entryId);
        if (!found) throw new Error('Provider relationship is unavailable');
        const providerPhrase = found.providers.length === 1 ? 'a provider' : 'providers';
        const verb = found.providers.length === 1 ? 'is' : 'are';
        return withSchedulingPolicy({
          status: 'answered',
          question: `Who provides ${found.record.wordpressTitle} at Revelus?`,
          canonicalAnswer: `${joinNames(found.providerNames)} ${verb} listed by Revelus as ${providerPhrase} ${found.relationshipLabel} ${found.record.wordpressTitle}.`,
          supportingFacts: found.providers.map(provider => ({
            label: provider.wordpressTitle,
            value: provider.description ?? 'View the provider profile for published credentials and services.',
            qualifiers: []
          })),
          offers: [],
          sourceUrl: found.record.sourceUri,
          // Staff-scheduled and office-controlled sources keep null so their
          // scheduling policy drives the next step instead of a direct route.
          relatedBookingRoute: schedulingPolicyForSource(found.record.sourceUri) ? null : routeForSource(found.record.sourceUri),
          bookingGuidance: null,
          actions: found.providers.map(provider => ({ label: `View ${provider.wordpressTitle} profile ↗`, url: provider.sourceUri })),
          conflicts: [],
          capturedAt: found.record.capturedAt,
          modifiedGmt: found.record.modifiedGmt,
          informationalOnly: true,
          warnings: []
        });
      }
      if (entry.kind === 'fact') {
        const found = curatedProjection.facts.get(entry.entryId);
        if (!found) throw new Error('Curated fact is unavailable');
        const value = typeof found.fact.value === 'string' ? found.fact.value : JSON.stringify(found.fact.value);
        const qualifier = found.fact.qualifiers?.length ? ` (${found.fact.qualifiers.join('; ')})` : '';
        const callActions = (found.record.actions ?? []).filter(action => action.kind === 'call' && action.status === 'available');
        return withSchedulingPolicy({
          status: 'answered', question: `${found.record.title}: ${found.fact.label}`,
          canonicalAnswer: `${found.fact.label}: ${value.replace(/\.\s*$/, '')}${qualifier}.`,
          supportingFacts: [{ factId: found.fact.factId, label: found.fact.label, value: found.fact.value, qualifiers: found.fact.qualifiers }],
          offers: [], sourceUrl: found.record.source.url,
          relatedBookingRoute: routeForSource(found.record.source.url), bookingGuidance: null,
          actions: callActions, conflicts: (found.record.conflicts ?? []).map(conflict => conflict.conflictId), capturedAt: found.record.source.capturedAt,
          modifiedGmt: found.record.source.modifiedGmt, informationalOnly: true,
          warnings: [warningForFact(found.fact)].filter(Boolean)
        });
      }
      if (entry.kind === 'offer_collection') {
        const record = curatedProjection.offerCollections.get(entry.entryId);
        if (!record) throw new Error('Offer collection is unavailable');
        return withSchedulingPolicy({
          status: 'answered', question: 'what cosmetic specials are currently published?',
          canonicalAnswer: `The published Revelus specials page currently lists ${record.offers.length} offers. None has an explicit expiration date, so verify availability before purchasing or scheduling.`,
          supportingFacts: [],
          offers: record.offers.map(offer => ({ title: offer.title, price: offer.price, discount: offer.discount, terms: offer.termsSummary, validityStatus: offer.validityStatus })),
          sourceUrl: record.source.url, relatedBookingRoute: null,
          bookingGuidance: 'Offers are informational until Revelus confirms current availability and eligibility.',
          actions: [], conflicts: (record.conflicts ?? []).map(conflict => conflict.conflictId),
          capturedAt: record.source.capturedAt, modifiedGmt: record.source.modifiedGmt,
          informationalOnly: true,
          warnings: ['No listed offer includes an explicit expiration date. Verify current terms with Revelus.']
        });
      }
      if (entry.kind !== 'faq') {
        const page = pages.get(entry.pageId);
        // The screening page keeps a null route on page-level fallbacks: its
        // eligibility nuances (e.g. minors) must come from the exact FAQs,
        // never a generic page hit (see the pediatric policy test).
        const suppressed = safePathname(entry.sourceUrl) === '/medical/skin-cancer-screening/';
        const conditionRoute = !suppressed && !schedulingPolicyForSource(entry.sourceUrl)
          ? routeForSource(entry.sourceUrl)
          : null;
        return withSchedulingPolicy({
          status: 'source_only', title: entry.title,
          summary: page?.description || 'Read the published Revelus page for the complete information.',
          sourceUrl: entry.sourceUrl,
          relatedBookingRoute: conditionRoute,
          bookingGuidance: conditionRoute
            ? 'The related booking route reflects the published Revelus scheduling structure for this condition. A person confirms every booking step.'
            : 'This source is informational and does not support an automatic booking recommendation. Read the cited page or contact Revelus to confirm the appropriate next step.',
          informationalOnly: true
        });
      }
      const found = faqs.get(entry.entryId);
      if (!found) throw new Error('FAQ source is unavailable');
      const policy = FAQ_POLICIES.get(found.faq.faqId) ?? {};
      const curated = curatedBySource.get(found.page.sourceUri);
      const curatedFaq = curated?.faqs?.find(item => normalize(item.question) === normalize(found.faq.question));
      const supportingIds = new Set(curatedFaq?.supportingFactIds ?? []);
      const supportingFacts = (curated?.facts ?? [])
        .filter(fact => supportingIds.has(fact.factId))
        .slice(0, 4)
        .map(fact => ({ factId: fact.factId, label: fact.label, value: fact.value, qualifiers: fact.qualifiers }));
      const actionIds = new Set(curatedFaq?.relatedActionIds ?? []);
      const actions = (curated?.actions ?? []).filter(action =>
        action.status === 'available' && (actionIds.has(action.actionId) || (policy.includeCallAction && action.kind === 'call'))
      );
      const conflicts = policy.suppressPageConflicts ? [] : (curated?.conflicts ?? []);
      return withSchedulingPolicy({
        status: 'answered',
        faqId: found.faq.faqId,
        question: found.faq.question,
        canonicalAnswer: found.faq.answer,
        supportingFacts,
        sourceUrl: found.faq.sourceUrl,
        relatedBookingRoute: Object.hasOwn(policy, 'relatedBookingRoute')
          ? policy.relatedBookingRoute
          : routeForSource(found.faq.sourceUrl),
        bookingGuidance: policy.bookingGuidance ?? null,
        actions,
        conflicts: conflicts.map(conflict => conflict.conflictId),
        capturedAt: found.page.capturedAt,
        modifiedGmt: found.page.modifiedGmt,
        informationalOnly: true,
        warnings: conflicts.map(conflict => conflict.conflictId === 'botox-current-pricing-location'
          ? 'Current per-unit pricing is not shown consistently across Revelus pages. Call (512) 815-2559 to verify.'
          : 'This topic has a source inconsistency. Use the linked Revelus page or contact the practice to verify.'),
      });
    },

    routeForSource
  };
}
