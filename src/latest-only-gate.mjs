export function createLatestOnlyGate() {
  let generation = 0;
  return Object.freeze({
    begin() {
      generation += 1;
      return generation;
    },
    capture() {
      return generation;
    },
    current() {
      return generation;
    },
    isCurrent(token) {
      return Number.isInteger(token) && token === generation;
    }
  });
}
