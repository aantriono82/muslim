import { Database } from "bun:sqlite";
import { createHash } from "crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "fs/promises";
import { tmpdir } from "os";
import { basename, dirname, join, resolve } from "path";

type CliOptions = {
  filePath?: string;
  dbPath?: string;
  checksumPath?: string;
};

const parseCliOptions = (): CliOptions => {
  const options: CliOptions = {};
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--file" && args[i + 1]) {
      options.filePath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--file=")) {
      options.filePath = arg.slice("--file=".length);
      continue;
    }
    if (arg === "--db" && args[i + 1]) {
      options.dbPath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--db=")) {
      options.dbPath = arg.slice("--db=".length);
      continue;
    }
    if (arg === "--checksum" && args[i + 1]) {
      options.checksumPath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--checksum=")) {
      options.checksumPath = arg.slice("--checksum=".length);
      continue;
    }
  }

  return options;
};

const exists = async (path: string) => Bun.file(path).exists();

const parseExpectedChecksum = (raw: string) => {
  const token = raw.trim().split(/\s+/)[0];
  if (!token || !/^[a-fA-F0-9]{64}$/.test(token)) {
    throw new Error("Format checksum tidak valid.");
  }
  return token.toLowerCase();
};

const ensureValidSqlite = async (path: string) => {
  const bytes = await readFile(path);
  const signature = Buffer.from("SQLite format 3\u0000");
  const header = bytes.subarray(0, signature.length);
  if (!Buffer.from(header).equals(signature)) {
    throw new Error("File hasil dekripsi bukan file SQLite yang valid.");
  }

  const db = new Database(path, { readonly: true });
  try {
    const quickCheck = db
      .query("PRAGMA quick_check;")
      .get() as Record<string, string> | undefined;
    if (!quickCheck) {
      throw new Error("Validasi SQLite gagal dibaca.");
    }
    const value = Object.values(quickCheck)[0];
    if (value !== "ok") {
      throw new Error(`Integrity check gagal: ${value}`);
    }
  } finally {
    db.close();
  }
};

const projectRoot = resolve(import.meta.dir, "..");
const defaultDbPath = resolve(projectRoot, "data.sqlite");
const options = parseCliOptions();
const encryptedPathInput = options.filePath ?? process.env.BACKUP_FILE ?? "";
const encryptedPath = encryptedPathInput
  ? resolve(encryptedPathInput)
  : encryptedPathInput;
const dbPath = resolve(options.dbPath ?? process.env.DB_PATH ?? defaultDbPath);
const checksumPath = resolve(
  options.checksumPath ?? process.env.BACKUP_CHECKSUM ?? `${encryptedPath}.sha256`,
);
const passphrase = process.env.BACKUP_PASSPHRASE?.trim();

if (!encryptedPath) {
  throw new Error("Path backup wajib diisi. Gunakan --file=<path>.");
}
if (!(await exists(encryptedPath))) {
  throw new Error(`File backup tidak ditemukan: ${encryptedPath}`);
}
if (!passphrase) {
  throw new Error(
    "BACKUP_PASSPHRASE wajib diisi untuk memulihkan backup terenkripsi.",
  );
}

if (await exists(checksumPath)) {
  const encryptedBytes = await readFile(encryptedPath);
  const actual = createHash("sha256").update(encryptedBytes).digest("hex");
  const expected = parseExpectedChecksum(await Bun.file(checksumPath).text());
  if (actual !== expected) {
    throw new Error(
      `Checksum tidak cocok. expected=${expected} actual=${actual}.`,
    );
  }
}

const tempDir = await mkdtemp(join(tmpdir(), "muslim-api-restore-"));
const decryptedPath = join(tempDir, "restored.sqlite");
const stagingPath = join(tempDir, "staging.sqlite");
const openSslEnv = {
  ...process.env,
  BACKUP_PASSPHRASE: passphrase,
};
const backupTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
const previousDbBackupPath = `${dbPath}.${backupTimestamp}.bak`;
const previousWalBackupPath = `${dbPath}-wal.${backupTimestamp}.bak`;
const previousShmBackupPath = `${dbPath}-shm.${backupTimestamp}.bak`;
const restoredWalPath = `${dbPath}-wal`;
const restoredShmPath = `${dbPath}-shm`;

await mkdir(dirname(dbPath), { recursive: true });

try {
  const decrypted = Bun.spawnSync(
    [
      "openssl",
      "enc",
      "-d",
      "-aes-256-cbc",
      "-pbkdf2",
      "-in",
      encryptedPath,
      "-out",
      decryptedPath,
      "-pass",
      "env:BACKUP_PASSPHRASE",
    ],
    { env: openSslEnv, stdout: "pipe", stderr: "pipe" },
  );
  if (!decrypted.success) {
    const reason = Buffer.from(decrypted.stderr).toString("utf8").trim();
    throw new Error(`Gagal dekripsi backup. ${reason || "OpenSSL error."}`);
  }

  await ensureValidSqlite(decryptedPath);
  await copyFile(decryptedPath, stagingPath);

  if (await exists(dbPath)) {
    await rename(dbPath, previousDbBackupPath);
  }
  if (await exists(restoredWalPath)) {
    await rename(restoredWalPath, previousWalBackupPath);
  }
  if (await exists(restoredShmPath)) {
    await rename(restoredShmPath, previousShmBackupPath);
  }

  await rename(stagingPath, dbPath);
  await writeFile(
    `${dbPath}.restore-log.txt`,
    [
      `restored_at=${new Date().toISOString()}`,
      `source_file=${basename(encryptedPath)}`,
      `db_path=${dbPath}`,
      `previous_db_backup=${await exists(previousDbBackupPath) ? previousDbBackupPath : "-"}`,
      `previous_wal_backup=${await exists(previousWalBackupPath) ? previousWalBackupPath : "-"}`,
      `previous_shm_backup=${await exists(previousShmBackupPath) ? previousShmBackupPath : "-"}`,
    ].join("\n") + "\n",
    "utf8",
  );

  console.log(`Restore selesai: ${dbPath}`);
  if (await exists(previousDbBackupPath)) {
    console.log(`Backup database lama: ${previousDbBackupPath}`);
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
