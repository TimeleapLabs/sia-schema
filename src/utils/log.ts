import { ILexingError, IRecognitionException } from "chevrotain";

const getLines = (src: string, line: number) =>
  src
    .split("\n")
    .slice(line - 3, line)
    .join("\n");

const addCaret = (src: string, line: number, column: number) => {
  const lines = getLines(src, line);
  const caret = " ".repeat(column - 1) + "↑";
  return lines + "\n" + caret;
};

export const logLexerError = (
  src: string,
  filename: string,
  error: ILexingError,
) => {
  const code = addCaret(src, error.line as number, error.column as number);
  console.warn(
    `Lexing error in ${filename} at line ${error.line}:${error.column}\n`,
  );
  console.warn(`${code}\n`);
  console.warn(error.message);
};

export const logParserError = (
  src: string,
  filename: string,
  error: IRecognitionException,
) => {
  const code = addCaret(
    src,
    error.token.startLine as number,
    error.token.endColumn as number,
  );
  console.warn(
    `Parsing error in ${filename} at line ${error.token.startLine}:${error.token.startColumn}\n`,
  );
  console.warn(`${code}\n`);
  console.warn(error.message);
};

export const logError = (
  src: string,
  filename: string,
  error: IRecognitionException | ILexingError,
) => {
  if ("token" in error) {
    logParserError(src, filename, error);
  } else {
    logLexerError(src, filename, error);
  }
};
