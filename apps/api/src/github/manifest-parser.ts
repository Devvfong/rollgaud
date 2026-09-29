import yauzl from 'yauzl';

import { parseReleaseIdentity, type ReleaseIdentity } from '@devdeploy/contracts';

const MAX_MANIFEST_BYTES = 64 * 1024;
const MANIFEST_FILENAME = 'release-manifest.json';

export class ManifestError extends Error {
  constructor(readonly reason: 'unsafe-artifact' | 'invalid-manifest') {
    super(reason);
  }
}

export async function parseReleaseManifestArchive(archive: Buffer): Promise<ReleaseIdentity> {
  if (archive.byteLength === 0 || archive.byteLength > MAX_MANIFEST_BYTES) {
    throw new ManifestError('unsafe-artifact');
  }
  const contents = await readSingleManifest(archive);
  const text = contents.toString('utf8');
  try {
    rejectDuplicateJsonKeys(text);
    const parsed: unknown = JSON.parse(text);
    if (!isExactReleaseIdentity(parsed)) throw new ManifestError('invalid-manifest');
    return parseReleaseIdentity(parsed);
  } catch (error) {
    if (error instanceof ManifestError) throw error;
    throw new ManifestError('invalid-manifest');
  }
}

function readSingleManifest(archive: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(archive, { lazyEntries: true, validateEntrySizes: true }, (openError, zip) => {
      if (openError || !zip) return reject(new ManifestError('unsafe-artifact'));
      let entries = 0;
      let content: Buffer | undefined;
      let settled = false;
      const fail = (reason: ManifestError['reason']) => {
        if (settled) return;
        settled = true;
        zip.close();
        reject(new ManifestError(reason));
      };
      zip.on('error', () => fail('unsafe-artifact'));
      zip.on('entry', (entry) => {
        entries += 1;
        if (entries > 1 || entry.fileName !== MANIFEST_FILENAME || /(^|[\\/])\.\.([\\/]|$)/.test(entry.fileName)
          || entry.uncompressedSize > MAX_MANIFEST_BYTES || entry.compressedSize > MAX_MANIFEST_BYTES) {
          fail('unsafe-artifact');
          return;
        }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return fail('unsafe-artifact');
          const chunks: Buffer[] = [];
          let size = 0;
          stream.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_MANIFEST_BYTES) fail('unsafe-artifact');
            else chunks.push(chunk);
          });
          stream.on('error', () => fail('unsafe-artifact'));
          stream.on('end', () => {
            if (!settled) {
              content = Buffer.concat(chunks);
              zip.readEntry();
            }
          });
        });
      });
      zip.on('end', () => {
        if (settled) return;
        if (entries !== 1 || !content) return fail('unsafe-artifact');
        settled = true;
        resolve(content);
      });
      zip.readEntry();
    });
  });
}

function isExactReleaseIdentity(value: unknown): value is ReleaseIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === 5
    && keys.join(',') === 'branch,commitSha,imageDigest,repository,workflowRunId';
}

function rejectDuplicateJsonKeys(source: string): void {
  let cursor = 0;
  const whitespace = () => { while (/\s/.test(source[cursor] ?? '')) cursor += 1; };
  const string = (): string => {
    const start = cursor;
    if (source[cursor] !== '"') throw new ManifestError('invalid-manifest');
    cursor += 1;
    let escaped = false;
    while (cursor < source.length) {
      const char = source[cursor++];
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') return JSON.parse(source.slice(start, cursor)) as string;
    }
    throw new ManifestError('invalid-manifest');
  };
  const value = (): void => {
    whitespace();
    if (source[cursor] === '{') {
      cursor += 1; whitespace();
      const keys = new Set<string>();
      if (source[cursor] === '}') { cursor += 1; return; }
      for (;;) {
        whitespace(); const key = string();
        if (keys.has(key)) throw new ManifestError('invalid-manifest');
        keys.add(key); whitespace();
        if (source[cursor++] !== ':') throw new ManifestError('invalid-manifest');
        value(); whitespace();
        if (source[cursor] === '}') { cursor += 1; return; }
        if (source[cursor++] !== ',') throw new ManifestError('invalid-manifest');
      }
    }
    if (source[cursor] === '[') {
      cursor += 1; whitespace();
      if (source[cursor] === ']') { cursor += 1; return; }
      for (;;) { value(); whitespace(); if (source[cursor] === ']') { cursor += 1; return; } if (source[cursor++] !== ',') throw new ManifestError('invalid-manifest'); }
    }
    if (source[cursor] === '"') { string(); return; }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(source.slice(cursor));
    if (!match) throw new ManifestError('invalid-manifest');
    cursor += match[0].length;
  };
  value(); whitespace();
  if (cursor !== source.length) throw new ManifestError('invalid-manifest');
}
