const PRACTICE_ID = '3044';
const NEXT_PATIENT_ORIGIN = 'https://nextpatient.co';
const TELEMED_PRACTICE_ID = '4214';
const GROUPS = new Set(['medical appointment', 'cosmetic consult', 'cosmetic facial', 'cosmetic treatment']);

export function groupForSelection(selection) {
  if (!selection || selection.location !== 'in-office' || !GROUPS.has(selection.appointmentType)) return null;
  return selection.appointmentType;
}

export function buildNextPatientAvailabilityUrl({ reasonId, group }) {
  if (!/^\d{3,8}$/.test(String(reasonId ?? ''))) throw new Error('Invalid NextPatient reason ID');
  if (!GROUPS.has(group)) throw new Error('Invalid NextPatient appointment group');
  const url = new URL(`/p/${PRACTICE_ID}/providers.json`, NEXT_PATIENT_ORIGIN);
  url.searchParams.set('id', PRACTICE_ID);
  url.searchParams.set('reason_id', String(reasonId));
  url.searchParams.set('group', group);
  return url;
}

export function validateNextPatientLink(href, { reasonId }) {
  let url;
  try { url = new URL(href); } catch { throw new Error('Invalid NextPatient link'); }
  if (url.origin !== NEXT_PATIENT_ORIGIN || url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Invalid NextPatient link origin');
  if (url.searchParams.get('reason_id') !== String(reasonId)) throw new Error('NextPatient reason mismatch');
  const match = /^\/p\/3044\/(\d+)\/(appt-book|appointments)$/.exec(url.pathname);
  if (!match) throw new Error('Invalid NextPatient link path');
  return { href: url.href, token: match[1], kind: match[2] === 'appt-book' ? 'slot' : 'more' };
}

function imageFromProvider(node) {
  const imageNode = node.querySelector('.nextpatient-provider-image-cell, .nextpatient-provider-small-photo');
  const match = String(imageNode?.getAttribute('style') ?? '').match(/https:\/\/nextpatient\.co\/[^'")]+/);
  return match?.[0] ?? null;
}

export function parseNextPatientHtml(html, { reasonId, DOMParserCtor = globalThis.DOMParser } = {}) {
  if (typeof DOMParserCtor !== 'function') throw new Error('DOMParser is unavailable');
  const doc = new DOMParserCtor().parseFromString(String(html ?? ''), 'text/html');
  const providers = [];
  for (const node of doc.querySelectorAll('.nextpatient-provider')) {
    const name = node.querySelector('.nextpatient-provider-name')?.textContent?.trim();
    if (!name) continue;
    const blurb = node.querySelector('.nextpatient-provider-blurb');
    const profileNode = blurb?.querySelector('a.nextpatient-profile-url');
    let profileUrl = null;
    if (profileNode?.href) {
      const profile = new URL(profileNode.href);
      if (profile.origin === 'https://revelusdermatology.com' && profile.pathname.startsWith('/providers/')) profileUrl = profile.href;
    }
    const blurbCopy = blurb?.cloneNode(true);
    blurbCopy?.querySelectorAll('a').forEach(link => link.remove());
    const credentials = blurbCopy?.textContent?.trim() ?? '';
    const slots = [];
    let moreUrl = null;
    for (const anchor of node.querySelectorAll('a.nextpatient-slot-time')) {
      const validated = validateNextPatientLink(anchor.href, { reasonId });
      if (validated.kind === 'more') {
        moreUrl = validated.href;
        continue;
      }
      const day = anchor.querySelector('.nextpatient-slot-time-day')?.textContent?.trim() ?? '';
      const time = anchor.querySelector('.nextpatient-slot-time-time')?.textContent?.trim() ?? '';
      if (!day || !time) throw new Error('NextPatient slot is missing day or time');
      slots.push({ label: `${day}, ${time}`, day, time, bookingUrl: validated.href, slotToken: validated.token, clickable: true, liveData: true });
    }
    providers.push({ name, credentials, profileUrl, imageUrl: imageFromProvider(node), slots, moreUrl, liveData: true });
  }
  return providers;
}

export function createNextPatientAvailabilityExecutor({ session, fetchAvailability = fetchNextPatientAvailability }) {
  if (!session?.getAvailabilityContext) throw new Error('Booking session is unavailable');
  return async (input, { signal } = {}) => {
    const context = session.getAvailabilityContext(input);
    if (context.bookingMode === 'call') {
      return {
        status: 'call_required', pathId: input.pathId, selection: context.selection, providers: [],
        liveData: false, fixtureData: false, callRequired: true, humanConfirmationRequired: true,
        notice: 'This appointment is scheduled directly with the Revelus office. Call to continue.'
      };
    }
    if (context.selection.location !== 'in-office') {
      // Virtual visits are online-bookable through the practice's
      // telemedicine scheduler (a separate NextPatient practice); this page's
      // widget renders in-office times only, so hand the patient the real
      // scheduler link instead of claiming a call is required.
      return {
        status: 'self_schedule_online', pathId: input.pathId, selection: context.selection, providers: [],
        liveData: false, fixtureData: false, callRequired: false, humanConfirmationRequired: true,
        schedulingUrl: `https://revelusdermatology.com/schedule/#id=${TELEMED_PRACTICE_ID}&reason_id=${context.selection.reasonId}&group=telemed`,
        notice: 'Virtual visit times are chosen in the Revelus online telemedicine scheduler. Open it to pick a time — nothing is held or booked from this page.'
      };
    }
    const group = groupForSelection(context.selection);
    try {
      const availability = await fetchAvailability({ reasonId: context.selection.reasonId, group, signal });
      return { ...availability, pathId: input.pathId, selection: context.selection };
    } catch (error) {
      if (signal?.aborted) throw error;
      return {
        status: 'unavailable', pathId: input.pathId, selection: context.selection, providers: [],
        liveData: true, fixtureData: false, callRequired: true, humanConfirmationRequired: true,
        errorCode: 'nextpatient_unavailable',
        notice: 'Live NextPatient availability is temporarily unavailable. Contact Revelus to continue.'
      };
    }
  };
}

export async function fetchNextPatientAvailability({ reasonId, group, signal, fetchImpl = globalThis.fetch, DOMParserCtor = globalThis.DOMParser }) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable');
  const url = buildNextPatientAvailabilityUrl({ reasonId, group });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('NextPatient availability timed out')), 15000);
  signal?.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  try {
    const response = await fetchImpl(url, { method: 'GET', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal });
    if (!response.ok) throw new Error(`NextPatient availability failed: ${response.status}`);
    const payload = await response.json();
    if (!payload || typeof payload.html !== 'string') throw new Error('Invalid NextPatient availability response');
    const providers = parseNextPatientHtml(payload.html, { reasonId, DOMParserCtor });
    return {
      status: providers.some(provider => provider.slots.length) ? 'available' : 'call_required',
      providers,
      liveData: true,
      fixtureData: false,
      callRequired: !providers.some(provider => provider.slots.length),
      humanConfirmationRequired: true,
      notice: 'Live NextPatient times are not held or booked. Selecting a time opens the matching NextPatient review page.'
    };
  } finally {
    clearTimeout(timeout);
  }
}
