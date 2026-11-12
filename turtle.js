// Turtle: a tiny Logo-style drawing language.
// run(source) -> the line segments the turtle draws. Pure: no DOM, so it runs in Node and the browser.
'use strict';

const ARITY = new Map(Object.entries({ forward: 1, back: 1, left: 1, right: 1, penup: 0, pendown: 0, home: 0 }));
const ALIAS = new Map(Object.entries({ fd: 'forward', bk: 'back', lt: 'left', rt: 'right', pu: 'penup', pd: 'pendown' }));
const RESERVED = new Set([...ARITY.keys(), ...ALIAS.keys(), 'repeat', 'if', 'to', 'end', 'color']);

// Programs come from a text box and can loop forever; stop them instead of freezing the tab.
const MAX_STEPS = 100000;
const MAX_DEPTH = 500;

class TurtleError extends Error {
  constructor(message, line) {
    super(`Line ${line}: ${message}`);
    this.line = line;
  }
}

function tokenize(source) {
  const tokens = [];
  const pattern = /(\d+\.?\d*|\.\d+)|:([A-Za-z_]\w*)|(#[0-9A-Fa-f]{3,8}\b)|([A-Za-z_]\w*)|([\[\]()+\-*\/<>=])|(\S)/g;
  source.split('\n').forEach((text, i) => {
    const line = i + 1;
    for (const m of text.replace(/;.*/, '').matchAll(pattern)) {
      if (m[6]) throw new TurtleError(`unexpected character "${m[6]}"`, line);
      if (m[1]) tokens.push({ type: 'num', value: parseFloat(m[1]), line });
      else if (m[2]) tokens.push({ type: 'var', value: m[2].toLowerCase(), line });
      else if (m[3]) tokens.push({ type: 'word', value: m[3], line });
      else if (m[4]) tokens.push({ type: 'word', value: m[4].toLowerCase(), line });
      else tokens.push({ type: m[5], line });
    }
  });
  return tokens;
}

// Recursive-descent parser. Returns { body, procs }.
function parse(tokens) {
  // A procedure can be called before (or inside) its own definition, and a call has no
  // brackets, so we need every procedure's parameter count before parsing any call.
  const procs = new Map();
  tokens.forEach((t, i) => {
    if (t.type !== 'word' || t.value !== 'to') return;
    const name = tokens[i + 1];
    if (!name || name.type !== 'word') throw new TurtleError('expected a name after "to"', t.line);
    if (RESERVED.has(name.value)) throw new TurtleError(`"${name.value}" is a built-in word and can't be redefined`, name.line);
    if (procs.has(name.value)) throw new TurtleError(`"${name.value}" is already defined`, name.line);
    const params = [];
    for (let j = i + 2; tokens[j] && tokens[j].type === 'var'; j++) params.push(tokens[j].value);
    procs.set(name.value, { params, body: [] });
  });

  let pos = 0;
  const peek = () => tokens[pos];
  const isType = (type) => pos < tokens.length && tokens[pos].type === type;
  const show = (t) => t.value ?? t.type;
  const next = (expected) => {
    if (pos >= tokens.length) {
      const lastLine = tokens.length ? tokens[tokens.length - 1].line : 1;
      throw new TurtleError(`program ended early, expected ${expected}`, lastLine);
    }
    return tokens[pos++];
  };
  const expect = (type) => {
    const t = next(`"${type}"`);
    if (t.type !== type) throw new TurtleError(`expected "${type}", found "${show(t)}"`, t.line);
  };

  function block() {
    expect('[');
    const body = [];
    while (!isType(']')) body.push(statement());
    pos++;
    return body;
  }

  function statement() {
    const t = next('a command');
    if (t.type !== 'word') throw new TurtleError(`expected a command, found "${show(t)}"`, t.line);
    const name = ALIAS.get(t.value) ?? t.value;
    const line = t.line;

    if (name === 'repeat' || name === 'if') return { op: name, line, arg: expr(), body: block() };
    if (name === 'to') {
      const proc = procs.get(next('a name').value);
      pos += proc.params.length;
      while (!(isType('word') && peek().value === 'end')) proc.body.push(statement());
      pos++;
      return { op: 'to', line };
    }
    if (name === 'color') {
      const c = next('a colour');
      if (c.type !== 'word') throw new TurtleError(`expected a colour name or #hex, found "${show(c)}"`, c.line);
      return { op: 'color', line, value: c.value };
    }

    const proc = procs.get(name);
    const count = ARITY.get(name) ?? proc?.params.length;
    if (count === undefined) throw new TurtleError(`unknown command "${name}"`, line);
    const args = [];
    for (let i = 0; i < count; i++) args.push(expr());
    return { op: proc ? 'call' : name, name, line, args };
  }

  // Precedence, lowest first: comparison, + -, * /, unary minus.
  function expr() {
    const left = sum();
    if (isType('<') || isType('>') || isType('=')) {
      const t = tokens[pos++];
      return { op: t.type, left, right: sum(), line: t.line };
    }
    return left;
  }
  function sum() {
    let left = product();
    while (isType('+') || isType('-')) {
      const t = tokens[pos++];
      left = { op: t.type, left, right: product(), line: t.line };
    }
    return left;
  }
  function product() {
    let left = unary();
    while (isType('*') || isType('/')) {
      const t = tokens[pos++];
      left = { op: t.type, left, right: unary(), line: t.line };
    }
    return left;
  }
  function unary() {
    const t = next('a value');
    if (t.type === '-') return { op: 'neg', arg: unary() };
    if (t.type === 'num') return { op: 'num', value: t.value };
    if (t.type === 'var') return { op: 'var', name: t.value, line: t.line };
    if (t.type === '(') {
      const e = expr();
      expect(')');
      return e;
    }
    throw new TurtleError(`expected a value, found "${show(t)}"`, t.line);
  }

  const body = [];
  while (pos < tokens.length) body.push(statement());
  return { body, procs };
}

// Tree-walking interpreter.
function run(source) {
  const { body, procs } = parse(tokenize(source));
  const lines = [];
  let x = 0, y = 0, heading = 0, pen = true, color = 'white', steps = 0;

  function tick(line) {
    if (++steps > MAX_STEPS) throw new TurtleError(`stopped after ${MAX_STEPS} steps (infinite loop?)`, line);
  }

  function value(e, vars) {
    if (e.op === 'num') return e.value;
    if (e.op === 'neg') return -value(e.arg, vars);
    if (e.op === 'var') {
      if (!vars.has(e.name)) throw new TurtleError(`unknown variable ":${e.name}"`, e.line);
      return vars.get(e.name);
    }
    const a = value(e.left, vars), b = value(e.right, vars);
    switch (e.op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/':
        if (b === 0) throw new TurtleError('division by zero', e.line);
        return a / b;
      case '<': return a < b ? 1 : 0;
      case '>': return a > b ? 1 : 0;
      case '=': return a === b ? 1 : 0;
    }
  }

  function move(distance) {
    // heading 0 points up the screen; canvas y grows downwards
    const rad = heading * Math.PI / 180;
    const nx = x + distance * Math.sin(rad), ny = y - distance * Math.cos(rad);
    if (pen) lines.push({ x1: x, y1: y, x2: nx, y2: ny, color });
    x = nx;
    y = ny;
  }

  function exec(statements, vars, depth) {
    for (const s of statements) {
      tick(s.line);
      switch (s.op) {
        case 'forward': move(value(s.args[0], vars)); break;
        case 'back': move(-value(s.args[0], vars)); break;
        case 'right': heading += value(s.args[0], vars); break;
        case 'left': heading -= value(s.args[0], vars); break;
        case 'penup': pen = false; break;
        case 'pendown': pen = true; break;
        case 'home': x = y = heading = 0; break;
        case 'color': color = s.value; break;
        case 'if':
          if (value(s.arg, vars)) exec(s.body, vars, depth);
          break;
        case 'repeat': {
          const times = value(s.arg, vars);
          for (let i = 0; i < times; i++) {
            tick(s.line);
            exec(s.body, vars, depth);
          }
          break;
        }
        case 'call': {
          if (depth >= MAX_DEPTH) throw new TurtleError(`"${s.name}" calls itself too deeply (is an "if" missing?)`, s.line);
          const proc = procs.get(s.name);
          const args = new Map(proc.params.map((p, i) => [p, value(s.args[i], vars)]));
          exec(proc.body, args, depth + 1);
        }
      }
    }
  }

  exec(body, new Map(), 0);
  return lines;
}

// Plain script in the browser (works from file://), CommonJS module in Node for the tests.
if (typeof module !== 'undefined') module.exports = { run, TurtleError };
