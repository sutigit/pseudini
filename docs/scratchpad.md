# Iteration

- [x] **(failed)** control buttons
  - [x] show "Pseudini command+enter"
  - [x] show "cancel on esc"
  - [x] show some vertical line on the left
- [x] add "cancel on esc | pseudini command + enter" as placeholder text
- [ ] Loading indicator that pseudini conversion started
- [x] disable static code syntax parsing from the input. Goal is to have the user have absolute freedom in writing, but have some enhanced developer experience with simple coloring of reserved word/syntax tokens
  - [x] do not reognize Unexpected keyword or identifier erros
  - [x] do not recognize 'function' is not allowed as a variable declaration name errors (or any reserved keyword after const.)
  - [x] do not recognize duplicate identifier errors
- [x] word token highlighting.
  - [x] highlight all variables and function names by coloring with color A
  - [x] highlight language specific reserved basic key words with color B (in javascript: const, function, return if, else)
- [x] make the input text normal color, instead of dimmed comment color
- [ ] Extras
  - [ ] After conversion, show passed conversion time in light text style and in decimal seconds. The time should be position in the end of the line of the last row of generated code. The time should disappear after the cursor has moved to any other position or state
