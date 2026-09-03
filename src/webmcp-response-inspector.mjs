import { hasUnknownPersonClinicalTopic } from './input-privacy.mjs';

const TOOL_NAMES = new Set([
  'revelus.search_information',
  'revelus.get_answer',
  'revelus.resolve_visit_path',
  'revelus.get_availability'
]);

const SOURCE_LABELS = Object.freeze({
  webmcp: 'Actual WebMCP tool invocation',
  shared_handler: 'Page control · same registered handler response'
});

const SENSITIVE_KEYS = new Set([
  'patientname', 'email', 'patientemail', 'patientphone', 'dateofbirth', 'dob',
  'insurancememberid', 'medicalhistory', 'photodata', 'cookie', 'authorization',
  'accesstoken', 'refreshtoken', 'sessiontoken', 'clientsecret', 'secret', 'token',
  'apikey', 'password', 'ssn', 'mrn', 'phone', 'insuranceid'
]);

function normalizedKey(value) {
  return String(value).replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function assertNoSensitiveFields(value, allowedPublicNames, seen = new Set()) {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertNoSensitiveFields(item, allowedPublicNames, seen);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(normalizedKey(key))) throw new Error(`WebMCP inspector refuses sensitive field: ${key}`);
    if (normalizedKey(key) === 'query' && typeof child === 'string' && hasUnknownPersonClinicalTopic(child, { allowedPublicNames })) {
      throw new Error('WebMCP inspector refuses sensitive query text');
    }
    assertNoSensitiveFields(child, allowedPublicNames, seen);
  }
}

function assertExactJsonValue(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new Error('WebMCP response must be exactly JSON-serializable');
    return;
  }
  if (typeof value !== 'object') throw new Error('WebMCP response must be exactly JSON-serializable');
  if (ancestors.has(value)) throw new Error('WebMCP response must be exactly JSON-serializable');
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new Error('WebMCP response must be exactly JSON-serializable');
      assertExactJsonValue(value[index], ancestors);
    }
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error('WebMCP response must be exactly JSON-serializable');
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') throw new Error('WebMCP response must be exactly JSON-serializable');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('WebMCP response must be exactly JSON-serializable');
      assertExactJsonValue(descriptor.value, ancestors);
    }
  }
  ancestors.delete(value);
}

export function formatWebMcpInspector({ toolName, source, result, allowedPublicNames = [] }) {
  if (!TOOL_NAMES.has(toolName)) throw new Error('Unknown WebMCP tool name');
  if (!Object.hasOwn(SOURCE_LABELS, source)) throw new Error('Unknown WebMCP response source');
  assertExactJsonValue(result);
  assertNoSensitiveFields(result, allowedPublicNames);
  let clearText;
  try {
    clearText = JSON.stringify(result, null, 2);
  } catch {
    throw new Error('WebMCP response must be exactly JSON-serializable');
  }
  if (clearText === undefined || JSON.stringify(JSON.parse(clearText)) !== JSON.stringify(result)) throw new Error('WebMCP response must be exactly JSON-serializable');
  if (clearText.length > 500_000) throw new Error('WebMCP response is too large for the inspector');
  return Object.freeze({ toolName, sourceLabel: SOURCE_LABELS[source], clearText });
}
