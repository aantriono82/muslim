import { rm, stat } from "fs/promises";
import { basename, resolve } from "path";

type CliOptions = {
  dirPath?: string;
  retentionDays?: number;
  keepMin?: number;
};

const toPositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  return normalized > 0 ? normalized : fallback;
};

const parseCliOptions = (): CliOptions => {
  const options: CliOptions = {};
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--dir" && args[i + 1]) {
      options.dirPath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--dir=")) {
      options.dirPath = arg.slice("--dir=".length);
      continue;
    }
    if (arg === "--days" && args[i + 1]) {
      options.retentionDays = Number(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--days=")) {
      options.retentionDays = Number(arg.slice("--days=".length));
      continue;
    }
    if (arg === "--keep-min" && args[i + 1]) {
      options.keepMin = Number(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--keep-min=")) {
      options.keepMin = Number(arg.slice("--keep-min=".length));
      continue;
    }
  }

  return options;
};

const exists = async (path: string) => Bun.file(path).exists();

const projectRoot = resolve(import.meta.dir, "..");
const defaultDir = resolve(projectRoot, "..", "backups", "api");
const options = parseCliOptions();
const dir = resolve(options.dirPath ?? process.env.BACKUP_DIR ?? defaultDir);
const retentionDays = toPositiveInt(
  options.retentionDays ?? process.env.BACKUP_RETENTION_DAYS,
  30,
);
const keepMin = toPositiveInt(
  options.keepMin ?? process.env.BACKUP_KEEP_MIN,
  10,
);
const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

const entries: string[] = [];
for await (const entry of new Bun.Glob("*.sqlite.enc").scan(dir)) {
  entries.push(entry);
}
if (entries.length === 0) {
  console.log("Tidak ada backup .enc untuk dipruning.");
  process.exit(0);
}

const items = await Promise.all(
  entries.map(async (entry) => {
    const encryptedPath = resolve(dir, entry);
    const info = await stat(encryptedPath);
    return { encryptedPath, mtimeMs: info.mtimeMs };
  }),
);

items.sort((a, b) => b.mtimeMs - a.mtimeMs);

let removed = 0;
let kept = 0;
for (let i = 0; i < items.length; i += 1) {
  const item = items[i];
  const isProtectedByKeepMin = i < keepMin;
  const isOldEnough = item.mtimeMs < cutoffMs;

  if (!isOldEnough || isProtectedByKeepMin) {
    kept += 1;
    continue;
  }

  const sidecars = [
    item.encryptedPath,
    `${item.encryptedPath}.sha256`,
    `${item.encryptedPath}.json`,
  ];

  for (const filePath of sidecars) {
    if (await exists(filePath)) {
      await rm(filePath, { force: true });
    }
  }

  removed += 1;
  console.log(`[REMOVED] ${basename(item.encryptedPath)}`);
}

console.log(
  `Prune selesai. Total=${items.length}, kept=${kept}, removed=${removed}, retentionDays=${retentionDays}, keepMin=${keepMin}.`,
);
