import { bookingCatalog } from './booking-catalog.mjs';
import { STAFF_SCHEDULED_PROCEDURE_KEYS } from './service-scheduling-policy.mjs';

const routeKeys = bookingCatalog.map(route => route.routeKey);

export const RESOLVE_TOOL_NAME = 'revelus.resolve_visit_path';
export const AVAILABILITY_TOOL_NAME = 'revelus.get_availability';

const preferredLocation = { type: 'string', enum: ['virtual', 'in-office', 'no-preference'] };
const patientStatus = { type: 'string', enum: ['new', 'returning', 'unknown'] };

export const resolveInputSchema = Object.freeze({
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        routeKey: { type: 'string', enum: routeKeys },
        hasRecentConsultOrPackage: { type: 'boolean' },
        hasPriorConsult: { type: 'boolean' }
      },
      required: ['routeKey']
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        intent: { const: 'prescription_refill' },
        preferredLocation,
        patientStatus
      },
      required: ['intent', 'preferredLocation', 'patientStatus']
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        intent: { const: 'general_medical_concerns' },
        preferredLocation,
        patientStatus,
        medicare: { type: 'boolean' },
        concernCount: { type: 'integer', minimum: 1, maximum: 3 },
        concerns: {
          type: 'array', minItems: 1, maxItems: 3, uniqueItems: true,
          items: { type: 'string', enum: ['acne', 'rash', 'hair_loss', 'prescription_refill', 'follow_up', 'other'] }
        },
        needsSkinCancerScreening: { type: 'boolean' }
      },
      required: ['intent', 'preferredLocation']
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        intent: { const: 'staff_scheduled_procedure' },
        procedureKey: { type: 'string', enum: STAFF_SCHEDULED_PROCEDURE_KEYS },
        evaluationStatus: { type: 'string', enum: ['unknown', 'needs_evaluation', 'evaluated_by_revelus'] }
      },
      required: ['intent', 'procedureKey', 'evaluationStatus']
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        intent: { const: 'sculptra' },
        preferredLocation,
        hasRecentConsultOrPackage: { type: 'boolean' }
      },
      required: ['intent', 'preferredLocation']
    }
  ]
});

export const availabilityInputSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    pathId: {
      type: 'string',
      minLength: 1,
      maxLength: 160,
      pattern: '^path_[0-9]+_[a-z0-9_]+$'
    }
  },
  required: ['pathId']
});
