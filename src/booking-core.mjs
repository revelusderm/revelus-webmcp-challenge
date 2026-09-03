import { routeByKey } from './booking-catalog.mjs';
import { resolveInputSchema, availabilityInputSchema } from './booking-contract.mjs';
import { assertBoundedJsonValue, validateJsonSchema } from './schema-validator.mjs';
import { procedureDefinition, OFFICE_CONTROLLED_ROUTE_KEYS } from './service-scheduling-policy.mjs';

const ALLOWED_RESOLUTION_FIELDS = new Set([
  'routeKey',
  'intent',
  'preferredLocation',
  'patientStatus',
  'medicare',
  'concernCount',
  'concerns',
  'needsSkinCancerScreening',
  'hasRecentConsultOrPackage',
  'hasPriorConsult',
  'procedureKey',
  'evaluationStatus'
]);

const PROVIDERS = {
  lindsay: {
    name: 'Lindsay Weber, PA-C', credentials: 'Dermatology Physician Assistant',
    imageUrl: 'https://nextpatient.co/static/practices/3044/Lindsay-Weber.jpg',
    profileUrl: 'https://revelusdermatology.com/providers/lindsay-weber-pa-c/'
  },
  blakely: {
    name: 'Blakely Richardson, DO, FAAD', credentials: 'Board-Certified Dermatologist and Medical Director',
    imageUrl: 'https://nextpatient.co/static/practices/3044/Blakely-Richardson.jpg',
    profileUrl: 'https://revelusdermatology.com/providers/dr-blakely-richardson/'
  },
  sital: {
    name: 'Sital Patel, DO, FAAD', credentials: 'Board-Certified Dermatologist',
    imageUrl: 'https://nextpatient.co/static/practices/3044/Sital-Patel.jpg',
    profileUrl: 'https://revelusdermatology.com/providers/dr-sital-patel/'
  },
  peije: {
    name: 'Peije Fincher, LA, CLT', credentials: 'Licensed Aesthetician and Certified Laser Technician',
    imageUrl: 'https://nextpatient.co/static/practices/3044/Peije-Fincher.jpg',
    profileUrl: 'https://revelusdermatology.com/providers/peije-fincher-la/'
  }
};

const FIXTURE_TIMES = [
  '2026-09-11T12:30:00-05:00',
  '2026-09-11T12:45:00-05:00'
];

const austinTimeFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Chicago'
});

function rejectUnsupportedFields(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Booking request must be an object');
  }
  const unsupported = Object.keys(input).filter(key => !ALLOWED_RESOLUTION_FIELDS.has(key));
  if (unsupported.length) {
    throw new Error(`Unsupported or sensitive fields: ${unsupported.join(', ')}`);
  }
}

function fixtureProvidersFor(route, handoffBaseUrl) {
  if (route.bookingMode === 'call') return [];
  let providerKeys;
  switch (route.branch) {
    case 'virtual_medical': providerKeys = ['lindsay', 'sital']; break;
    case 'cosmetic_facial': providerKeys = ['peije']; break;
    case 'cosmetic_consult': providerKeys = ['blakely', 'lindsay', 'peije', 'sital']; break;
    case 'cosmetic_treatment': providerKeys = ['blakely', 'lindsay', 'sital']; break;
    default: providerKeys = ['blakely', 'lindsay', 'sital'];
  }
  return providerKeys.map((key, index) => ({
    ...PROVIDERS[key],
    slots: FIXTURE_TIMES.map((time, timeIndex) => {
      const date = new Date(time);
      date.setUTCDate(date.getUTCDate() + index * 2 + timeIndex);
      const bookingUrl = new URL(handoffBaseUrl);
      bookingUrl.searchParams.set('provider', key);
      bookingUrl.searchParams.set('reason_id', route.reasonId);
      bookingUrl.searchParams.set('fixture_slot', `${index}-${timeIndex}`);
      return {
        startsAt: date.toISOString(),
        label: austinTimeFormatter.format(date),
        bookingUrl: bookingUrl.href,
        clickable: true,
        fixtureData: true
      };
    })
  }));
}

