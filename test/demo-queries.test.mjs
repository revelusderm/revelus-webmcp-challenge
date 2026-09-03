import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApiHandlers } from '../src/api-core.mjs';
import { loadCuratedRecords } from '../src/curated-loader.mjs';

const load = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const [corpus, searchIndex, registry, fixture, curatedRecords] = await Promise.all([
  load('../data/corpus.json'),
  load('../data/search-index.json'),
  load('../data/patient-language-concepts.json'),
  load('../data/demo-queries.json'),
  loadCuratedRecords()
]);
const api = createApiHandlers({ corpus, searchIndex, curatedRecords, registry });

test('the public bundle contains exactly the documented synthetic sample', () => {
  assert.equal(corpus.records.length, 7);
  assert.equal(fixture.questions.length, 10);
  assert.ok(corpus.records.every(record => record.documentTitleSource === 'synthetic_demo'));
});

for (const item of fixture.questions) {
  test(`demo query ${item.id}: ${item.question}`, () => {
    const result = api.search({ query: item.question, limit: 5 });
    if (item.expected.mode === 'refused') {
      assert.equal(result.status, 'refused');
      assert.deepEqual(result.results, []);
      return;
    }
    assert.equal(result.status, 'found');
    assert.equal(result.results[0]?.sourceUrl, item.expected.target);
    assert.equal(result.results.length, 1, 'The narrow synthetic corpus should not add unrelated result cards');
    for (const card of result.results) {
      assert.equal(card.responseGuidance.patientConclusion, 'not_determined');
      assert.ok(card.responseGuidance.practiceStatement.length > 10);
      assert.ok(card.responseGuidance.clinicalBoundary.length > 20);
    }
    if (item.id === 1) {
      assert.equal(result.results[0].responseGuidance.practiceStatement, 'Revelus evaluates and treats eczema.');
    }
  });
}
