'use strict';

// Run separately from the unit suite; timings depend on the local machine.
// --max-ms=400 applies an optional median-time budget to every fixture.
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { parseAnnotations, validateSelection, buildAnnotationPlan, applyChanges } = require('../src/core.cjs');

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

// Exercise the same validation used before showing the selection toolbar, as
// well as the write plan. Parser timings alone do not cover either path.
const block = '<u class="inkstone-underline">annotation</u>' + 'x'.repeat(550) + '\n\n';
const dense = 'target\n\n' + block.repeat(Math.floor(1024 * 1024 / block.length));
const plain = 'target\n\n' + 'x'.repeat(dense.length - 8);
const softNewline = 'target\n\n' + block.replace(/\n\n$/, '\n').repeat(1759);
const longParagraph = 'target\n\n' + block.replace(/\n\n$/, '').repeat(1759);
for (const [name, document, count] of [['plain', plain, 0], ['dense', dense, 1759], ['soft-newline', softNewline, 1759], ['single-long-paragraph', longParagraph, 1759]]) {
  assert.equal(parseAnnotations(document).length, count);
  for (const [position, from, text] of [['start', 0, 'target'], ['end', document.length - 8, 'xxxxxx']]) {
    const to = from + text.length;
    assert.equal(document.slice(from, to), text);
    for (const operation of ['validateSelection', 'buildAnnotationPlan']) {
      const timings = [];
      for (let sample = 0; sample < 3; sample++) {
        const start = performance.now();
        const result = operation === 'validateSelection'
          ? validateSelection({ document, from, to })
          : buildAnnotationPlan({ document, from, to, kind: 'underline' });
        timings.push(performance.now() - start);
        if (operation === 'validateSelection') assert.equal(result, text);
        else assert.equal(applyChanges(document, result.changes), document.slice(0, from) + `<u class="inkstone-underline">${text}</u>` + document.slice(to));
      }
      const sorted = [...timings].sort((left, right) => left - right);
      const medianMs = sorted[1];
      console.log(JSON.stringify({ operation, fixture: name, position, bytes: Buffer.byteLength(document), annotations: count, medianMs: Number(medianMs.toFixed(2)), timingsMs: timings.map(value => Number(value.toFixed(2))), samples: 3 }));
      assert.ok(medianMs <= maxMs, `${name} ${position} ${operation} exceeded the ${maxMs}ms median budget`);
    }
  }
}
assert.equal(exceeded, false, `annotation paths exceeded the ${maxMs}ms median budget`);
