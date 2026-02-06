import { Hono } from "hono";
import { db } from "./db";

const users = new Hono();

const selectUserById = db.prepare(
  "SELECT id, name, email, created_at, updated_at FROM users WHERE id = ?"
);
const selectUserByEmail = db.prepare("SELECT id FROM users WHERE email = ?");
const insertUser = db.prepare("INSERT INTO users (name, email) VALUES (?, ?)");
const updateUser = db.prepare(
  "UPDATE users SET name = ?, email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
);
const updateUserPartial = db.prepare(
  "UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), updated_at = CURRENT_TIMESTAMP WHERE id = ?"
);
const deleteUser = db.prepare("DELETE FROM users WHERE id = ?");

const listAll = db.prepare(
  "SELECT id, name, email, created_at, updated_at FROM users ORDER BY id LIMIT ? OFFSET ?"
);
const countAll = db.prepare("SELECT COUNT(*) AS total FROM users");
const listSearch = db.prepare(
  "SELECT id, name, email, created_at, updated_at FROM users WHERE name LIKE ? OR email LIKE ? ORDER BY id LIMIT ? OFFSET ?"
);
const countSearch = db.prepare(
  "SELECT COUNT(*) AS total FROM users WHERE name LIKE ? OR email LIKE ?"
);

const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const parseId = (value?: string) => {
  const id = Number.parseInt(value ?? "", 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const normalizeName = (value: unknown) => {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name) return null;
  if (name.length > 100) return null;
  return name;
};

const normalizeEmail = (value: unknown) => {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!emailRegex.test(email)) return null;
  if (email.length > 254) return null;
  return email;
};

users.get("/", (c) => {
  const pageRaw = c.req.query("page");
  const limitRaw = c.req.query("limit");
  const q = c.req.query("q")?.trim();

  const page = Math.max(1, Number.parseInt(pageRaw ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(limitRaw ?? "20", 10) || 20));
  const offset = (page - 1) * limit;

  if (q) {
    const search = `%${q}%`;
    const data = listSearch.all(search, search, limit, offset);
    const totalRow = countSearch.get(search, search) as { total: number } | undefined;
    const total = totalRow?.total ?? 0;
    return c.json({
      status: true,
      message: "success",
      data,
      pagination: { page, limit, total },
    });
  }

  const data = listAll.all(limit, offset);
  const totalRow = countAll.get() as { total: number } | undefined;
  const total = totalRow?.total ?? 0;
  return c.json({
    status: true,
    message: "success",
    data,
    pagination: { page, limit, total },
  });
});

users.get("/:id", (c) => {
  const id = parseId(c.req.param("id"));
  if (!id) {
    return c.json({ status: false, message: "ID tidak valid." }, 400);
  }

  const user = selectUserById.get(id);
  if (!user) {
    return c.json({ status: false, message: "Pengguna tidak ditemukan." }, 404);
  }

  return c.json({ status: true, message: "success", data: user });
});

users.post("/", async (c) => {
  let body: unknown = null;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ status: false, message: "Body JSON tidak valid." }, 400);
  }

  const name = normalizeName((body as Record<string, unknown>)?.name);
  const email = normalizeEmail((body as Record<string, unknown>)?.email);

  if (!name || !email) {
    return c.json(
      { status: false, message: "Nama dan email wajib diisi dengan format yang benar." },
      400
    );
  }

  const existing = selectUserByEmail.get(email) as { id: number } | undefined;
  if (existing) {
    return c.json({ status: false, message: "Email sudah terdaftar." }, 409);
  }

  const result = insertUser.run(name, email);
  const id = Number(result.lastInsertRowid);
  const user = selectUserById.get(id);

  return c.json({ status: true, message: "success", data: user }, 201);
});

users.put("/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (!id) {
    return c.json({ status: false, message: "ID tidak valid." }, 400);
  }

  const current = selectUserById.get(id);
  if (!current) {
    return c.json({ status: false, message: "Pengguna tidak ditemukan." }, 404);
  }

  let body: unknown = null;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ status: false, message: "Body JSON tidak valid." }, 400);
  }

  const name = normalizeName((body as Record<string, unknown>)?.name);
  const email = normalizeEmail((body as Record<string, unknown>)?.email);

  if (!name || !email) {
    return c.json(
      { status: false, message: "Nama dan email wajib diisi dengan format yang benar." },
      400
    );
  }

  const existing = selectUserByEmail.get(email) as { id: number } | undefined;
  if (existing && existing.id !== id) {
    return c.json({ status: false, message: "Email sudah dipakai pengguna lain." }, 409);
  }

  updateUser.run(name, email, id);
  const user = selectUserById.get(id);

  return c.json({ status: true, message: "success", data: user });
});

users.patch("/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (!id) {
    return c.json({ status: false, message: "ID tidak valid." }, 400);
  }

  const current = selectUserById.get(id);
  if (!current) {
    return c.json({ status: false, message: "Pengguna tidak ditemukan." }, 404);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ status: false, message: "Body JSON tidak valid." }, 400);
  }

  const hasName = Object.prototype.hasOwnProperty.call(body, "name");
  const hasEmail = Object.prototype.hasOwnProperty.call(body, "email");

  if (!hasName && !hasEmail) {
    return c.json({ status: false, message: "Tidak ada data yang diperbarui." }, 400);
  }

  const name = hasName ? normalizeName(body.name) : null;
  const email = hasEmail ? normalizeEmail(body.email) : null;

  if ((hasName && !name) || (hasEmail && !email)) {
    return c.json(
      { status: false, message: "Nama atau email tidak valid." },
      400
    );
  }

  if (email) {
    const existing = selectUserByEmail.get(email) as { id: number } | undefined;
    if (existing && existing.id !== id) {
      return c.json(
        { status: false, message: "Email sudah dipakai pengguna lain." },
        409
      );
    }
  }

  updateUserPartial.run(name, email, id);
  const user = selectUserById.get(id);

  return c.json({ status: true, message: "success", data: user });
});

users.delete("/:id", (c) => {
  const id = parseId(c.req.param("id"));
  if (!id) {
    return c.json({ status: false, message: "ID tidak valid." }, 400);
  }

  const current = selectUserById.get(id);
  if (!current) {
    return c.json({ status: false, message: "Pengguna tidak ditemukan." }, 404);
  }

  deleteUser.run(id);

  return c.json({ status: true, message: "success", data: { id } });
});

export default users;
