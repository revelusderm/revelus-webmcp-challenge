import { getFixtureHandoffSummary } from './booking-core.mjs';

const params = new URL(location.href).searchParams;
const fields = {
  provider: document.getElementById('handoff-provider'),
  reason: document.getElementById('handoff-reason'),
  location: document.getElementById('handoff-location'),
  time: document.getElementById('handoff-time')
};

try {
  const summary = getFixtureHandoffSummary({
    provider: params.get('provider'),
    reasonId: params.get('reason_id'),
    fixtureSlot: params.get('fixture_slot')
  });
  fields.provider.textContent = `${summary.providerName} — ${summary.credentials}`;
  fields.reason.textContent = summary.appointmentReason;
  fields.location.textContent = summary.location;
  fields.time.textContent = `${summary.timeLabel} Central Time`;
} catch {
  fields.provider.textContent = 'This fixture selection is invalid or expired.';
  fields.reason.textContent = 'Not available';
  fields.location.textContent = 'Not available';
  fields.time.textContent = 'Not available';
}
