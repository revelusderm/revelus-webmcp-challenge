export function createBookingController({ session, onUpdate = () => {} }) {
  return {
    resolve(input) {
      const result = session.resolveVisitPath(input);
      onUpdate({ phase: 'resolved', result });
      return result;
    },

    async availability(pathId) {
      const result = await session.getFixtureAvailability({ pathId });
      onUpdate({ phase: 'availability', result });
      return result;
    },

    invalidateHumanSelection() {
      session.invalidateResolvedPaths();
      const update = { phase: 'invalidated' };
      onUpdate(update);
      return update;
    }
  };
}
