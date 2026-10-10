'use strict';

/**
 * Read-only source inventory. Does not execute project modules, launch Electron,
 * contact services, modify dependencies, or rewrite the manual coverage matrix.
 *
 * Run: node --expose-internals scripts/qa/refresh-full-audit-inventory.js
 * Preview: add --output-dir /absolute/temporary/directory
 *
 * Node's bundled Acorn is used without installing a parser. If unavailable,
 * stop instead of silently claiming a complete inventory.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

let acorn;
try {
  acorn = require('internal/deps/acorn/acorn/dist/acorn');
} catch (_) {
  console.error('Run with Node --expose-internals. A bundled Acorn parser is required; nothing was written.');
  process.exit(2);
}

const root = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing value for ${name}`);
  return args[index + 1];
}
const knownOptions = new Set(['--output-dir', '--date']);
for (let i = 0; i < args.length; i += 2) {
  if (!knownOptions.has(args[i])) throw new Error(`Unknown option: ${args[i]}`);
}
const date = option('--date', '2026-10-09');
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date must use YYYY-MM-DD.');
const outputDir = path.resolve(option('--output-dir', path.join(root, 'docs')));
const jsonName = `QA_INVENTORY_${date}.json`;
const csvName = `QA_CALL_SITES_${date}.csv`;
const previousPath = path.join(root, 'docs', jsonName);
const previous = fs.existsSync(previousPath) ? JSON.parse(fs.readFileSync(previousPath, 'utf8')) : {};
const previousFiles = new Map((previous.files || []).map(file => [file.path, file]));
const git = (...gitArgs) => execFileSync('git', gitArgs, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const startedAt = new Date().toISOString();
const generationId = `${startedAt}-${process.pid}`;

// Git's ignore rules exclude local account files and private/native configuration.
// Explicit guards also protect those names if a future checkout tracks them.
const privateNames = new Set([
  '.cookie', '.qq-cookie', '.kugou-cookie', '.kugou-vip-evidence.json',
  '.qishui-cookie', '.qishui-token', '.qishui-oauth.json', '.qishui-qr-identity.json',
  '.qishui-qr-login.json', '.qishui-native-local.json', '.qq-native-device.json',
  '.spotify-token.json', 'spotify-token.json', '.spotify-credentials.json',
  'spotify-credentials.json', 'current-fx-autosave.json', 'cache-settings.json',
  'desktop-behavior.json', 'Local State', 'listen-sync-journal.json',
  'login-easter-egg.json', 'login-easter-egg-state.json', 'startup-state.json',
]);
const excludedDirectories = new Set([
  '.git', 'node_modules', '.local', 'Mineradio', 'Partitions', 'Network',
  'dist', 'out', 'release', 'releases', 'win-unpacked', 'updates', 'backups',
]);
function excluded(relative) {
  const parts = relative.split('/');
  const base = parts[parts.length - 1];
  return parts.some(part => excludedDirectories.has(part) || /^dist-/.test(part))
    || privateNames.has(base) || /^\.env(?:\.|$)/.test(base)
    || base === jsonName || base === csvName
    || /^QA_COVERAGE_MATRIX_\d{4}-\d{2}-\d{2}\.md$/.test(base);
}
const tracked = new Set(git('ls-files', '-z').split('\0').filter(Boolean));
const paths = [...new Set(git('ls-files', '--cached', '--others', '--exclude-standard', '-z')
  .split('\0').filter(Boolean))].map(value => value.replaceAll('\\', '/'))
  .filter(relative => !excluded(relative)).sort();
const textExtensions = new Set(['.js', '.json', '.md', '.html', '.css', '.ps1', '.bat', '.nsh', '.yml', '.yaml', '.txt', '.LICENCE']);
function group(relative) {
  // Captured DOM is evidence, not a second production page; QA repro scripts
  // remain parsed as tools, never inflated into the production denominator.
  if (relative.startsWith('docs/qa/')) return /\.(?:js|cjs)$/.test(relative) ? 'qa-dev-release-tools' : 'qa-evidence-artifacts';
  if (relative.startsWith('public/js/modules/')) return `frontend/${relative.split('/')[3]}`;
  if (relative.startsWith('public/vendor/') || /^qishui-auth-v6\/(react|react-dom|bdms|sdk-glue)\.js$/.test(relative)) return 'third-party';
  if (relative.startsWith('public/')) return 'frontend/assets-and-entry';
  if (relative.startsWith('desktop/')) return 'desktop-main-and-native';
  if (relative.startsWith('cuefield/')) return 'cuefield-transition-planning';
  if (relative.startsWith('qishui-audio-decryptor/')) return 'qishui-decryptor-provenance-unverified';
  if (relative.startsWith('qishui-auth-v6/')) return 'qishui-security-host-provenance-unverified';
  if (relative.startsWith('tests/')) return 'tests';
  if (relative.startsWith('scripts/')) return 'qa-dev-release-tools';
  if (relative.startsWith('build/') || relative.startsWith('.github/')) return 'packaging-ci';
  if (relative.startsWith('docs/') || relative.startsWith('.claude/') || relative.endsWith('.md') || relative === 'LICENSE') return 'docs-guidance';
  if (relative.endsWith('.js')) return 'backend-and-provider-adapters';
  return 'project-config-launchers';
}
const contents = new Map();
const generatedFileKeys = new Set([
  'path', 'group', 'tracked', 'bytes', 'lines', 'sha256', 'ast_parse_status',
  'direct_test_references', 'symbol_test_candidates', 'indirect_test_dependency_references',
  'frontend_load_order', 'provenance_status', 'snapshot_status_at_final_inventory_validation',
  'excluded_from_owned_source_audit', 'previous_evidence_matches_current_bytes', 'source_kind',
]);
const files = [];
for (const relative of paths) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) continue;
  const stat = fs.lstatSync(full);
  const old = previousFiles.get(relative) || {};
  const manual = Object.fromEntries(Object.entries(old).filter(([key]) => !generatedFileKeys.has(key)));
  if (stat.isSymbolicLink()) {
    files.push({ ...manual, path: relative, group: group(relative), tracked: tracked.has(relative), source_kind: 'symlink_not_followed', bytes: null, lines: null, sha256: null });
    continue;
  }
  if (!stat.isFile()) continue;
  const bytes = fs.readFileSync(full);
  const isText = textExtensions.has(path.extname(relative)) || ['LICENSE', '.gitignore', '.gitattributes'].includes(relative);
  const text = isText ? bytes.toString('utf8') : null;
  if (text !== null) contents.set(relative, text);
  const file = {
    ...manual, path: relative, group: group(relative), tracked: tracked.has(relative),
    bytes: bytes.length, lines: text === null ? null : text.split('\n').length - (text.endsWith('\n') ? 1 : 0),
    sha256: sha(bytes), source_kind: isText ? 'text' : 'binary',
    direct_test_references: [], symbol_test_candidates: [], indirect_test_dependency_references: [],
    previous_evidence_matches_current_bytes: old.sha256 ? old.sha256 === sha(bytes) : null,
  };
  if (file.group === 'third-party') {
    file.provenance_status = relative.startsWith('qishui-auth-v6/')
      ? 'distribution_authorization_unverified' : 'declared_vendor_verify_notice_and_license';
  }
  files.push(file);
}
const byPath = new Map(files.map(file => [file.path, file]));
const parseErrors = [];
const functions = [];
const callSites = [];
const dependencies = [];
const declarations = [];
const ipc = [];
const preloadApis = [];
const routes = [];
const eventBindings = [];
const testCases = [];
const hosts = new Map();
let anonymousFunctionCount = 0;
let allFunctionCount = 0;
let allCallCount = 0;

const literal = node => node && node.type === 'Literal' ? node.value : undefined;
function children(node) {
  const result = [];
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'range'].includes(key)) continue;
    if (Array.isArray(value)) {
      for (const child of value) if (child && typeof child.type === 'string') result.push(child);
    } else if (value && typeof value.type === 'string') result.push(value);
  }
  return result;
}
function name(node) {
  if (!node) return '<dynamic-expression>';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'ThisExpression') return 'this';
  if (node.type === 'ChainExpression') return name(node.expression);
  if (node.type === 'Literal') {
    return typeof node.value === 'string' && /^[A-Za-z_$][\w$]*$/.test(node.value) ? node.value : '<dynamic-expression>';
  }
  if (node.type === 'MemberExpression') {
    const object = name(node.object);
    const property = name(node.property);
    if (object === '<dynamic-expression>' || property === '<dynamic-expression>') return '<dynamic-expression>';
    return object + (node.computed ? `[${property}]` : `.${property}`);
  }
  return '<dynamic-expression>';
}
function scan(node, callback) {
  callback(node);
  for (const child of children(node)) scan(child, callback);
}
function callsWithin(node) {
  const result = new Set();
  if (node) scan(node, child => {
    if (child.type === 'CallExpression' || child.type === 'NewExpression') result.add(name(child.callee));
  });
  return [...result].sort();
}
function ipcWithin(node) {
  const result = new Set();
  if (node) scan(node, child => {
    if (child.type === 'CallExpression' && name(child.callee).startsWith('ipcRenderer.') && typeof literal(child.arguments[0]) === 'string') result.add(literal(child.arguments[0]));
  });
  return [...result].sort();
}
function patternNames(node, result = []) {
  if (!node) return result;
  if (node.type === 'Identifier') result.push(node.name);
  else if (node.type === 'ObjectPattern') for (const property of node.properties) patternNames(property.value || property.argument, result);
  else if (node.type === 'ArrayPattern') for (const element of node.elements) patternNames(element, result);
  else if (node.type === 'AssignmentPattern') patternNames(node.left, result);
  else if (node.type === 'RestElement') patternNames(node.argument, result);
  return result;
}
function parse(relative, source, recordError = true) {
  for (const sourceType of ['script', 'module']) {
    try {
      return acorn.parse(source, { ecmaVersion: 'latest', sourceType, locations: true, allowHashBang: true, allowReturnOutsideFunction: true });
    } catch (error) {
      if (sourceType === 'module' && recordError) parseErrors.push({ file: relative, line: error.loc?.line || null, error: 'JavaScript inventory parsing failed; inspect this file at the recorded line.' });
    }
  }
  return null;
}
function resolveDependency(relative, specifier) {
  if (!specifier.startsWith('.')) return null;
  const candidate = path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier));
  for (const value of [candidate, `${candidate}.js`, `${candidate}.json`, `${candidate}/index.js`]) if (byPath.has(value)) return value;
  return candidate;
}
const functionTypes = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
function inspectAst(ast, relative, baseLine = 0, offsetTag = 'js') {
  const isTest = relative.startsWith('tests/');
  function visit(node, parent, activeFunction = null) {
    const line = node.loc.start.line + baseLine;
    const endLine = node.loc.end.line + baseLine;
    let functionKey = activeFunction;
    if (functionTypes.has(node.type)) {
      allFunctionCount += 1;
      let declaredName = node.id?.name;
      if (!declaredName && parent?.type === 'VariableDeclarator') declaredName = name(parent.id);
      if (!declaredName && ['Property', 'MethodDefinition'].includes(parent?.type)) declaredName = name(parent.key);
      if (!declaredName && parent?.type === 'AssignmentExpression') declaredName = name(parent.left);
      functionKey = `${relative}:${offsetTag}:${line}:${node.start}`;
      if (!isTest && declaredName && declaredName !== '<dynamic-expression>') {
        functions.push({ key: functionKey, file: relative, name: declaredName, line, end_line: endLine, async: !!node.async });
      } else if (!isTest) anonymousFunctionCount += 1;
    }
    if (!isTest && node.type === 'VariableDeclaration' && !activeFunction) {
      for (const declarator of node.declarations) for (const declaredName of patternNames(declarator.id)) declarations.push({ file: relative, line, name: declaredName, kind: node.kind });
    }
    if (node.type === 'CallExpression' || node.type === 'NewExpression') {
      allCallCount += 1;
      const callee = name(node.callee);
      if (!isTest) callSites.push({ file: relative, line, callee, caller_key: activeFunction });
      if (callee === 'require' && typeof literal(node.arguments[0]) === 'string') {
        const specifier = literal(node.arguments[0]);
        dependencies.push({ file: relative, line, specifier, kind: 'require', resolved_path: resolveDependency(relative, specifier) });
      }
      if (!isTest && (/^ipcMain\.(handle|on|once)$/.test(callee) || /^ipcRenderer\.(invoke|send|sendSync|on|once)$/.test(callee) || /\.webContents\.send$/.test(callee))) {
        ipc.push({ file: relative, line, end_line: endLine, side: callee.startsWith('ipcMain') ? 'main' : callee.startsWith('ipcRenderer') ? 'preload-or-renderer' : 'main-outbound', operation: callee.split('.').at(-1), channel: typeof literal(node.arguments[0]) === 'string' ? literal(node.arguments[0]) : null, dynamic_channel: typeof literal(node.arguments[0]) === 'string' ? null : name(node.arguments[0]), handler_calls: callsWithin(node.arguments[1]) });
      }
      if (!isTest && callee === 'contextBridge.exposeInMainWorld' && node.arguments[1]?.type === 'ObjectExpression') {
        for (const property of node.arguments[1].properties) preloadApis.push({ file: relative, line: property.loc.start.line + baseLine, namespace: literal(node.arguments[0]), method: name(property.key), ipc_channels: ipcWithin(property.value), calls: callsWithin(property.value) });
      }
      if (!isTest && /\.(addEventListener|on|once)$/.test(callee) && typeof literal(node.arguments[0]) === 'string') {
        eventBindings.push({ file: relative, line, receiver: name(node.callee.object), event: literal(node.arguments[0]), handler: name(node.arguments[1]), handler_calls: callsWithin(node.arguments[1]) });
      }
      if (isTest && /^(test|it|describe)(\.|$)/.test(callee) && typeof literal(node.arguments[0]) === 'string') {
        testCases.push({ file: relative, line, label: literal(node.arguments[0]), kind: callee });
      }
    }
    if (node.type === 'ImportDeclaration') dependencies.push({ file: relative, line, specifier: node.source.value, kind: 'import', resolved_path: resolveDependency(relative, node.source.value) });
    if (!isTest && node.type === 'Literal' && typeof node.value === 'string' && /^https?:\/\//.test(node.value)) {
      try {
        const host = new URL(node.value).hostname;
        if (!hosts.has(host)) hosts.set(host, new Map());
        hosts.get(host).set(`${relative}:${line}`, { file: relative, line });
      } catch (_) { /* Static strings that are not complete URLs remain unclassified. */ }
    }
    if (relative === 'server.js' && node.type === 'IfStatement') {
      const routePaths = new Set();
      scan(node.test, child => {
        if (child.type !== 'BinaryExpression' || !['===', '=='].includes(child.operator)) return;
        if (child.left.type === 'Identifier' && child.left.name === 'pn' && typeof literal(child.right) === 'string') routePaths.add(literal(child.right));
        if (child.right.type === 'Identifier' && child.right.name === 'pn' && typeof literal(child.left) === 'string') routePaths.add(literal(child.left));
      });
      if (routePaths.size) {
        const methods = new Set();
        scan(node.consequent, child => {
          if (child.type === 'BinaryExpression' && ['===', '==', '!==', '!='].includes(child.operator) && name(child.left) === 'req.method' && typeof literal(child.right) === 'string') methods.add(literal(child.right));
        });
        for (const routePath of routePaths) routes.push({ file: relative, line, end_line: endLine, path: routePath, explicit_method_tokens: [...methods].sort(), method_contract: methods.size ? 'see_guard_and_branches' : 'no_explicit_method_guard_in_branch', handler_calls: callsWithin(node.consequent).filter(value => !value.startsWith('console.')), direct_tests: [], frontend_call_sites: [], status: 'inventoried_not_security_or_behavior_verified' });
      }
    }
    for (const child of children(node)) visit(child, node, functionKey);
  }
  visit(ast, null);
}
const jsFiles = files.filter(file => file.path.endsWith('.js') && file.group !== 'third-party' && contents.has(file.path));
for (const file of jsFiles) {
  const ast = parse(file.path, contents.get(file.path));
  file.ast_parse_status = ast ? 'parsed_for_inventory_only' : 'failed_inventory_parse';
  if (ast) inspectAst(ast, file.path);
}

