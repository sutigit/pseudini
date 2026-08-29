export interface CommentWrapper {
  readonly opening: string;
  readonly closing: string;
}

const BLOCK_COMMENT: CommentWrapper = { opening: "/*", closing: "*/" };
const JSX_COMMENT: CommentWrapper = { opening: "{/*", closing: "*/}" };
const HTML_COMMENT: CommentWrapper = { opening: "<!--", closing: "-->" };

export function getCommentWrapper(languageId: string): CommentWrapper | undefined {
  if (
    languageId === "typescript" ||
    languageId === "javascript" ||
    languageId === "css"
  ) {
    return BLOCK_COMMENT;
  }
  if (languageId === "typescriptreact" || languageId === "javascriptreact") {
    return JSX_COMMENT;
  }
  if (languageId === "html") {
    return HTML_COMMENT;
  }
  return undefined;
}
