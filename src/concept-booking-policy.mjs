export function shouldCreateConceptBookingPlan({ concept, answer, explicitChoice = false }) {
  if (concept?.bookingConfidence !== 'validated' || !concept.bookingRouteCandidate) return false;
  if (explicitChoice) return true;
  return answer?.relatedBookingRoute === concept.bookingRouteCandidate;
}
