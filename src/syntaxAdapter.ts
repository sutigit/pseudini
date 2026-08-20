import { AimeInstruction } from "./commentParser";
import { CodeReplacement } from "./prompt";

const LOG_INSTRUCTION = /^log\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)$/i;

export function createDeterministicReplacement(
  instruction: AimeInstruction,
  languageId: string,
  sourceLine: string,
): CodeReplacement | undefined {
  const expression = LOG_INSTRUCTION.exec(instruction.pseudocode)?.[1];
  if (!expression) {
    return undefined;
  }

  const statement = createLogStatement(languageId, expression);
  if (!statement) {
    return undefined;
  }

  const indentation = sourceLine.match(/^\s*/)?.[0] ?? "";
  return {
    line: instruction.line,
    ...(instruction.endLine === undefined ? {} : { endLine: instruction.endLine }),
    code: `${indentation}${statement}`,
  };
}

function createLogStatement(languageId: string, expression: string): string | undefined {
  switch (languageId) {
    case "javascript":
    case "javascriptreact":
    case "typescript":
    case "typescriptreact":
      return `console.log(${expression});`;
    case "python":
      return `print(${expression})`;
    case "java":
      return `System.out.println(${expression});`;
    case "csharp":
      return `Console.WriteLine(${expression});`;
    case "ruby":
      return `puts ${expression}`;
    case "php":
      return `var_dump(${expression});`;
    default:
      return undefined;
  }
}
