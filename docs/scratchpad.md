# Iterations

#### Iteration 1.1

- [ ] Python language support

#### Iteration 0.2

- [ ] Loading indication that pseudini conversion started (something cool but feasable)
- [x] Make sure the color highlighting works only on identifier names
- [ ] Create the end of the typed line anchored "esc cancels | pseudini ⌘⏎" chip to remind how the heck did we convert it again
- [ ] (extra) After conversion, show passed conversion time in light text style and in decimal seconds. The time should be position in the end of the line of the last row of generated code. The time should disappear after the cursor has moved to any other position or state

#### Iteration 0.1

- [x] **(failed)** control buttons
  - [x] show "Pseudini command+enter"
  - [x] show "cancel on esc"
  - [x] show some vertical line on the left
- [x] add "cancel on esc | pseudini command + enter" as placeholder text
- [x] disable static code syntax parsing from the input. Goal is to have the user have absolute freedom in writing, but have some enhanced developer experience with simple coloring of reserved word/syntax tokens
  - [x] do not reognize Unexpected keyword or identifier erros
  - [x] do not recognize 'function' is not allowed as a variable declaration name errors (or any reserved keyword after const.)
  - [x] do not recognize duplicate identifier errors
- [x] word token highlighting.
  - [x] highlight all variables and function names by coloring with color A
  - [x] highlight language specific reserved basic key words with color B (in javascript: const, function, return if, else)
- [x] make the input text normal color, instead of dimmed comment color
