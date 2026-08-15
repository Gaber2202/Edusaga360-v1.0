#!/usr/bin/env node
/**
 * guard_frontend_query_tables.cjs
 *
 * Fails CI if any React Query hook (useQuery/useTenantQuery/useTableQuery)
 * references a table that is not in .github/production_tables.json unless
 * the query is explicitly disabled with enabled: false (or the 4th argument
 * of useTableQuery is false).
 */

const fs = require('fs');
const path = require('path');
const espree = require(path.resolve(__dirname, '../../frontend/node_modules/espree'));

const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND = path.join(REPO_ROOT, 'frontend', 'src');
const PROD_TABLES_FILE = path.join(REPO_ROOT, '.github', 'production_tables.json');

const prodTables = new Set(JSON.parse(fs.readFileSync(PROD_TABLES_FILE, 'utf8')));

const HOOKS = new Set(['useQuery', 'useTenantQuery', 'useTableQuery']);

function getCallExprName(node) {
  if (node.callee?.type === 'Identifier') return node.callee.name;
  if (node.callee?.type === 'MemberExpression' && node.callee.property?.type === 'Identifier') return node.callee.property.name;
  return null;
}

function walkAST(node, cb) {
  if (!node || typeof node !== 'object') return;
  cb(node);
  for (const key of Object.keys(node)) {
    if (key === 'range' || key === 'loc' || key === 'parent') continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach(child => walkAST(child, cb));
    else if (v && typeof v === 'object') walkAST(v, cb);
  }
}

function getSource(src, node) {
  return src.slice(node.range[0], node.range[1]);
}

function getTableFromQueryFn(src, queryFnNode) {
  if (!queryFnNode) return null;
  const fnSrc = src.slice(queryFnNode.range[0], queryFnNode.range[1]);
  const m1 = fnSrc.match(/tenantQuery\s*\(\s*['"`]([^'"`]+)['"`]/);
  if (m1) return m1[1];
  const m2 = fnSrc.match(/\.from\s*\(\s*['"`]([^'"`]+)['"`]/);
  if (m2) return m2[1];
  return null;
}

function isLiteralFalse(node) {
  return node && node.type === 'Literal' && node.value === false;
}

function findPropByName(properties, name) {
  return properties?.find(p => p.key && (p.key.name === name || p.key.value === name));
}

function isDisabled(node, name, src) {
  if (name === 'useTableQuery') {
    const enabledArg = node.arguments[3];
    return isLiteralFalse(enabledArg);
  }
  let optionsNode = null;
  if (name === 'useTenantQuery') {
    optionsNode = node.arguments[2];
  } else if (name === 'useQuery') {
    if (node.arguments[0]?.type === 'ObjectExpression') {
      optionsNode = node.arguments[0];
    } else if (node.arguments.length >= 2) {
      optionsNode = node.arguments[2];
    }
  }
  if (optionsNode?.type === 'ObjectExpression') {
    const enabled = findPropByName(optionsNode.properties, 'enabled');
    return isLiteralFalse(enabled?.value);
  }
  return false;
}

const violations = [];

function processFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = espree.parse(src, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
      range: true,
      loc: true,
    });
  } catch (e) {
    console.error(`Parse error in ${file}: ${e.message}`);
    process.exit(2);
  }

  walkAST(ast, (node) => {
    if (node.type !== 'CallExpression') return;
    const name = getCallExprName(node);
    if (!HOOKS.has(name)) return;

    let queryFnNode = null;
    let table = null;

    if (name === 'useTableQuery') {
      const tableArg = node.arguments[1];
      if (tableArg?.type === 'Literal' && typeof tableArg.value === 'string') {
        table = tableArg.value;
      }
    } else if (name === 'useTenantQuery') {
      queryFnNode = node.arguments[1];
      if (queryFnNode) table = getTableFromQueryFn(src, queryFnNode);
      // Also support useTenantQuery(queryKey, { queryFn: () => tenantQuery('x') }, options)
      if (!table && node.arguments[1]?.type === 'ObjectExpression') {
        const qfProp = findPropByName(node.arguments[1].properties, 'queryFn');
        if (qfProp) table = getTableFromQueryFn(src, qfProp.value);
      }
    } else if (name === 'useQuery') {
      if (node.arguments[0]?.type === 'ObjectExpression') {
        const options = node.arguments[0];
        const qfProp = findPropByName(options.properties, 'queryFn');
        if (qfProp) {
          queryFnNode = qfProp.value;
          table = getTableFromQueryFn(src, queryFnNode);
        }
      } else if (node.arguments.length >= 2) {
        queryFnNode = node.arguments[1];
        if (queryFnNode) table = getTableFromQueryFn(src, queryFnNode);
      }
    }

    if (!table || prodTables.has(table)) return;
    if (isDisabled(node, name, src)) return;

    const line = node.loc?.start?.line || '?';
    violations.push(`${path.relative(REPO_ROOT, file)}:${line}: ${name} references '${table}' which is not in production_tables.json and is not disabled`);
  });
}

function walkDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(full);
    else if (/\.jsx?$/.test(entry.name)) processFile(full);
  }
}

walkDir(FRONTEND);

if (violations.length) {
  console.error('ERROR: unguarded missing-table queries found:');
  for (const v of violations) console.error(`  ${v}`);
  console.error('\nEither use the correct production table name or disable the query with enabled: false.');
  process.exit(1);
}

console.log('All frontend query tables are in production_tables.json or explicitly disabled.');
process.exit(0);
