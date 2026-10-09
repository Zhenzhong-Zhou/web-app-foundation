import { createReadStream } from 'node:fs';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';

import type { FileStorage } from './file-storage';

/** Only a key keyOf made reaches the disk: no `..`, no other folder. */
const KEY = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/(thumb|display|full)$/;

/** Files on disk, for development, tests and CI (ADR-059). */
export class LocalFileStorage implements FileStorage {
  constructor(private readonly root: string) {}

  private pathOf(key: string): string {
    if (!KEY.test(key)) throw new Error(`Not a file key: ${key}`);
    return path.join(this.root, key);
  }

  async put(key: string, body: Buffer): Promise<void> {
    const file = this.pathOf(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }

  async get(key: string): Promise<Readable> {
    const file = this.pathOf(key);
    await access(file);
    return createReadStream(file);
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }
}