const htmlScripts = [];
const htmlEvents = [];
const htmlControls = [];
const htmlDialogs = [];
for (const file of files.filter(file => file.path.endsWith('.html') && !['third-party', 'qa-evidence-artifacts'].includes(file.group) && contents.has(file.path))) {
  const source = contents.get(file.path);
  let order = 0;
  for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const src = match[1].match(/\bsrc\s*=\s*['"]([^'"]+)['"]/i)?.[1] || null;
    const line = source.slice(0, match.index).split('\n').length;
    htmlScripts.push({ file: file.path, order: ++order, line, src, inline: !src, resolved_path: src ? path.posix.normalize(path.posix.join(path.posix.dirname(file.path), src)) : null });
    if (!src && match[2].trim()) {
      const ast = parse(`${file.path}#inline-script-${order}`, match[2]);
      const contentLine = source.slice(0, match.index + match[0].indexOf('>') + 1).split('\n').length;
      if (ast) inspectAst(ast, file.path, contentLine - 1, `inline-${order}`);
    }
  }
  for (const match of source.matchAll(/<([a-zA-Z][\w:-]*)\b([^>]*?)>/g)) {
    const tag = match[1].toLowerCase();
    const attrs = {};
    const line = source.slice(0, match.index).split('\n').length;
    for (const attribute of match[2].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[attribute[1].toLowerCase()] = attribute[2] ?? attribute[3] ?? attribute[4];
    for (const [event, handler] of Object.entries(attrs)) {
      if (!/^on\w+/.test(event)) continue;
      const ast = parse(`${file.path}#${event}@${line}`, handler.replaceAll('&amp;', '&').replaceAll('&quot;', '"'));
      htmlEvents.push({ file: file.path, line, tag, id: attrs.id || null, event, call_names: ast ? callsWithin(ast) : [], candidate_definitions: [] });
    }
    if (['button', 'input', 'select', 'textarea', 'a'].includes(tag) || attrs.role || attrs.tabindex) htmlControls.push({ file: file.path, line, tag, id: attrs.id || null, role: attrs.role || null, aria_label: attrs['aria-label'] || null, aria_labelledby: attrs['aria-labelledby'] || null, tabindex: attrs.tabindex ?? null, input_type: attrs.type || null, inline_events: Object.keys(attrs).filter(key => /^on/.test(key)), disabled: /\bdisabled\b/.test(match[2]), hidden: /\bhidden\b/.test(match[2]), audit_status: 'inventory_only_label_visibility_focus_unverified' });
    if (attrs.role === 'dialog' || attrs['aria-modal'] === 'true' || (attrs.id && /modal|panel|popover/.test(attrs.id))) htmlDialogs.push({ file: file.path, line, tag, id: attrs.id || null, role: attrs.role || null, aria_modal: attrs['aria-modal'] || null, aria_labelledby: attrs['aria-labelledby'] || null, aria_hidden: attrs['aria-hidden'] || null, audit_status: 'focus_escape_return_tab_trap_unverified' });
  }
}

