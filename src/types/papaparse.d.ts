declare module 'papaparse' {
  export interface ParseError {
    type: string;
    code: string;
    message: string;
    row?: number;
    index?: number;
  }

  export interface ParseMeta {
    delimiter?: string;
    linebreak?: string;
    aborted?: boolean;
    truncated?: boolean;
    cursor?: number;
    fields?: string[];
  }

  export interface ParseResult<T> {
    data: T[];
    errors: ParseError[];
    meta: ParseMeta;
  }

  export interface ParseConfig<T = unknown> {
    delimiter?: string;
    header?: boolean;
    skipEmptyLines?: boolean | 'greedy';
    dynamicTyping?: boolean;
    worker?: boolean;
    transform?: (value: string, field: string | number) => T;
  }

  export function parse<T = unknown>(input: string, config?: ParseConfig<T>): ParseResult<T>;

  export interface UnparseConfig {
    delimiter?: string;
    newline?: string;
    quotes?: boolean;
  }

  export function unparse(data: unknown[] | unknown[][], config?: UnparseConfig): string;

  const Papa: {
    parse: typeof parse;
    unparse: typeof unparse;
  };

  export default Papa;
}
