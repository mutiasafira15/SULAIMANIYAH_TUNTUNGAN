// server.js
require("dotenv").config(); // ⬅️ aktifkan dukungan .env

const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// 🌐 Gunakan environment variable (.env) agar bisa jalan di Railway & lokal
// const db = mysql.createConnection({
//   host: process.env.DB_HOST || "localhost",
//   user: process.env.DB_USER || "root",
//   password: process.env.DB_PASSWORD || "",
//   database: process.env.DB_NAME || "link_tracker",
//   port: process.env.DB_PORT || 3306,
// });
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});


db.connect(err => {
  if (err) {
    console.error("❌ Gagal konek ke database:", err);
    process.exit(1);
  }
  console.log("✅ Koneksi MySQL berhasil");
});

// ---- Serve file HTML ----
app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ---- API ----

// 1. Ambil semua sections + link
app.get("/sections", (req, res) => {
  const sql = `
    SELECT s.id as section_id, s.name, l.id as link_id, l.title, l.description, l.url
    FROM sections s
    LEFT JOIN links l ON s.id = l.section_id
    ORDER BY s.id DESC, l.id DESC
  `;
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).send(err);

    const sections = [];
    const map = {};

    rows.forEach(r => {
      if (!map[r.section_id]) {
        map[r.section_id] = {
          id: r.section_id,
          name: r.name,
          links: []
        };
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
  });
});

// 2. Tambah section
app.post("/sections", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Nama wajib diisi" });

  db.query("INSERT INTO sections (name) VALUES (?)", [name], (err, result) => {
    if (err) return res.status(500).send(err);
    res.json({ id: result.insertId, name });
  });
});

// 3. Tambah link
app.post("/links", (req, res) => {
  const { section_id, title, description, url } = req.body;
  if (!section_id || !title || !url) {
    return res.status(400).json({ error: "Data kurang lengkap" });
  }

  db.query(
    "INSERT INTO links (section_id, title, description, url) VALUES (?, ?, ?, ?)",
    [section_id, title, description, url],
    (err, result) => {
      if (err) return res.status(500).send(err);
      res.json({ id: result.insertId, section_id, title, description, url });
    }
  );
});

// 4. Edit link
app.put("/links/:id", (req, res) => {
  const { id } = req.params;
  const { title, description, url } = req.body;

  db.query(
    "UPDATE links SET title=?, description=?, url=? WHERE id=?",
    [title, description, url, id],
    (err) => {
      if (err) return res.status(500).send(err);
      res.json({ success: true });
    }
  );
});

// 5. Hapus link
app.delete("/links/:id", (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM links WHERE id=?", [id], (err) => {
    if (err) return res.status(500).send(err);
    res.json({ success: true });
  });
});

// ---- start server ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server jalan di port ${PORT}`);
});
