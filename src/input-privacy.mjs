const DIRECT_IDENTIFIER = /(?:\b\d{3}[-.) ]?\d{3}[-. ]?\d{4}\b|\b\d{3}-\d{2}-\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b(?:0?[1-9]|1[0-2])[\/-](?:0?[1-9]|[12]\d|3[01])[\/-](?:\d{2}|\d{4})\b|\b(?:dob|date of birth|my name is|patient name|ssn|social security(?: number)?|mrn|medical record(?: number)?|member id|insurance(?: member)? id)\b|[\w.+-]+@[\w.-]+\.[a-z]{2,})/i;
const HISTORY_TERM = /\bhistor(?:y|ies|ical(?:ly)?)\b/i;
const CLINICAL_HISTORY = /\b(?:medical|health|patient|family)\s*[- ]\s*histor(?:y|ies|ical(?:ly)?)\b/i;
const NON_CLINICAL_HISTORY = /\b(?:professional|practice|product|company|leadership|brand|organizational)\s+histor(?:y|ies|ical(?:ly)?)\b/i;
const PERSONAL_REFERENCE = /(?:\b(?:my|your|our|his|her|their|i|you|we|patient|patients|family|families)\b|\b[A-Za-z][A-Za-z.-]*['’]s\b|\bpatients['’]\b)/i;
const CLINICAL_INTERPRETATION = /(?:\bdiagnos(?:e|ing)\s+(?:this|my|me)\b|\b(?:give|tell)\s+me\s+(?:a\s+)?diagnosis\b|tell me what it is|is this cancer|patient photo|my photo)/i;
const CLINICAL_TOPIC = /\b(?:psoriasis|eczema|acne|rash|mohs|melanoma|cancer|carcinoma|mole|cyst|lipoma|biopsy|surgery|dermatology|dermatitis|rosacea|alopecia|wart|warts|fungus|fungal|hair loss|botox|lesion|tumor|tumour|scar|keloid|skin tag)\b/i;
const CLINICAL_TOPIC_START = /^\s*(?:psoriasis|eczema|acne|rash|mohs|melanoma|cancer|carcinoma|mole|cyst|lipoma|biopsy|surgery|dermatology|dermatitis|rosacea|alopecia|wart|warts|fungus|fungal|hair loss|botox|lesion|tumor|tumour|scar|keloid|skin tag)\b/i;
const NON_PERSON_NAME_WORDS = new Set(['what','which','who','how','much','historical','use','you','offer','the','at','practice','does','should','could','would','can','for','of','history','tell','compare','between','anything','but','mean','about','revelus','psoriasis','eczema','acne','rash','skin','cancer','basal','cell','squamous','hair','loss','mohs','melanoma','carcinoma','mole','cyst','lipoma','biopsy','dermatology','dermatitis','rosacea','alopecia','wart','warts','fungus','fungal','botox','lesion','tumor','tumour','scar','keloid','tag','xtrac','excimer','hyperhidrosis','molluscum','contagiosum','xeomin','dysport','jeuveau','surgery','medical','cosmetic','focused','standard','body','laser','facial','treatment','treatments','options','symptoms','signs','causes','care','appointment','evaluation','removal','therapy','information','results','recovery','covered','insurance','before','after','procedure','them','it','have','need','want','with','patient','oral','prescription','refill',
  // Pronouns, articles, prepositions, interrogatives, auxiliaries, and
  // laterality — never person names.
  'my','your','our','his','her','their','its','this','that','these','those','some','any','both','a','an','on','in','under','over','near','around','behind','left','right','upper','lower','inner','outer',
  'when','where','why','will','did','do','done','get','gets','getting','got','take','takes','long','soon','come','comes','coming','back','ready','i','im','is','are','was','were','be','been','being','if','then','there','here','again','still','also','just','really','very',
  // Everyday descriptive vocabulary — symptom descriptions like "ring shaped
  // rash" or "mole that changed color" are not patient names.
  'new','old','soap','lotion','shampoo','sunscreen','detergent','ring','shaped','round','changed','changing','changes','color','colors','thick','thin','raised','flat','keeps','growing','grows','grown','trying','tried','using','used','easily','bleeding','bleeds','bleed','sore','sores','heal','heals','healing','wont','scaly','flaky','rough','smooth','waxy','pearly','shiny','bumpy','small','big','large','little','painful','itching','itchy','burning','burns','hurts','red','brown','black','white','dark','pink','purple','yellow','blister','blisters','side','one','two','three','appeared','started','starts','stuck','fatty','soft','hard','deep','fine','lines','crows','dots','welts','tone','uneven','exam','exams','yearly','annual','video','visit','visits','sun','tan','spreading','spread','spots','patchy','crusty','dry','oily','flushed','flushing','swollen','tender','bump','lump','lumps','growth','mark','marks','stubborn',
  // Body locations — "wart on my foot" and "rash in my groin" are ordinary
  // layman phrasing, not patient identifiers.
  'foot','feet','leg','legs','arm','arms','face','scalp','head','neck','back','chest','groin','hand','hands','finger','fingers','toe','toes','nail','nails','knee','knees','elbow','elbows','shoulder','shoulders','stomach','belly','armpit','armpits','thigh','thighs','ankle','ankles','lip','lips','eyelid','eyelids','ear','ears','nose','cheek','cheeks','chin','forehead','hairline','waist','hip','hips','wrist','wrists','area','areas','spot','spots','bump','bumps','patch','patches','growth','growths']);
