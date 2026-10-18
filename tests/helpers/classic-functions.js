'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// These renderer scripts share classic globals. Load just the functions under test.
function loadFunctions(context, relativePath, names) {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
  for (const name of names) {
    const start = source.indexOf(`function ${name}(`);
    assert(start >= 0, `${name} is missing`);
    const body = source.indexOf('{', start);
    let depth = 0;
    let end = body;
    for (; end < source.length; end += 1) {
      if (source[end] === '{') depth += 1;
      if (source[end] === '}' && --depth === 0) break;
    }
    assert(end < source.length, `${name} is incomplete`);
    const declarationStart = source.slice(Math.max(0, start - 6), start) === 'async ' ? start - 6 : start;
    vm.runInContext(source.slice(declarationStart, end + 1), context, { filename: relativePath });
  }
}

module.exports = { loadFunctions };