const functionIds = new Map();
const definitionsByName = new Map();
const definitionsByFile = new Map();
const indexedFunctions = functions.map((definition, index) => {
  const id = index + 1;
  functionIds.set(definition.key, id);
  const value = { id, file: definition.file, name: definition.name, line: definition.line, end_line: definition.end_line, async: definition.async };
  if (!definitionsByName.has(value.name)) definitionsByName.set(value.name, []);
  definitionsByName.get(value.name).push(value);
  if (!definitionsByFile.has(value.file)) definitionsByFile.set(value.file, []);
  definitionsByFile.get(value.file).push(value);
  return value;
});
for (const event of htmlEvents) event.candidate_definitions = event.call_names.flatMap(value => definitionsByName.get(value) || []).map(({ id, file, line }) => ({ id, file, line }));
const builtinInlineNames = new Set(['Number', 'String', 'Boolean', 'setTimeout', 'requestAnimationFrame', 'confirm', 'alert', '<dynamic-expression>']);
const unresolvedInline = htmlEvents.flatMap(event => event.call_names.filter(value => !definitionsByName.has(value) && !value.includes('.') && !builtinInlineNames.has(value)).map(value => ({ file: event.file, line: event.line, name: value, status: 'candidate_symbol_not_found_not_confirmed_defect' })));
const duplicates = [...definitionsByName].filter(([, values]) => values.filter(value => value.file.startsWith('public/')).length > 1).map(([declaredName, values]) => ({ name: declaredName, locations: values.filter(value => value.file.startsWith('public/')).map(({ file, line }) => ({ file, line })), status: 'candidate_only_scopes_not_resolved' }));

