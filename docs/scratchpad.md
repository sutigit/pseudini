# Iteration

- [ ] control buttons
  - [ ] show "Pseudini command+enter"
  - [ ] show "cancel on esc"
  - [ ] show some vertical line on the left
- [ ] Loading indicator that pseudini conversion started
- [ ] disable static code syntax parsing from the input. Goal is to have the user to have absolute freedom in writing, but have some enhanced developer experience for just coloring some important word/syntax tokens
  - [ ] do not reognize Unexpected keyword or identifier erros
  - [ ] do not recognize 'function' is not allowed as a variable declaration name errors (or any reserved keyword after const.)
  - [ ] do not recognize duplicate identifier errors
- [ ] word token highlighting.
  - [ ] highlight all variable names with color A
  - [ ] highlight language specific reserved words with color B
- [ ] Extras
  - [ ] After conversion, show passed conversion time in light text style and in decimal seconds. The time should be position in the end of the line of the last row of generated code. The time should disappear after the cursor has moved to any other position or state
