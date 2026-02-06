import { Hono } from "hono";
import users from "./users";

const app = new Hono().basePath("/api");

app.onError((err, c) => {
  console.error(err);
  return c.json({ status: false, message: "Terjadi kesalahan server." }, 500);
});

app.get("/", (c) => c.json({ status: true, message: "API berjalan." }));

app.route("/users", users);

const port = Number(process.env.PORT ?? 3000);
console.log(`Server berjalan di http://localhost:${port}/api`);

Bun.serve({
  port,
  fetch: app.fetch,
});