const NAME_TOKEN = "[A-Za-z][A-Za-z'’.-]{1,30}";
// A request to retrieve someone's clinical records or results. Requires an
// access verb plus a personal possessive plus a records noun so that published
// process questions ("when will I get my biopsy results?") still pass.
const RECORDS_REQUEST = /(?:\b(?:look\s*up|check|access|pull\s*up|pull|view|see|find|get\s+into|retrieve|read|open|log\s*in(?:to)?|show\s+me|tell\s+me)\b[^.?!]{0,40}\b(?:my|his|her|their|our)\b[^.?!]{0,30}\b(?:results?|records?|chart|labs?|pathology|reports?|portal|messages?)\b|\bwhat\s+(?:did|do|does)\s+my\s+(?:biopsy|labs?|tests?|pathology|results?)\s+(?:show|say|find|mean)\b|\bdid\s+my\s+(?:results?|biopsy|labs?|tests?)\s+come\s+(?:back|in)\b|\b(?:are|is)\s+my\s+(?:results?|biopsy|labs?)\s+(?:back|in|ready)\b)/i;

// The same secure-chat destination the Revelus website presents as "Chat".
export const SECURE_CHAT_URL = 'https://patient.klara.com/#/widget/signup/8824/verify';
export const OFFICE_PHONE_LABEL = 'Call Revelus at (512) 815-2559';
export const OFFICE_PHONE_HREF = 'tel:+15128152559';

const REASON_MESSAGES = Object.freeze({
  identifier: 'Do not include patient information such as names, contact details, dates of birth, medical history, photos, or requests for diagnosis',
  medical_history: 'Do not include patient information such as names, contact details, dates of birth, medical history, photos, or requests for diagnosis',
  diagnosis_or_image_interpretation: 'Do not include patient information such as names, contact details, dates of birth, medical history, photos, or requests for diagnosis',
  possible_patient_name: 'Do not include patient information such as names, contact details, dates of birth, medical history, photos, or requests for diagnosis',
  records_request: 'This assistant cannot access patient records, test results, or messages — they stay inside Revelus’s secure clinical systems. For help with your records, use the secure chat below or call us at (512) 815-2559. This assistant can still help with published Revelus information and finding the right appointment.'
});

const REASON_ACTIONS = Object.freeze({
  records_request: Object.freeze([
    Object.freeze({ kind: 'chat', label: 'Start a secure chat', url: SECURE_CHAT_URL }),
    Object.freeze({ kind: 'call', label: OFFICE_PHONE_LABEL, href: OFFICE_PHONE_HREF })
  ])
});

export function sensitiveInputActions(reason) {
  return REASON_ACTIONS[reason] ?? [];
}

function normalize(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function hasUnknownPersonClinicalTopic(text, { allowedPublicNames = [] } = {}) {
  const value = String(text ?? '');
  if (!CLINICAL_TOPIC.test(value)) return false;
  const allowed = new Set();
  for (const name of allowedPublicNames) {
    const parts = normalize(name).split(' ').filter(Boolean);
    for (let index = 0; index + 1 < parts.length; index += 1) allowed.add(`${parts[index]} ${parts[index + 1]}`);
  }
  const candidates = [];
  const patterns = [
    new RegExp(`^\\s*(${NAME_TOKEN})\\s+(${NAME_TOKEN})\\b`, 'i'),
    new RegExp(`\\bdoes\\s+(${NAME_TOKEN})\\s+(${NAME_TOKEN})\\s+(?:have|need|want|with)\\b`, 'i'),
    new RegExp(`\\bpatient\\s*:?\\s+(${NAME_TOKEN})\\s+(${NAME_TOKEN})\\b`, 'i')
  ];
  if (CLINICAL_TOPIC_START.test(value)) patterns.push(new RegExp(`\\b(${NAME_TOKEN})\\s+(${NAME_TOKEN})\\s*[?.!]*$`, 'i'));
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) candidates.push([match[1], match[2]]);
  }
  for (const candidateParts of candidates) {
    const parts = candidateParts.map(part => normalize(part));
    if (parts.some(part => NON_PERSON_NAME_WORDS.has(part))) continue;
    const candidate = parts.join(' ');
    if (!allowed.has(candidate)) return true;
  }
  return false;
}

export function sensitiveInputReason(text, options = {}) {
  const value = String(text ?? '');
  if (DIRECT_IDENTIFIER.test(value)) return 'identifier';
  if (CLINICAL_HISTORY.test(value) || (!NON_CLINICAL_HISTORY.test(value) && HISTORY_TERM.test(value) && PERSONAL_REFERENCE.test(value))) return 'medical_history';
  if (CLINICAL_INTERPRETATION.test(value)) return 'diagnosis_or_image_interpretation';
  if (RECORDS_REQUEST.test(value)) return 'records_request';
  if (hasUnknownPersonClinicalTopic(value, options)) return 'possible_patient_name';
  return null;
}

export function sensitiveInputMessage(reason) {
  return REASON_MESSAGES[reason] ?? REASON_MESSAGES.identifier;
}

export function assertNoPatientInformation(text, options = {}) {
  const reason = sensitiveInputReason(text, options);
  if (reason) throw new Error(sensitiveInputMessage(reason));
}
