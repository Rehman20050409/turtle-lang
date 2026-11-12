// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const { run, TurtleError } = require('./turtle.js');

const length = (l) => Math.hypot(l.x2 - l.x1, l.y2 - l.y1);

test('a square is four lines that end where they started', () => {
  const lines = run('repeat 4 [ forward 100 right 90 ]');
  assert.equal(lines.length, 4);
  const last = lines[3];
  assert.ok(Math.abs(last.x2) < 1e-9 && Math.abs(last.y2) < 1e-9);
});

test('forward moves up the screen and aliases work', () => {
  const [line] = run('fd 50');
  assert.deepEqual(line, { x1: 0, y1: 0, x2: 0, y2: -50, color: 'white' });
});

test('arithmetic follows normal precedence', () => {
  assert.equal(length(run('forward 2 + 3 * 4')[0]), 14);
  assert.equal(length(run('forward (2 + 3) * 4')[0]), 20);
  assert.equal(length(run('forward 10 - -5')[0]), 15);
});

test('penup stops drawing, color changes the line colour', () => {
  const lines = run('penup fd 10 pendown color #ff0000 fd 10 color red fd 10');
  assert.deepEqual(lines.map((l) => l.color), ['#ff0000', 'red']);
});

test('procedures take parameters and can recurse', () => {
  const lines = run(`
    to steps :n :size
      if :n > 0 [ forward :size steps :n - 1 :size * 2 ]
    end
    steps 3 10
  `);
  assert.deepEqual(lines.map(length), [10, 20, 40]);
});

test('a procedure can be called above its definition', () => {
  assert.equal(run('line 5\nto line :n forward :n end').length, 1);
});

test('comments are ignored', () => {
  assert.equal(run('; nothing here\nfd 1 ; one line').length, 1);
});

test('errors report the line number', () => {
  assert.throws(() => run('fd 10\njump 5'), { message: 'Line 2: unknown command "jump"' });
  assert.throws(() => run('fd :x'), { message: 'Line 1: unknown variable ":x"' });
  assert.throws(() => run('fd 1 / 0'), { message: 'Line 1: division by zero' });
  assert.throws(() => run('repeat 4 [ fd 1'), TurtleError);
  assert.throws(() => run('fd 10 $'), TurtleError);
  assert.throws(() => run('to fd end'), TurtleError);
  assert.throws(() => run('constructor'), { message: 'Line 1: unknown command "constructor"' });
});

test('runaway programs are stopped instead of hanging', () => {
  assert.throws(() => run('to loop loop end loop'), /too deeply/);
  assert.throws(() => run('repeat 1000000000 [ ]'), /infinite loop/);
});
