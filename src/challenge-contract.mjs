import {
  RESOLVE_TOOL_NAME,
  AVAILABILITY_TOOL_NAME,
  resolveInputSchema,
  availabilityInputSchema
} from './booking-contract.mjs';

export const SEARCH_TOOL_NAME = 'revelus.search_information';
export const ANSWER_TOOL_NAME = 'revelus.get_answer';
export { RESOLVE_TOOL_NAME, AVAILABILITY_TOOL_NAME, resolveInputSchema, availabilityInputSchema };

export const searchInputSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    query: { type: 'string', minLength: 2, maxLength: 180 },
    limit: {
      type: 'integer', minimum: 1, maximum: 10,
      description: 'Return four ranked pages initially. Raise the limit only when the user asks for more matching pages or the first four are insufficient.'
    }
  },
  required: ['query']
});

export const answerInputSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    entryId: { type: 'string', minLength: 3, maxLength: 220, pattern: '^(faq|page|fact|offer_collection|provider_relationship):' }
  },
  required: ['entryId']
});

// Solution 3's shared output contract. WebMCP currently registers input
// schemas only, but exporting the projection schema keeps UI integrations and
// conformance tests anchored to the same engine-owned shape.
export const pageCardOutputSchema = Object.freeze({
  type: 'object',
  additionalProperties: true,
  required: [
    'pageId', 'slug', 'sourceUrl', 'title', 'kind', 'summary', 'hero',
    'atAGlance', 'atAGlanceFootnotes', 'faqs', 'relationships', 'providers',
    'actions', 'bookingRouteKey', 'schedulingPolicy', 'answerSafety',
    'responseGuidance'
  ],
  properties: {
    pageId: { type: 'string', minLength: 1 },
    slug: { type: 'string', minLength: 1 },
    sourceUrl: { type: 'string', pattern: '^https://' },
    title: { type: 'string', minLength: 1 },
    kind: { enum: ['condition', 'medical_service', 'cosmetic_service', 'provider', 'resource'] },
    summary: { type: 'string', minLength: 1 },
    hero: { type: ['object', 'null'] },
    atAGlance: { type: 'array' },
    atAGlanceFootnotes: { type: 'array' },
    faqs: { type: 'array' },
    relationships: {
      type: 'object',
      required: ['treatment_for', 'provider_addressing', 'provider_offering', 'related_condition', 'condition_addressed', 'related_service']
    },
    providers: { type: 'array' },
    actions: { type: 'array' },
    bookingRouteKey: { type: ['string', 'null'] },
    schedulingPolicy: { type: 'object' },
    answerSafety: { type: 'object' },
    responseGuidance: {
      type: 'object',
      additionalProperties: false,
      required: ['practiceStatement', 'clinicalBoundary', 'patientConclusion'],
      properties: {
        practiceStatement: { type: 'string', minLength: 1 },
        clinicalBoundary: { type: 'string', minLength: 1 },
        patientConclusion: { const: 'not_determined' }
      }
    }
  }
});
