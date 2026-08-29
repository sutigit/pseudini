import cssKeywords from "./packs/css.json";
import htmlKeywords from "./packs/html.json";
import jsxKeywords from "./packs/jsx.json";
import typescriptKeywords from "./packs/typescript.json";

const TYPESCRIPT_LANGUAGE_IDS = new Set(["typescript", "javascript"]);
const JSX_LANGUAGE_IDS = new Set(["typescriptreact", "javascriptreact"]);

export function getLanguageKeywords(languageId: string): readonly string[] {
  if (TYPESCRIPT_LANGUAGE_IDS.has(languageId)) {
    return typescriptKeywords;
  }
  if (JSX_LANGUAGE_IDS.has(languageId)) {
    return [...typescriptKeywords, ...jsxKeywords];
  }
  if (languageId === "html") {
    return htmlKeywords;
  }
  if (languageId === "css") {
    return cssKeywords;
  }
  return [];
}
