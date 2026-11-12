# Turtle 🐢

A tiny Logo-style programming language, written from scratch in JavaScript with no dependencies, plus a live playground that draws as you type.

I started coding with Scratch when I was 8. This is my take on building the other side of that: the language itself.

```
to tree :size
  if :size > 4 [
    forward :size
    left 25
    tree :size * 0.72
    right 50
    tree :size * 0.72
    left 25
    back :size
  ]
end

tree 90
```

## Try it

Open `index.html` in a browser. No build step, no server.

## The language

| Command | What it does |
| --- | --- |
| `forward 50` / `fd`, `back` / `bk` | move, drawing a line |
| `left 90` / `lt`, `right` / `rt` | turn, in degrees |
| `penup` / `pu`, `pendown` / `pd` | stop or start drawing |
| `color red`, `color #a3a8ff` | change the line colour |
| `home` | jump back to the start |
| `repeat 4 [ … ]` | run the block several times |
| `if :n > 0 [ … ]` | run the block when true (`<` `>` `=`) |
| `to name :a :b … end` | define a command; it can call itself |
| `+ - * / ( )` | maths, with normal precedence |
| `; note` | comment |

## How it works

Everything is in [`turtle.js`](turtle.js), in three stages:

1. **Tokenizer** – turns the source text into tokens, remembering each one's line number.
2. **Parser** – a hand-written recursive-descent parser that builds a syntax tree. Commands take their arguments without brackets (`side 300 4`), so a first pass collects how many parameters each procedure has before any call is parsed.
3. **Interpreter** – walks the tree and returns a list of line segments. It never touches the page, which is what makes it easy to test.

Programs come from a text box, so the interpreter caps the number of steps and the recursion depth. An infinite loop gives an error message with a line number, not a frozen tab.

## Tests

```
node --test
```
