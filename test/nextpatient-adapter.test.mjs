import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNextPatientHtml } from '../src/nextpatient-adapter.mjs';

test('neutralizes scheduler inline styles before detached HTML parsing', () => {
  let parsed = '';
  class CapturingDOMParser {
    parseFromString(value) {
      parsed = value;
      return { querySelectorAll: () => [] };
    }
  }

  const providers = parseNextPatientHtml(
    '<div class="nextpatient-provider-image-cell" style="background-image:url(https://nextpatient.co/provider.jpg)"></div>',
    { reasonId: '24375', DOMParserCtor: CapturingDOMParser }
  );

  assert.deepEqual(providers, []);
  assert.doesNotMatch(parsed, /\sstyle\s*=/i);
  assert.match(parsed, /data-nextpatient-inline-style=/);
  assert.match(parsed, /https:\/\/nextpatient\.co\/provider\.jpg/);
});