export function getFixtureHandoffSummary({ provider, reasonId, fixtureSlot }) {
  if (![provider, reasonId, fixtureSlot].every(value => typeof value === 'string')) {
    throw new Error('Invalid fixture handoff parameters');
  }
  const route = [...routeByKey.values()].find(candidate => candidate.reasonId === reasonId);
  const match = /^(\d+)-(\d+)$/.exec(fixtureSlot);
  if (!route || !match) throw new Error('Unknown fixture handoff');
  const providerIndex = Number(match[1]);
  const slotIndex = Number(match[2]);
  const providers = fixtureProvidersFor(route, 'http://127.0.0.1/handoff.html');
  const selectedProvider = providers[providerIndex];
  const selectedSlot = selectedProvider?.slots[slotIndex];
  const providerKey = selectedSlot ? new URL(selectedSlot.bookingUrl).searchParams.get('provider') : null;
  if (!selectedProvider || !selectedSlot || providerKey !== provider) throw new Error('Unknown fixture handoff');
  return {
    providerName: selectedProvider.name,
    credentials: selectedProvider.credentials,
    appointmentReason: route.selection.visitReason,
    location: route.selection.location === 'in-office' ? 'South Austin' : 'Virtual',
    timeLabel: selectedSlot.label,
    fixtureData: true,
    booked: false
  };
}

function prerequisiteResult(route, input, toPath, routeByKey) {
  if (route.requiresRecentConsultOrPackage && input.hasRecentConsultOrPackage !== true) {
    const missing = !Object.hasOwn(input, 'hasRecentConsultOrPackage');
    if (missing) {
      return {
        status: 'clarification_required',
        missingFields: ['hasRecentConsultOrPackage'],
        question: 'Do you have an existing package or a consultation within the last 90 days?',
        paths: []
      };
    }
    // No package/recent consultation: route to the cosmetic consultation
    // instead of exposing the treatment appointment (practice policy).
    return {
      status: 'resolved',
      paths: [toPath(routeByKey.get('consult_wrinkles'), {
        guidance: `A consultation is required before scheduling ${route.selection.visitReason}. Book the cosmetic consultation first.`,
        requestedTreatment: route.routeKey
      })],
      explanation: 'Without an existing package or a consultation in the last 90 days, this treatment is scheduled after a cosmetic consultation.'
    };
  }
  if (route.requiresPriorConsult && input.hasPriorConsult !== true) {
    const missing = !Object.hasOwn(input, 'hasPriorConsult');
    return {
      status: missing ? 'clarification_required' : 'prerequisite_required',
      missingFields: missing ? ['hasPriorConsult'] : [],
      question: 'Has the required consultation already been completed?',
      paths: []
    };
  }
  return null;
}

function staffAssistanceFor(procedure) {
  return {
    type: 'staff_scheduled_procedure',
    procedureKey: procedure.procedureKey,
    procedureLabel: procedure.procedureLabel,
    officeSchedulesDirectly: true,
    staffOutreachInitiated: false,
    callbackRequestAccepted: false,
    message: `Already evaluated by Revelus? ${procedure.procedureLabel} is scheduled directly by our office. Call during business hours to continue.`,
    action: {
      type: 'call_office',
      label: 'Call Revelus at (512) 815-2559',
      href: 'tel:+15128152559',
      duringBusinessHours: true
    }
  };
}

