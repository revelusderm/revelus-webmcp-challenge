import test from 'node:test';
import assert from 'node:assert/strict';
import { registerChallengeTools } from '../src/challenge-tools.mjs';

test('registers the four page-local WebMCP tools', async () => {
  const definitions = [];
  const modelContext = { registerTool(definition) { definitions.push(definition); } };
  const knowledge = { search: () => ({}), getAnswer: () => ({}) };
  const session = { resolveVisitPath: () => ({}), getFixtureAvailability: () => ({}) };
  await registerChallengeTools({ modelContext, knowledge, session });
  assert.deepEqual(definitions.map(tool => tool.name), [
    'revelus.search_information',
    'revelus.get_answer',
    'revelus.resolve_visit_path',
    'revelus.get_availability'
  ]);
  assert.ok(definitions.every(tool => typeof tool.execute === 'function'));
});
