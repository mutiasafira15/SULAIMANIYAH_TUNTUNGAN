// server.js
require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const path = require("path");

const app = express();

// CORS: sesuaikan origin di production
app.use(cors({
  origin: process.env.CORS_ORIGIN || "*" // ubah '*' ke domain produksi kalau perlu
}));
app.use(express.json());

// parse port dari env
const DB_PORT = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306;

// create pool (lebih stabil untuk cloud)
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "link_tracker",
  port: DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// quick test connection on startup (non-fatal: log error but don't crash)
pool.getConnection((err, conn) => {
  if (err) {
    console.error("❌ Gagal membuat koneksi ke DB:", err.message || err);
  } else {
    console.log("✅ Pool DB siap (connection ok).");
    conn.release();
  }
});

// static files (saran: taruh frontend di folder "public")
app.use(express.static(path.join(__dirname, "public"))); // ubah jika index.html di root

app.get("/", (req, res) => {
  // jika kamu menggunakan public/index.html, ini opsional
  res.sendFile(path.join(__dirname, "index.html"));
});

// Helper: safe DB query menggunakan promise
const dbQuery = (...args) => pool.promise().query(...args);

// Healthcheck
app.get("/health", async (req, res) => {
  try {
    const [rows] = await dbQuery("SELECT 1 AS ok");
    res.json({ status: "ok" });
  } catch (err) {
    console.error("Healthcheck DB error:", err.message || err);
    res.status(500).json({ status: "error" });
  }
});

// 1. Ambil semua sections + link
app.get("/sections", async (req, res) => {
  try {
    const [rows] = await dbQuery(`
      SELECT s.id as section_id, s.name, l.id as link_id, l.title, l.description, l.url
      FROM sections s
      LEFT JOIN links l ON s.id = l.section_id
      ORDER BY s.id DESC, l.id DESC
    `);

    const sections = [];
    const map = {};
    rows.forEach(r => {
      if (!map[r.section_id]) {
        map[r.section_id] = { id: r.section_id, name: r.name, links: [] };
        sections.push(map[r.section_id]);
      }
      if (r.link_id) {
        map[r.section_id].links.push({
          id: r.link_id,
          title: r.title,
          description: r.description,
          url: r.url
        });
      }
    });

    res.json(sections);
  } catch (err) {
    console.error("GET /sections error:", err.message || err);
    res.status(500).json({ error: "Database error" });
  }
});

// 2. Tambah section
app.post("/sections", async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Nama wajib diisi" });

  try {
    const [result] = await pool.promise().execute("INSERT INTO sections (name) VALUES (?)", [name]);
    res.json({ id: result.insertId, name });
  } catch (err) {
    console.error("POST /sections error:", err.message || err);
    res.status(500).json({ error: "Database error" });
  }
});

// 3. Tambah link
app.post("/links", async (req, res) => {
  const { section_id, title, description, url } = req.body;
  if (!section_id || !title || !url) {
    return res.status(400).json({ error: "Data kurang lengkap" });
  }

  try {
    const [result] = await pool.promise().execute(
      "INSERT INTO links (section_id, title, description, url) VALUES (?, ?, ?, ?)",
      [section_id, title, description || null, url]
    );
    res.json({ id: result.insertId, section_id, title, description, url });
  } catch (err) {
    console.error("POST /links error:", err.message || err);
    res.status(500).json({ error: "Database error" });
  }
});

// 4. Edit link
app.put("/links/:id", async (req, res) => {
  const { id } = req.params;
  const { title, description, url } = req.body;
  try {
    await pool.promise().execute("UPDATE links SET title=?, description=?, url=? WHERE id=?", [title, description, url, id]);
    res.json({ success: true });
  } catch (err) {
    console.error("PUT /links/:id error:", err.message || err);
    res.status(500).json({ error: "Database error" });
  }
});

// 5. Hapus link
app.delete("/links/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.promise().execute("DELETE FROM links WHERE id=?", [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /links/:id error:", err.message || err);
    res.status(500).json({ error: "Database error" });
  }
});

// Graceful shutdown: tutup pool
const closePool = () => {
  pool.end(err => {
    if (err) console.error("Error closing DB pool:", err);
    else console.log("DB pool closed.");
    process.exit(0);
  });
};
process.on("SIGINT", closePool);
process.on("SIGTERM", closePool);

// Start server (bind 0.0.0.0 agar Railway/host bisa akses)
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server jalan di port ${PORT}`);
});
