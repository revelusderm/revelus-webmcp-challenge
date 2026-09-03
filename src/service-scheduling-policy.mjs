const procedureDefinitions = [
  ['cryosurgery', 'Cryosurgery', 'https://revelusdermatology.com/medical/cryosurgery/'],
  ['cyst_removal', 'Cyst Removal', 'https://revelusdermatology.com/medical/cyst-removal/'],
  ['electrodesiccation', 'Electrodessication', 'https://revelusdermatology.com/medical/electrodesiccation/'],
  ['lipoma_removal', 'Lipoma Removal', 'https://revelusdermatology.com/medical/lipoma-removal/'],
  ['mole_removal', 'Mole Removal', 'https://revelusdermatology.com/medical/mole-removal/'],
  ['skin_cancer_removal', 'Skin Cancer Removal', 'https://revelusdermatology.com/medical/skin-cancer-removal/'],
  ['surgical_excision', 'Surgical Excision', 'https://revelusdermatology.com/medical/surgical-excision/'],
  ['mohs', 'Mohs Surgery', 'https://revelusdermatology.com/medical/mohs-surgery/'],
  ['skin_biopsy', 'Skin Biopsy', 'https://revelusdermatology.com/medical/skin-biopsy/']
];

// Practice decision (2026-09-02): package-gated cosmetic treatments (laser
// hair removal, chemical peel, SkinPen, IPL/ResurFX, RF microneedling) match
// the website — online-bookable when the recent-consultation/package
// prerequisite is met, otherwise routed to the cosmetic consultation. Only
// these remain office-scheduled regardless of asserted flags:
export const OFFICE_CONTROLLED_ROUTE_KEYS = Object.freeze(new Set([
  'medical_standard',
  'medical_referral',
  'medical_surgical_procedure',
  'treatment_sculptra',
  'treatment_filler_other'
]));

export const STAFF_SCHEDULED_PROCEDURES = Object.freeze(procedureDefinitions.map(([procedureKey, procedureLabel, sourceUrl]) => Object.freeze({ procedureKey, procedureLabel, sourceUrl })));
export const STAFF_SCHEDULED_PROCEDURE_KEYS = Object.freeze(STAFF_SCHEDULED_PROCEDURES.map(item => item.procedureKey));

const policies = new Map();
for (const item of STAFF_SCHEDULED_PROCEDURES) {
  policies.set(item.sourceUrl, Object.freeze({ type: 'staff_scheduled_procedure', procedureKey: item.procedureKey, procedureLabel: item.procedureLabel, evaluationRouteKey: 'medical_focused' }));
}

for (const sourceUrl of [
  'https://revelusdermatology.com/medical/biologics/',
  'https://revelusdermatology.com/medical/compounds/',
  'https://revelusdermatology.com/medical/injections/',
  'https://revelusdermatology.com/medical/orals/',
  'https://revelusdermatology.com/medical/topicals/',
  'https://revelusdermatology.com/medical/light-box-therapy/',
  'https://revelusdermatology.com/medical/xtrac-excimer-laser/',
  'https://revelusdermatology.com/medical/patch-testing/',
  'https://revelusdermatology.com/cosmetic/keloid-treatment/',
  'https://revelusdermatology.com/cosmetic/skin-tag-removal/'
]) policies.set(sourceUrl, Object.freeze({ type: 'direct_route', routeKey: 'medical_focused' }));

// The published Telemedicine page intentionally opens the telemedicine
// scheduler without a reason id so the widget can ask for a visit reason.
// Solution 3 still needs one reviewed default for its general virtual card;
// use the scheduler's focused virtual appointment rather than treating the
// page as unbookable or preserving the source's incomplete URL.
policies.set(
  'https://revelusdermatology.com/medical/telemedicine-appointment/',
  Object.freeze({ type: 'direct_route', routeKey: 'virtual_focused' })
);

for (const sourceUrl of [
  'https://revelusdermatology.com/cosmetic/botox/',
  'https://revelusdermatology.com/cosmetic/dysport/',
  'https://revelusdermatology.com/cosmetic/jeuveau/',
  'https://revelusdermatology.com/cosmetic/xeomin/'
]) policies.set(sourceUrl, Object.freeze({ type: 'direct_route', routeKey: 'treatment_neuromodulator' }));

for (const sourceUrl of [
  'https://revelusdermatology.com/cosmetic/dermaplaning/',
  'https://revelusdermatology.com/cosmetic/facial-extractions/'
]) policies.set(sourceUrl, Object.freeze({ type: 'direct_route', routeKey: 'facial_extractions_dermaplane' }));

function pathnameOf(sourceUrl) {
  try { return new URL(sourceUrl).pathname; } catch { return String(sourceUrl ?? ''); }
}

// Policies are keyed by full published URL but matched by pathname, so the
// same policy structure applies to any corpus that mirrors the site's paths
// (e.g. the public synthetic sample dataset).
const policiesByPath = new Map([...policies].map(([sourceUrl, policy]) => [pathnameOf(sourceUrl), policy]));

export function schedulingPolicyForSource(sourceUrl) {
  return policies.get(sourceUrl) ?? policiesByPath.get(pathnameOf(sourceUrl)) ?? null;
}

export function procedureDefinition(procedureKey) {
  return STAFF_SCHEDULED_PROCEDURES.find(item => item.procedureKey === procedureKey) ?? null;
}
