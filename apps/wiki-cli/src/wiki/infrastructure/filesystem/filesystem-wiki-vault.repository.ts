import { realpathSync, statSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import * as path from 'node:path';

import type { ParsedWikiNote } from '../../domain/entities/wiki-note.js';
import { WikiError } from '../../domain/errors/wiki.errors.js';
import type { WikiVaultRepository } from '../../domain/repositories/wiki-vault.repository.js';
import { parseMarkdownNote } from '../markdown/markdown-note.parser.js';

export class FilesystemWikiVaultRepository implements WikiVaultRepository {
  readonly vaultPath: string;

  constructor(vaultPath: string) {
    this.vaultPath = path.resolve(vaultPath);
  }

  exists(): boolean {
    try {
      return statSync(this.vaultPath).isDirectory();
    } catch {
      return false;
    }
  }

  canonicalPath(): string {
    if (!this.exists()) {
      throw new WikiError(
        'VAULT_NOT_FOUND',
        `Wiki vault does not exist or is not a directory: ${this.vaultPath}`,
      );
    }
    try {
      return realpathSync(this.vaultPath);
    } catch (error) {
      throw new WikiError(
        'VAULT_NOT_FOUND',
        `Wiki vault cannot be read: ${this.vaultPath}`,
        [],
        { cause: error },
      );
    }
  }

  async latestMarkdownMtimeMs(): Promise<number | null> {
    const files = await this.discoverMarkdownFiles();
    if (files.length === 0) return null;
    const stats = await Promise.all(
      files.map((file) => stat(file.absolutePath)),
    );
    return Math.max(...stats.map((entry) => entry.mtimeMs));
  }

  async readAllNotes(): Promise<ParsedWikiNote[]> {
    const files = await this.discoverMarkdownFiles();
    return Promise.all(
      files.map(async (file) => {
        const [markdown, metadata] = await Promise.all([
          readFile(file.absolutePath, 'utf8'),
          stat(file.absolutePath),
        ]);
        return parseMarkdownNote({
          relativePath: file.relativePath,
          markdown,
          mtimeMs: metadata.mtimeMs,
          size: metadata.size,
        });
      }),
    );
  }

  private async discoverMarkdownFiles(): Promise<
    Array<{ absolutePath: string; relativePath: string }>
  > {
    const root = this.canonicalPath();
    const files: Array<{ absolutePath: string; relativePath: string }> = [];

    async function walk(directory: string): Promise<void> {
      const entries = await readdir(directory, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await walk(absolutePath);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
          const relativePath = path
            .relative(root, absolutePath)
            .split(path.sep)
            .join('/');
          files.push({ absolutePath, relativePath });
        }
      }
    }

    try {
      await walk(root);
      return files;
    } catch (error) {
      if (error instanceof WikiError) throw error;
      throw new WikiError(
        'VAULT_NOT_FOUND',
        `Wiki vault cannot be read: ${this.vaultPath}`,
        [],
        { cause: error },
      );
    }
  }
}