function staffAssistanceForRoute(route) {
  let message;
  if (route.routeKey === 'medical_referral') {
    message = 'Referral scheduling is coordinated by staff after required paperwork is processed. This page does not submit paperwork or initiate outreach. Call during business hours if you need help confirming the next step.';
  } else if (route.routeKey === 'medical_standard') {
    message = 'Standard appointments covering multiple concerns are scheduled directly by our office. Call during business hours to continue.';
  } else if (route.routeKey === 'medical_surgical_procedure') {
    message = 'Surgical procedures already evaluated by Revelus are scheduled directly by our office. Call during business hours to continue.';
  } else {
    message = 'This treatment is scheduled directly by our office after the required consultation or plan verification. Call during business hours to continue.';
  }
  return {
    type: 'office_controlled_route',
    routeKey: route.routeKey,
    officeSchedulesDirectly: true,
    staffOutreachInitiated: false,
    callbackRequestAccepted: false,
    message,
    action: { type: 'call_office', label: 'Call Revelus at (512) 815-2559', href: 'tel:+15128152559', duringBusinessHours: true }
  };
}

function officeControlledRouteResult(route, input = {}) {
  const acknowledgedFlags = ['hasRecentConsultOrPackage', 'hasPriorConsult'].filter(flag => input[flag] === true);
  return {
    status: 'staff_assistance_required',
    paths: [],
    staffAssistance: staffAssistanceForRoute(route),
    ...(acknowledgedFlags.length ? {
      explanation: 'A prior consultation or package is noted, but this service is scheduled directly by the Revelus office rather than online — the office confirms eligibility when you call.'
    } : {})
  };
}

function evaluationGuidance(procedure) {
  if (procedure.procedureKey === 'lipoma_removal') {
    return 'Book a focused medical evaluation first. A patient-described lipoma could be a cyst or another condition, so the clinician must evaluate it before procedure scheduling.';
  }
  return `Book a focused medical evaluation first so Revelus can confirm the concern and the appropriate next step before ${procedure.procedureLabel} scheduling.`;
}

function clarificationFor(input, fields) {
  const missingFields = fields.filter(field => !Object.hasOwn(input, field));
  if (!missingFields.length) return null;
  return {
    status: 'clarification_required',
    missingFields,
    question: `Please provide the missing booking facts: ${missingFields.join(', ')}.`,
    paths: []
  };
}

function validateHandoffBaseUrl(value, trustedHttpsOrigin) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid fixture handoff URL'); }
  const allowedHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', 'host.docker.internal']);
  const isLocalHttp = url.protocol === 'http:' && allowedHosts.has(url.hostname);
  let isTrustedHttps = false;
  if (trustedHttpsOrigin !== undefined) {
    let trusted;
    try { trusted = new URL(trustedHttpsOrigin); } catch { throw new Error('Invalid trusted HTTPS origin'); }
    if (trusted.protocol !== 'https:' || trusted.pathname !== '/' || trusted.search || trusted.hash || trusted.username || trusted.password) {
      throw new Error('Invalid trusted HTTPS origin');
    }
    isTrustedHttps = url.protocol === 'https:' && url.origin === trusted.origin;
  }
  if (!isLocalHttp && !isTrustedHttps) throw new Error('Fixture handoff must use local HTTP or trusted same-origin HTTPS');
  if (url.pathname !== '/handoff.html' || url.username || url.password || url.search || url.hash) {
    throw new Error('Fixture handoff must target the approved /handoff.html page');
  }
  return url.href;
}

