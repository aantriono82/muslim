import { Database } from "bun:sqlite";
import { createHash } from "crypto";
import { mkdtemp, readFile, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { basename, join, resolve } from "path";

type CliOptions = {
  filePath?: string;
  dirPath?: string;
  limit?: number;
  strictChecksum?: boolean;
};

const parseCliOptions = (): CliOptions => {
  const options: CliOptions = { strictChecksum: true };
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
    if (arg === "--dir" && args[i + 1]) {
      options.dirPath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--dir=")) {
      options.dirPath = arg.slice("--dir=".length);
      continue;
    }
    if (arg === "--limit" && args[i + 1]) {
      options.limit = Number(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.slice("--limit=".length));
      continue;
    }
    if (arg === "--allow-missing-checksum") {
      options.strictChecksum = false;
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
    throw new Error("Hasil dekripsi bukan file SQLite valid.");
  }

  const db = new Database(path, { readonly: true });
  try {
    const quickCheck = db.query("PRAGMA quick_check;").get() as
      | Record<string, string>
      | undefined;
    if (!quickCheck) {
      throw new Error("PRAGMA quick_check gagal dibaca.");
    }
    const value = Object.values(quickCheck)[0];
    if (value !== "ok") {
      throw new Error(`Integrity check gagal: ${value}`);
    }
  } finally {
    db.close();
  }
};

const decryptToTemp = async (encryptedPath: string, passphrase: string) => {
  const tempDir = await mkdtemp(join(tmpdir(), "muslim-api-verify-"));
  const decryptedPath = join(tempDir, "verify.sqlite");
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
      {
        env: { ...process.env, BACKUP_PASSPHRASE: passphrase },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    if (!decrypted.success) {
      const reason = Buffer.from(decrypted.stderr).toString("utf8").trim();
      throw new Error(`Dekripsi gagal. ${reason || "OpenSSL error."}`);
    }
    await ensureValidSqlite(decryptedPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

const projectRoot = resolve(import.meta.dir, "..");
const defaultDir = resolve(projectRoot, "..", "backups", "api");
const options = parseCliOptions();
const passphrase = process.env.BACKUP_PASSPHRASE?.trim() ?? "";
const strictChecksum = options.strictChecksum ?? true;

let targets: string[] = [];

if (options.filePath) {
  const single = resolve(options.filePath);
  if (!single.endsWith(".enc")) {
    throw new Error("File harus berakhiran .enc");
  }
  if (!(await exists(single))) {
    throw new Error(`File backup tidak ditemukan: ${single}`);
  }
  targets = [single];
} else {
  const dir = resolve(options.dirPath ?? process.env.BACKUP_DIR ?? defaultDir);
  const entries: string[] = [];
  for await (const entry of new Bun.Glob("*.sqlite.enc").scan(dir)) {
    entries.push(entry);
  }
  const items = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = resolve(dir, entry);
      const info = await stat(fullPath);
      return { fullPath, mtimeMs: info.mtimeMs };
    }),
  );
  targets = items
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map((item) => item.fullPath);
}

if (Number.isFinite(options.limit) && (options.limit ?? 0) > 0) {
  targets = targets.slice(0, Number(options.limit));
}

if (targets.length === 0) {
  throw new Error("Tidak ada file backup .enc yang ditemukan.");
}

let okCount = 0;
const failures: { file: string; reason: string }[] = [];

for (const encryptedPath of targets) {
  try {
    const checksumPath = `${encryptedPath}.sha256`;
    if (await exists(checksumPath)) {
      const bytes = await readFile(encryptedPath);
      const actual = createHash("sha256").update(bytes).digest("hex");
      const expected = parseExpectedChecksum(
        await Bun.file(checksumPath).text(),
      );
      if (actual !== expected) {
        throw new Error(
          `Checksum mismatch expected=${expected} actual=${actual}`,
        );
      }
    } else if (strictChecksum) {
      throw new Error(`Checksum tidak ditemukan: ${basename(checksumPath)}`);
    }

    if (passphrase) {
      await decryptToTemp(encryptedPath, passphrase);
    }

    okCount += 1;
    const verifyMode = passphrase ? "checksum+decrypt" : "checksum-only";
    console.log(`[OK] ${basename(encryptedPath)} (${verifyMode})`);
  } catch (err) {
    failures.push({
      file: basename(encryptedPath),
      reason: err instanceof Error ? err.message : "Unknown error",
    });
    console.error(
      `[FAIL] ${basename(encryptedPath)}: ${err instanceof Error ? err.message : "Unknown error"}`,
    );
  }
}

console.log(`\nHasil verifikasi: ${okCount}/${targets.length} berhasil.`);
if (failures.length > 0) {
  throw new Error("Terdapat backup yang gagal diverifikasi.");
}
