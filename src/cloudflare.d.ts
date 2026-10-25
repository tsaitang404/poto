interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface R2PutOptions {
  httpMetadata?: {
    contentType?: string;
  };
  customMetadata?: Record<string, string>;
}

interface R2PutResult {
  etag?: string;
}

interface R2HttpMetadata {
  contentType?: string;
}

interface R2Object {
  size: number;
  etag: string;
  version: string;
  httpMetadata?: R2HttpMetadata;
}

interface R2ObjectBody extends R2Object {
  body: ReadableStream | null;
  httpMetadata?: R2HttpMetadata;
}

interface R2Bucket {
  put(key: string, value: ArrayBuffer | ArrayBufferView | string, options?: R2PutOptions): Promise<R2PutResult | null>;
  get(key: string): Promise<R2ObjectBody | null>;
  head(key: string): Promise<R2Object | null>;
  delete(key: string): Promise<void>;
}
