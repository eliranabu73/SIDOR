declare module 'bidi-js' {
  interface BidiInstance {
    getEmbeddingLevels(str: string, dir?: 'ltr' | 'rtl' | 'auto'): { levels: Uint8Array; paragraphs: unknown[] };
    getReorderedString(str: string, embedLevels: { levels: Uint8Array; paragraphs: unknown[] }, options?: unknown): string;
  }
  function bidiFactory(): BidiInstance;
  export = bidiFactory;
}
