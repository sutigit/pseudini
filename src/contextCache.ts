import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { FileFacts } from "./fileContext";

interface CacheRecord {
  readonly schemaVersion: number;
  readonly extractorVersion: number;
  readonly sourcePath: string;
  readonly facts: FileFacts;
}

interface CacheManifest {
  readonly schemaVersion: number;
  readonly entries: Record<
    string,
    {
      readonly contentHash: string;
      readonly record: string;
    }
  >;
}

const SCHEMA_VERSION = 1;
const EXTRACTOR_VERSION = 1;

export class ContextCache {
  private readonly cacheDirectory: string;
  private readonly filesDirectory: string;
  private readonly manifestPath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  public constructor(workspaceRoot: string) {
    this.cacheDirectory = path.join(workspaceRoot, ".aime", "cache-v1");
    this.filesDirectory = path.join(this.cacheDirectory, "files");
    this.manifestPath = path.join(this.cacheDirectory, "manifest.json");
  }

  public async read(
    sourcePath: string,
    expectedContentHash: string,
  ): Promise<FileFacts | undefined> {
    const recordPath = path.join(this.filesDirectory, createRecordName(sourcePath));
    const record = await readJsonFile(recordPath);

    if (!isCacheRecord(record)) {
      return undefined;
    }

    const isCurrent =
      record.schemaVersion === SCHEMA_VERSION &&
      record.extractorVersion === EXTRACTOR_VERSION &&
      record.sourcePath === sourcePath &&
      record.facts.contentHash === expectedContentHash;

    return isCurrent ? record.facts : undefined;
  }

  public write(sourcePath: string, facts: FileFacts): Promise<void> {
    const operation = this.writeQueue.then(() => this.writeRecord(sourcePath, facts));
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  private async writeRecord(sourcePath: string, facts: FileFacts): Promise<void> {
    await mkdir(this.filesDirectory, { recursive: true });
    const recordName = createRecordName(sourcePath);
    const record: CacheRecord = {
      schemaVersion: SCHEMA_VERSION,
      extractorVersion: EXTRACTOR_VERSION,
      sourcePath,
      facts,
    };
    await writeJsonAtomically(path.join(this.filesDirectory, recordName), record);

    const existingManifest = await readJsonFile(this.manifestPath);
    const entries = isCacheManifest(existingManifest) ? existingManifest.entries : {};
    const manifest: CacheManifest = {
      schemaVersion: SCHEMA_VERSION,
      entries: {
        ...entries,
        [sourcePath]: {
          contentHash: facts.contentHash,
          record: `files/${recordName}`,
        },
      },
    };
    await writeJsonAtomically(this.manifestPath, manifest);
  }
}

function createRecordName(sourcePath: string): string {
  return `${createHash("sha256").update(sourcePath).digest("hex")}.json`;
}

async function writeJsonAtomically(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, filePath);
}

async function readJsonFile(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    return undefined;
  }
}

function isCacheRecord(value: unknown): value is CacheRecord {
  return (
    isRecord(value) &&
    typeof value.schemaVersion === "number" &&
    typeof value.extractorVersion === "number" &&
    typeof value.sourcePath === "string" &&
    isFileFacts(value.facts)
  );
}

function isCacheManifest(value: unknown): value is CacheManifest {
  return (
    isRecord(value) &&
    value.schemaVersion === SCHEMA_VERSION &&
    isRecord(value.entries)
  );
}

function isFileFacts(value: unknown): value is FileFacts {
  return (
    isRecord(value) &&
    typeof value.contentHash === "string" &&
    typeof value.languageId === "string" &&
    typeof value.fileName === "string" &&
    Array.isArray(value.imports) &&
    value.imports.every((item) => typeof item === "string") &&
    Array.isArray(value.declarations) &&
    value.declarations.every((item) => typeof item === "string") &&
    typeof value.indentation === "string"
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