const loader = contents.get('public/js/index-loader.js') || '';
const loadOrder = [...loader.matchAll(/^\s*'([^']+)',?\s*$/gm)].map((match, index) => ({ order: index + 1, path: `public/${match[1]}`, loader_line: loader.slice(0, match.index).split('\n').length, exists: byPath.has(`public/${match[1]}`) }));
for (const entry of loadOrder) if (byPath.has(entry.path)) byPath.get(entry.path).frontend_load_order = entry.order;
const smokeRunner = contents.get('scripts/run-electron-smoke.js') || '';
const tests = files.filter(file => file.group === 'tests' && /\.test\.(js|ps1)$|smoke\.js$/.test(file.path)).map(file => ({ path: file.path, kind: file.path.endsWith('.test.js') ? 'node-regression' : file.path.endsWith('.ps1') ? 'windows-powershell' : 'electron-or-live-smoke', included_in_npm_test: file.path.endsWith('.test.js') && !file.path.substring(6).includes('/'), included_in_npm_test_electron: smokeRunner.includes(path.basename(file.path)), execution_status: 'not_run_by_inventory_worker', direct_sources: [], symbol_candidate_sources: [], transitive_dependency_sources: [], cases: testCases.filter(test => test.file === file.path) }));
const ownedSources = files.filter(file => !['tests', 'docs-guidance', 'third-party'].includes(file.group) && textExtensions.has(path.extname(file.path)));
const dependencyByFile = new Map();
for (const dependency of dependencies) {
  if (!dependencyByFile.has(dependency.file)) dependencyByFile.set(dependency.file, []);
  dependencyByFile.get(dependency.file).push(dependency);
}
const uniqueSymbolsByFile = new Map();
for (const [relative, values] of definitionsByFile) uniqueSymbolsByFile.set(relative, values.filter(value => value.name.length >= 8 && definitionsByName.get(value.name).length === 1 && /^[A-Za-z_$][\w$]*$/.test(value.name)).map(value => value.name));
for (const test of tests) {
  const source = contents.get(test.path) || '';
  const imported = new Set((dependencyByFile.get(test.path) || []).map(dependency => dependency.resolved_path));
  const words = new Set(source.match(/[A-Za-z_$][\w$]*/g) || []);
  for (const file of ownedSources) {
    const base = path.basename(file.path);
    const direct = imported.has(file.path) || source.includes(file.path) || (source.includes(base) && (base.length >= 8 || ['server.js', 'desktop/main.js', 'public/index.html'].includes(file.path)));
    if (direct) {
      test.direct_sources.push(file.path);
      file.direct_test_references.push(test.path);
    } else if ((uniqueSymbolsByFile.get(file.path) || []).some(value => words.has(value))) {
      test.symbol_candidate_sources.push(file.path);
      file.symbol_test_candidates.push(test.path);
    }
  }
  for (const route of routes) if (source.includes(route.path)) route.direct_tests.push(test.path);
  const seen = new Set();
  const pending = [...test.direct_sources];
  while (pending.length) {
    for (const dependency of dependencyByFile.get(pending.pop()) || []) {
      if (dependency.resolved_path && byPath.has(dependency.resolved_path) && !seen.has(dependency.resolved_path)) {
        seen.add(dependency.resolved_path);
        pending.push(dependency.resolved_path);
      }
    }
  }
  test.transitive_dependency_sources = [...seen].filter(relative => !test.direct_sources.includes(relative)).sort();
  for (const relative of test.transitive_dependency_sources) byPath.get(relative).indirect_test_dependency_references.push(test.path);
}
for (const file of ownedSources.filter(file => file.group.startsWith('frontend/'))) {
  const sourceLines = (contents.get(file.path) || '').split('\n');
  for (const route of routes) sourceLines.forEach((sourceLine, index) => {
    if (sourceLine.includes(route.path)) route.frontend_call_sites.push({ file: file.path, line: index + 1, literal_reference_only: true });
  });
}
const uniqueChannels = [...new Set(ipc.map(value => value.channel).filter(Boolean))].sort().map(channel => ({ channel, handlers: ipc.filter(value => value.channel === channel && value.side === 'main'), callers: ipc.filter(value => value.channel === channel && value.side !== 'main'), test_references: tests.filter(test => (contents.get(test.path) || '').includes(channel)).map(test => test.path), review_status: 'not_reviewed_in_inventory' }));

