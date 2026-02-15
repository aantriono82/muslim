import { Database } from "bun:sqlite";
import { createHash } from "crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { basename, dirname, join, resolve } from "path";

type CliOptions = {
  dbPath?: string;
  outputDir?: string;
  prefix?: string;
};

const parseCliOptions = (): CliOptions => {
  const options: CliOptions = {};
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--db" && args[i + 1]) {
      options.dbPath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--db=")) {
      options.dbPath = arg.slice("--db=".length);
      continue;
    }
    if (arg === "--out" && args[i + 1]) {
      options.outputDir = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--out=")) {
      options.outputDir = arg.slice("--out=".length);
      continue;
    }
    if (arg === "--prefix" && args[i + 1]) {
      options.prefix = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--prefix=")) {
      options.prefix = arg.slice("--prefix=".length);
      continue;
    }
  }

  return options;
};

const projectRoot = resolve(import.meta.dir, "..");
const defaultDbPath = resolve(projectRoot, "data.sqlite");
const defaultOutputDir = resolve(projectRoot, "..", "backups", "api");
const options = parseCliOptions();
const dbPath = resolve(options.dbPath ?? process.env.DB_PATH ?? defaultDbPath);
const outputDir = resolve(
  options.outputDir ?? process.env.BACKUP_DIR ?? defaultOutputDir,
);
const backupPrefix = (options.prefix ?? process.env.BACKUP_PREFIX ?? "users")
  .trim()
  .replace(/[^a-zA-Z0-9._-]+/g, "-");
const passphrase = process.env.BACKUP_PASSPHRASE?.trim();

if (!passphrase) {
  throw new Error(
    "BACKUP_PASSPHRASE wajib diisi untuk membuat backup terenkripsi.",
  );
}

if (!(await Bun.file(dbPath).exists())) {
  throw new Error(`Database tidak ditemukan: ${dbPath}`);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const tempDir = await mkdtemp(join(tmpdir(), "muslim-api-backup-"));
const snapshotPath = join(tempDir, `${backupPrefix}-${timestamp}.sqlite`);
const encryptedPath = join(outputDir, `${backupPrefix}-${timestamp}.sqlite.enc`);
const checksumPath = `${encryptedPath}.sha256`;
const metadataPath = `${encryptedPath}.json`;

const safeSqlitePath = snapshotPath.replace(/'/g, "''");
const openSslEnv = {
  ...process.env,
  BACKUP_PASSPHRASE: passphrase,
};

await mkdir(outputDir, { recursive: true });
await mkdir(dirname(encryptedPath), { recursive: true });

try {
  const db = new Database(dbPath, { readonly: true });
  try {
    db.exec(`VACUUM INTO '${safeSqlitePath}';`);
  } finally {
    db.close();
  }

  const encrypted = Bun.spawnSync(
    [
      "openssl",
      "enc",
      "-aes-256-cbc",
      "-pbkdf2",
      "-salt",
      "-in",
      snapshotPath,
      "-out",
      encryptedPath,
      "-pass",
      "env:BACKUP_PASSPHRASE",
    ],
    { env: openSslEnv, stdout: "pipe", stderr: "pipe" },
  );

  if (!encrypted.success) {
    const reason = Buffer.from(encrypted.stderr).toString("utf8").trim();
    throw new Error(`Gagal mengenkripsi backup. ${reason || "OpenSSL error."}`);
  }

  const encryptedBytes = await readFile(encryptedPath);
  const sha256 = createHash("sha256").update(encryptedBytes).digest("hex");
  await writeFile(checksumPath, `${sha256}  ${basename(encryptedPath)}\n`, "utf8");

  const stat = await Bun.file(encryptedPath).stat();
  const metadata = {
    created_at: new Date().toISOString(),
    db_path: dbPath,
    encrypted_file: basename(encryptedPath),
    sha256,
    bytes: stat.size,
    algorithm: "aes-256-cbc",
    kdf: "pbkdf2",
  };
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  console.log(`Backup terenkripsi tersimpan: ${encryptedPath}`);
  console.log(`Checksum SHA-256: ${checksumPath}`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
