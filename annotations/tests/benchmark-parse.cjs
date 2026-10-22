'use strict';

// Run separately from the unit suite; timings depend on the local machine.
// --max-ms=400 applies an optional median-time budget to every fixture.
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { parseAnnotations } = require('../src/core.cjs');

const maxArgument = process.argv.find(argument => argument.startsWith('--max-ms='));
const maxMs = maxArgument ? Number(maxArgument.slice('--max-ms='.length)) : Infinity;
assert.ok(maxMs > 0, '--max-ms must be a positive number');

function fixture(bytes, spacing) {
  const count = Math.floor(bytes / spacing);
  const paragraphs = [];
  const definitions = [];
  for (let index = 0; index < count; index++) {
    const definition = `[^bench-${index}]: note-${index}\n`;
    const annotation = `<u class="inkstone-underline">annotation-${index}</u>[^bench-${index}]`;
    paragraphs.push(annotation + ' '.repeat(spacing - annotation.length - definition.length - 2) + '\n\n');
    definitions.push(definition);
  }
  const content = paragraphs.join('') + definitions.join('');
  return { document: content + 'x'.repeat(bytes - content.length), count };
}

let exceeded = false;
for (const bytes of [100 * 1024, 1024 * 1024]) {
  for (const spacing of [2400, 600]) {
    const { document, count } = fixture(bytes, spacing);
    const verify = records => {
      assert.equal(Buffer.byteLength(document), bytes);
      assert.equal(records.length, count);
      for (let index = 0; index < records.length; index++) {
        assert.equal(records[index].text, `annotation-${index}`);
        assert.equal(records[index].note, `note-${index}`);
      }
    };
    verify(parseAnnotations(document));
    const timings = [];
    for (let sample = 0; sample < 5; sample++) {
      const start = performance.now();
      const records = parseAnnotations(document);
      timings.push(performance.now() - start);
      verify(records);
    }
    timings.sort((left, right) => left - right);
    const medianMs = timings[2];
    console.log(JSON.stringify({ bytes, annotations: count, spacing, medianMs: Number(medianMs.toFixed(2)), samples: 5 }));
    if (medianMs > maxMs) exceeded = true;
  }
}
assert.equal(exceeded, false, `parser exceeded the ${maxMs}ms median budget`);