const groups = {};
for (const file of files) {
  groups[file.group] ||= { files: 0, lines: 0, bytes: 0, paths: [] };
  groups[file.group].files += 1;
  groups[file.group].lines += file.lines || 0;
  groups[file.group].bytes += file.bytes || 0;
  groups[file.group].paths.push(file.path);
}
const changedDuringRun = [];
for (const file of files) {
  if (file.source_kind === 'symlink_not_followed') continue;
  const full = path.join(root, file.path);
  if (!fs.existsSync(full)) {
    file.snapshot_status_at_final_inventory_validation = 'missing_since_snapshot';
    changedDuringRun.push({ file: file.path, snapshot_sha256: file.sha256, current_sha256: null });
    continue;
  }
  const current = sha(fs.readFileSync(full));
  file.snapshot_status_at_final_inventory_validation = current === file.sha256 ? 'matches_snapshot' : 'changed_during_inventory_indexes_need_refresh';
  if (current !== file.sha256) changedDuringRun.push({ file: file.path, snapshot_sha256: file.sha256, current_sha256: current });
}
const priorChanges = files.filter(file => file.previous_evidence_matches_current_bytes === false).map(file => ({ file: file.path, previous_sha256: previousFiles.get(file.path).sha256, current_sha256: file.sha256 }));
const removed = (previous.files || []).filter(file => !byPath.has(file.path)).map(({ path: relative, sha256 }) => ({ file: relative, previous_sha256: sha256, notice: excluded(relative) ? 'now_excluded_by_source_and_privacy_policy' : 'no_longer_present_in_source_listing' }));
const result = {
  // Keep manual sections such as user_function_paths and review_assignments.
  // Root generated keys are replaced below; manual matrix Markdown is never opened for writing.
  ...previous,
  schema_version: 2, generation_id: generationId,
  generated_at: startedAt, generation_finished_at: new Date().toISOString(),
  repository_root: root, head: git('rev-parse', 'HEAD').trim(), branch: git('branch', '--show-current').trim(),
  snapshot_notice: 'Source inventory only. Hashes and AST use the same captured bytes. Manual review assignments/status are preserved. A changed hash invalidates old evidence without silently changing a reviewer-authored status.',
  status_at_start: git('status', '--short'),
  collection: {
    parser: `Node bundled Acorn ${acorn.version}`, installations_performed: false,
    collector: 'scripts/qa/refresh-full-audit-inventory.js',
    collector_sha256: byPath.get('scripts/qa/refresh-full-audit-inventory.js')?.sha256 || null,
    source_listing: 'git ls-files --cached --others --exclude-standard; ignored/private/generated files and inventory outputs excluded',
    excluded_dirs: [...excludedDirectories].sort(), private_file_contents_read: false,
    third_party_js_not_ast_parsed: files.filter(file => file.group === 'third-party' && file.path.endsWith('.js')).map(file => file.path),
    limitations: [
      'Call graph uses lexical-name candidates, not full scope/type/dynamic resolution.',
      'Path/basename/import and unique-symbol test references are candidates, not branch/assertion coverage.',
      'HTML scanning inventories attributes; dynamic DOM, actual focus, contrast, layout and screen readers remain unverified.',
      'Third-party minified resources are file/hash/provenance entries only; their bodies are not copied or parsed.',
      'No app, account, network, Electron, Windows or security probe is run by this script.',
      'Generated docs/qa HTML snapshots are file/hash evidence only, not re-parsed as production DOM/scripts; QA reproductions are tools.',
      'The manual coverage matrix and manual feature/review sections are preserved, so their old counts/line numbers remain historical until reviewed.',
    ],
  },
  default_file_status: previous.default_file_status || { inventory: 'inventoried', static_review: 'not_reviewed_in_this_inventory', runtime: 'not_run_in_this_inventory' },
  summary: {
    file_count: files.length, all_non_vendor_js_parsed_for_inventory: jsFiles.length,
    runtime_js_files_parsed: jsFiles.filter(file => !['tests', 'qa-dev-release-tools'].includes(file.group)).length,
    inventoried_owned_production_js: jsFiles.filter(file => !['tests', 'qa-dev-release-tools'].includes(file.group)).length,
    parse_error_count: parseErrors.length, named_and_anonymous_functions: allFunctionCount, call_sites: allCallCount,
    indexed_named_production_or_tool_functions: indexedFunctions.length, anonymous_non_test_functions: anonymousFunctionCount,
    indexed_call_sites_in_csv: callSites.length, http_route_branch_paths: routes.length,
    http_api_exact_paths: routes.filter(route => route.path.startsWith('/api/')).length,
    ipc_records: ipc.length, unique_ipc_channels: uniqueChannels.length, preload_methods: preloadApis.length,
    frontend_load_paths: loadOrder.length, inline_html_handlers: htmlEvents.length, html_controls: htmlControls.length,
    event_bindings: eventBindings.length, tests: tests.length,
    npm_test_registered: tests.filter(test => test.included_in_npm_test).length,
    npm_test_electron_registered: tests.filter(test => test.included_in_npm_test_electron).length,
    source_files_without_direct_test_reference: ownedSources.filter(file => !file.direct_test_references.length).length,
    third_party_file_count: files.filter(file => file.group === 'third-party').length,
    third_party_js_files_excluded_from_owned_ast: files.filter(file => file.group === 'third-party' && file.path.endsWith('.js')).length,
    user_feature_groups: (previous.user_function_paths || []).length,
  },
  groups, files, frontend_load_order: loadOrder, html_scripts: htmlScripts, http_routes: routes,
  ipc_channels: uniqueChannels, preload_apis: preloadApis, inline_html_events: htmlEvents,
  html_controls: htmlControls, html_dialog_panel_candidates: htmlDialogs, event_bindings: eventBindings,
  dependencies, top_level_declarations: declarations, functions: indexedFunctions,
  call_graph_file: csvName,
  call_graph_notice: 'CSV contains all non-vendor/non-test JS call sites plus host inline-script sites, no source bodies. Numeric definition ids are generation-local and must not be treated as stable issue ids.',
  network_hosts: [...hosts].sort(([a], [b]) => a.localeCompare(b)).map(([host, references]) => ({ host, references: [...references.values()], credential_or_query_values_omitted: true })),
  tests, parse_errors: parseErrors, frontend_duplicate_definition_candidates: duplicates,
  unresolved_inline_symbol_candidates: unresolvedInline,
  final_inventory_validation: {
    at: new Date().toISOString(), files_unique: byPath.size === files.length,
    all_loader_paths_exist: loadOrder.every(entry => entry.exists), call_site_csv_rows: callSites.length,
    changed_files_since_snapshot: changedDuringRun, changed_files_since_previous_inventory: priorChanges,
    removed_or_newly_excluded_paths: removed,
    new_paths_since_previous_inventory: files.filter(file => !previousFiles.has(file.path)).map(file => file.path),
    manual_matrix_written: false,
    manual_review_sections_preserved: ['user_function_paths', 'review_assignments', 'default_file_status'],
    notice: 'Inventory integrity only. Refresh after source freeze; changed hashes invalidate old review/test evidence even though manual states are preserved.',
  },
};
// Older schemas briefly stored raw/full call data. Do not retain it on refresh.
for (const key of ['call_graph', 'network_urls']) delete result[key];
function csvField(value) {
  const string = String(value ?? '');
  return /[",\r\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}
const csvLines = ['file,line,callee,caller_definition_id,candidate_definition_ids'];
for (const call of callSites) {
  const candidates = definitionsByName.get(call.callee) || definitionsByName.get(call.callee.split('.').at(-1)) || [];
  csvLines.push([call.file, call.line, call.callee, functionIds.get(call.caller_key) || '', candidates.map(value => value.id).join(';')].map(csvField).join(','));
}
fs.mkdirSync(outputDir, { recursive: true });
const csvText = `${csvLines.join('\n')}\n`;
result.call_graph_sha256 = sha(csvText);
const csvTemporary = path.join(outputDir, `${csvName}.${process.pid}.tmp`);
const jsonTemporary = path.join(outputDir, `${jsonName}.${process.pid}.tmp`);
fs.writeFileSync(csvTemporary, csvText, { flag: 'wx' });
fs.writeFileSync(jsonTemporary, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
// Commit the JSON last. Its CSV hash detects interruption between the two renames.
fs.renameSync(csvTemporary, path.join(outputDir, csvName));
fs.renameSync(jsonTemporary, path.join(outputDir, jsonName));
console.log(JSON.stringify({ json: path.join(outputDir, jsonName), csv: path.join(outputDir, csvName), summary: result.summary, changed_during_run: changedDuringRun.length, changed_since_previous: priorChanges.length, manual_matrix_written: false, manual_sections_preserved: true }, null, 2));
if (parseErrors.length || changedDuringRun.length || !loadOrder.length || loadOrder.some(entry => !entry.exists)) {
  console.error('Inventory is incomplete or changed during collection. Outputs record the gap; rerun against stable source after resolving it.');
  process.exitCode = 1;
}