export function createBookingSession({
  handoffBaseUrl = 'http://127.0.0.1/handoff.html',
  trustedHttpsOrigin
} = {}) {
  handoffBaseUrl = validateHandoffBaseUrl(handoffBaseUrl, trustedHttpsOrigin);
  const paths = new Map();
  const audit = { bookingsSubmitted: 0 };
  let generation = 0;

  function beginResolution() {
    generation += 1;
    paths.clear();
  }

  function toPath(route, extra = {}) {
    if (!route) throw new Error('Unknown booking route');
    const path = {
      pathId: `path_${generation}_${route.routeKey}`,
      bookingRouteKey: route.routeKey,
      selection: { ...route.selection },
      guidance: route.guidance,
      bookingMode: route.bookingMode,
      ...extra,
      humanConfirmationRequired: true
    };
    paths.set(path.pathId, { ...path, routeKey: route.routeKey, generation });
    return structuredClone(path);
  }

  // Shared Sculptra rules for both the intent form and the generic routeKey
  // form, so equivalent inputs always route identically.
  function sculptraResult(input) {
    if (!Object.hasOwn(input, 'hasRecentConsultOrPackage')) {
      return {
        status: 'clarification_required',
        missingFields: ['hasRecentConsultOrPackage'],
        question: 'Do you have an existing package or a consultation within the last 90 days?',
        paths: []
      };
    }
    if (input.hasRecentConsultOrPackage) {
      return officeControlledRouteResult(routeByKey.get('treatment_sculptra'), input);
    }
    return {
      status: 'resolved',
      paths: [toPath(routeByKey.get('consult_wrinkles'), {
        guidance: 'A consultation is required before scheduling Sculptra treatment.',
        requestedTreatment: 'sculptra'
      })]
    };
  }

  function availabilityPath(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Availability request must be an object');
    const extra = Object.keys(input).filter(key => key !== 'pathId');
    if (extra.length) throw new Error(`Unsupported additional availability fields: ${extra.join(', ')}`);
    assertBoundedJsonValue(input);
    validateJsonSchema(availabilityInputSchema, input);
    const path = paths.get(input.pathId);
    if (!path || path.generation !== generation) throw new Error('Unknown or stale path');
    return { path, route: routeByKey.get(path.routeKey) };
  }

  return {
    resolveVisitPath(input) {
      beginResolution();
      rejectUnsupportedFields(input);
      assertBoundedJsonValue(input);
      validateJsonSchema(resolveInputSchema, input);

      if (input.routeKey) {
        const route = routeByKey.get(input.routeKey);
        if (!route) throw new Error('Unknown booking route');
        // The generic sculptra route follows the same rules as the sculptra
        // intent, so equivalent inputs cannot produce different routing.
        if (route.routeKey === 'treatment_sculptra') return sculptraResult(input);
        if (OFFICE_CONTROLLED_ROUTE_KEYS.has(route.routeKey)) return officeControlledRouteResult(route, input);
        const prerequisite = prerequisiteResult(route, input, toPath, routeByKey);
        if (prerequisite) return prerequisite;
        return { status: 'resolved', paths: [toPath(route)] };
      }

      if (input.intent === 'staff_scheduled_procedure') {
        const procedure = procedureDefinition(input.procedureKey);
        if (!procedure) throw new Error('Unknown staff-scheduled procedure');
        const staffAssistance = staffAssistanceFor(procedure);
        if (input.evaluationStatus === 'evaluated_by_revelus') {
          return {
            status: 'staff_assistance_required',
            question: `Has Revelus already evaluated this concern and told you to schedule ${procedure.procedureLabel}?`,
            paths: [],
            staffAssistance
          };
        }
        const evaluationPath = toPath(routeByKey.get('medical_focused'), {
          purpose: 'procedure_evaluation',
          optionLabel: 'New or needs evaluation',
          requestedProcedure: procedure.procedureKey,
          guidance: evaluationGuidance(procedure)
        });
        if (input.evaluationStatus === 'needs_evaluation') {
          return {
            status: 'resolved',
            paths: [evaluationPath],
            staffAssistance,
            explanation: 'The focused visit is for evaluation; it does not promise that the procedure will be performed that day.'
          };
        }
        return {
          status: 'choice_required',
          question: `Has Revelus already evaluated this exact concern and told you to schedule ${procedure.procedureLabel}?`,
          paths: [evaluationPath],
          staffAssistance,
          explanation: 'Choose a focused evaluation if this is new, uncertain, or not yet evaluated. If Revelus already instructed you to schedule the procedure, call the office.'
        };
      }

      if (input.intent === 'prescription_refill') {
        const routeKey = input.preferredLocation === 'virtual'
          ? 'virtual_prescription_refill'
          : 'medical_prescription_refill';
        return { status: 'resolved', paths: [toPath(routeByKey.get(routeKey))] };
      }

      if (input.intent === 'general_medical_concerns') {
        // concernCount counts only the structured medical concerns; the
        // skin-cancer screening is requested separately. When concerns are
        // provided without a count, derive it instead of failing.
        if (!Object.hasOwn(input, 'concernCount') && Array.isArray(input.concerns)) {
          input = { ...input, concernCount: input.concerns.length };
        }
        const clarification = clarificationFor(input, [
          'concernCount',
          'medicare',
          'needsSkinCancerScreening'
        ]);
        if (clarification) return clarification;
        if (input.concerns && input.concerns.length !== input.concernCount) {
          throw new Error('concernCount counts only the entries in concerns (a skin-cancer screening is requested separately via needsSkinCancerScreening) — provide exactly concernCount concern values');
        }

        const concern = input.concerns?.[0];
        const oneConcernRoute = {
          acne: 'medical_acne',
          rash: 'medical_rash',
          hair_loss: 'medical_hair_loss',
          prescription_refill: 'medical_prescription_refill',
          follow_up: 'medical_follow_up'
        }[concern];
        const virtualOneConcernRoute = {
          acne: 'virtual_acne',
          prescription_refill: 'virtual_prescription_refill',
          follow_up: 'virtual_follow_up'
        }[concern] ?? 'virtual_focused';
        let primaryRouteKey;
        if (input.medicare) {
          primaryRouteKey = 'medical_medicare';
        } else if (
          input.preferredLocation === 'virtual' &&
          input.concernCount === 1 &&
          !input.needsSkinCancerScreening
        ) {
          primaryRouteKey = virtualOneConcernRoute;
        } else if (input.concernCount === 1 && oneConcernRoute) {
          primaryRouteKey = oneConcernRoute;
        } else {
          primaryRouteKey = input.concernCount === 1 ? 'medical_focused' : 'medical_standard';
        }

        const primaryRoute = routeByKey.get(primaryRouteKey);
        const primaryStaffAssistance = OFFICE_CONTROLLED_ROUTE_KEYS.has(primaryRouteKey) ? staffAssistanceForRoute(primaryRoute) : null;
        const resolvedPaths = primaryStaffAssistance ? [] : [toPath(primaryRoute, {
          ...(input.concerns?.length ? { requestedConcerns: [...input.concerns] } : {})
        })];
        if (input.needsSkinCancerScreening) {
          resolvedPaths.push(toPath(routeByKey.get('skin_cancer_screening')));
        }
        return {
          status: primaryStaffAssistance ? (resolvedPaths.length ? 'choice_required' : 'staff_assistance_required') : 'resolved',
          paths: resolvedPaths,
          ...(primaryStaffAssistance ? { staffAssistance: primaryStaffAssistance } : {}),
          ...(input.needsSkinCancerScreening
            ? {
                explanation: primaryStaffAssistance
                  ? 'The skin cancer screening can be booked online. The multi-concern standard visit is scheduled directly by staff.'
                  : 'Skin cancer screening is booked separately from appointments addressing other concerns.',
                requiresPathChoice: true
              }
            : {})
        };
      }

      if (input.intent === 'sculptra') return sculptraResult(input);

      throw new Error('Unsupported booking request');
    },

    getAvailabilityContext(input) {
      const { path, route } = availabilityPath(input);
      return {
        pathId: input.pathId,
        selection: structuredClone(path.selection),
        guidance: path.guidance,
        bookingMode: path.bookingMode,
        branch: route.branch
      };
    },

    async getFixtureAvailability(input) {
      const { path, route } = availabilityPath(input);
      const providers = fixtureProvidersFor(route, handoffBaseUrl);
      return {
        status: providers.length ? 'available' : 'call_required',
        pathId: input.pathId,
        selection: structuredClone(path.selection),
        providers,
        fixtureData: true,
        callRequired: providers.length === 0,
        notice: 'Prototype fixture times are not held, reserved, or booked.',
        humanConfirmationRequired: true
      };
    },

    invalidateResolvedPaths() {
      beginResolution();
    },

    getAudit() {
      return { ...audit };
    }
  };
}
