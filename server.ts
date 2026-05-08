import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import multer from "multer";
import * as XLSX from "xlsx";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BCRYPT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");

// MySQL connection pool
let pool: mysql.Pool;

// Extend Express Request to include user from JWT
interface AuthRequest extends Request {
  user?: { id: number; nomor_induk: string; name: string; role: string; class_name: string };
}

// =====================
// JWT Auth Middleware
// =====================
function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Token tidak ditemukan. Silakan login terlebih dahulu." });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Token tidak valid atau sudah kadaluarsa." });
  }
}

function signToken(user: { id: number; nomor_induk: string; name: string; role: string; class_name: string }): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "8h" });
}

async function initDB() {
  // First connect without database to create it if needed
  const tempConn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
  });

  await tempConn.execute(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || "siap_db"}\``);
  await tempConn.end();

  // Now create pool with database selected
  pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "siap_db",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  // Create tables
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nomor_induk VARCHAR(255) UNIQUE,
      password TEXT,
      name VARCHAR(255),
      role VARCHAR(50),
      class_name VARCHAR(255)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS permits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_id INT,
      student_name VARCHAR(255),
      class_name VARCHAR(255),
      type VARCHAR(50),
      reason TEXT,
      start_time VARCHAR(10),
      end_time VARCHAR(10),
      permit_date VARCHAR(20),
      status VARCHAR(50) DEFAULT 'pending_wali',
      sign_slug VARCHAR(255) UNIQUE,
      wali_name VARCHAR(255),
      piket_name VARCHAR(255),
      signature_piket LONGTEXT,
      signature_wali LONGTEXT,
      proof_file LONGTEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES users(id)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS permit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      permit_id INT,
      actor_name VARCHAR(255),
      action TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (permit_id) REFERENCES permits(id)
    )
  `);

  // Check if piket_name column exists (for existing databases)
  try {
    await pool.execute(`SELECT piket_name FROM permits LIMIT 1`);
  } catch {
    try {
      await pool.execute(`ALTER TABLE permits ADD COLUMN piket_name VARCHAR(255) AFTER wali_name`);
    } catch {
      // Column might already exist
    }
  }

  // Check if nomor_induk column exists (for existing databases)
  try {
    await pool.execute(`SELECT nomor_induk FROM users LIMIT 1`);
  } catch {
    try {
      await pool.execute(`ALTER TABLE users CHANGE nis nomor_induk VARCHAR(255)`);
    } catch {
      // Column might already exist or table doesn't have nis either
    }
  }

  // Update existing wali_kelas users to admin
  try {
    await pool.execute(`UPDATE users SET role = 'admin' WHERE role = 'wali_kelas'`);
  } catch {
    // Ignore errors if table doesn't exist yet
  }

  // Seed initial users if empty
  const [rows] = await pool.execute("SELECT COUNT(*) as count FROM users") as any;
  if (rows[0].count === 0) {
    const seedUsers = [
      // Guru Piket
      { nomor_induk: "GP001", password: "guru123", name: "Ahmad Fauzi, S.Pd.", role: "admin", class_name: "Guru Piket" },
      { nomor_induk: "GP002", password: "guru123", name: "Siti Rahayu, S.Kom.", role: "admin", class_name: "Guru Piket" },
      { nomor_induk: "GP003", password: "guru123", name: "Dedi Kurniawan, M.Pd.", role: "admin", class_name: "Guru Piket" },
      // Wali Kelas
      { nomor_induk: "WK001", password: "wali123", name: "Yanti Kusuma, S.Pd.", role: "admin", class_name: "Wali Kelas X RPL 1" },
      { nomor_induk: "WK002", password: "wali123", name: "Hendra Wijaya, S.Kom.", role: "admin", class_name: "Wali Kelas X RPL 2" },
      { nomor_induk: "WK003", password: "wali123", name: "Ratna Sari, M.Pd.", role: "admin", class_name: "Wali Kelas XI TKJ 1" },
      // Murid
      { nomor_induk: "12345", password: "murid123", name: "Reihan Aditya Putra", role: "student", class_name: "X RPL 2" },
      { nomor_induk: "12346", password: "murid123", name: "Budi Santoso", role: "student", class_name: "X RPL 1" },
      { nomor_induk: "12347", password: "murid123", name: "Sari Dewi Lestari", role: "student", class_name: "X RPL 2" },
      { nomor_induk: "12348", password: "murid123", name: "Andi Prasetyo", role: "student", class_name: "XI TKJ 1" },
    ];

    for (const u of seedUsers) {
      const hashedPassword = bcrypt.hashSync(u.password, BCRYPT_ROUNDS);
      await pool.execute(
        "INSERT INTO users (nomor_induk, password, name, role, class_name) VALUES (?, ?, ?, ?, ?)",
        [u.nomor_induk, hashedPassword, u.name, u.role, u.class_name]
      );
    }
    console.log("✅ Seed users berhasil ditambahkan");
  }
}

async function recordLog(permitId: number | bigint, actorName: string, action: string) {
  await pool.execute(
    "INSERT INTO permit_logs (permit_id, actor_name, action) VALUES (?, ?, ?)",
    [permitId, actorName, action]
  );
}

function generateSlug(): string {
  return crypto.randomBytes(8).toString("hex");
}

const upload = multer({ storage: multer.memoryStorage() });

async function startServer() {
  // Initialize database first
  await initDB();
  console.log("✅ MySQL database initialized");

  const app = express();
  const PORT = 3025;

  app.use(express.json({ limit: '10mb' }));

  // =====================
  // PUBLIC APIs (no auth required)
  // =====================

  app.get("/api/teachers", async (_req, res) => {
    try {
      const [rows] = await pool.execute("SELECT id, name FROM users WHERE role = 'admin'");
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get("/api/wali-kelas", async (_req, res) => {
    try {
      const [rows] = await pool.execute("SELECT id, name, class_name FROM users WHERE role = 'wali_kelas'");
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/login/student", async (req, res) => {
    const { nomor_induk, password } = req.body;
    try {
      const [rows] = await pool.execute(
        "SELECT * FROM users WHERE nomor_induk = ? AND role = 'student'",
        [nomor_induk]
      ) as any;
      if (rows.length > 0 && bcrypt.compareSync(password, rows[0].password)) {
        const user = rows[0];
        const safeUser = { id: user.id, nomor_induk: user.nomor_induk, name: user.name, role: user.role, class_name: user.class_name };
        const token = signToken(safeUser);
        res.json({ success: true, user: safeUser, token });
      } else {
        res.status(401).json({ success: false, message: "Nomor Induk atau password salah" });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/login/teacher", async (req, res) => {
    const { teacher_id, password } = req.body;
    try {
      const [rows] = await pool.execute(
        "SELECT * FROM users WHERE id = ? AND role = 'admin'",
        [teacher_id]
      ) as any;
      if (rows.length > 0 && bcrypt.compareSync(password, rows[0].password)) {
        const user = rows[0];
        const safeUser = { id: user.id, nomor_induk: user.nomor_induk, name: user.name, role: user.role, class_name: user.class_name };
        const token = signToken(safeUser);
        res.json({ success: true, user: safeUser, token });
      } else {
        res.status(401).json({ success: false, message: "Password salah" });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Public sign APIs (wali kelas via link, no auth)
  app.get("/api/sign/:slug", async (req, res) => {
    const { slug } = req.params;
    try {
      const [rows] = await pool.execute("SELECT * FROM permits WHERE sign_slug = ?", [slug]) as any;
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: "Surat izin tidak ditemukan" });
      }
      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/sign/:slug", async (req, res) => {
    const { slug } = req.params;
    const { nig, signature_wali } = req.body;

    try {
      const [rows] = await pool.execute("SELECT * FROM permits WHERE sign_slug = ?", [slug]) as any;
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: "Surat izin tidak ditemukan" });
      }
      const permit = rows[0];
      if (permit.status !== "pending_wali") {
        return res.status(400).json({ success: false, message: "Surat ini sudah ditandatangani oleh wali kelas" });
      }
      if (!signature_wali || !nig) {
        return res.status(400).json({ success: false, message: "Tanda tangan dan NIG diperlukan" });
      }

      // Cari nama wali kelas berdasarkan NIG
      const cleanNig = nig.trim();
      const [userRows] = await pool.execute("SELECT name FROM users WHERE nomor_induk = ? AND role = 'admin'", [cleanNig]) as any;
      if (userRows.length === 0) {
        return res.status(400).json({ success: false, message: "NIG tidak ditemukan atau bukan guru" });
      }
      const wali_name = userRows[0].name;

      await pool.execute(
        "UPDATE permits SET status = 'wali_approved', wali_name = ?, signature_wali = ?, updated_at = CURRENT_TIMESTAMP WHERE sign_slug = ?",
        [wali_name, signature_wali, slug]
      );
      await recordLog(permit.id, wali_name, "Menyetujui (Wali Kelas Approved)");

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Seeder API (no auth - for admin setup)
  app.post("/api/seed/users", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ success: false, message: "Upload file Excel (.xlsx)." });
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const rows = XLSX.utils.sheet_to_json<{ nomor_induk: string; password: string; name: string; role: string; class_name: string }>(workbook.Sheets[workbook.SheetNames[0]]);
      if (!rows.length) return res.status(400).json({ success: false, message: "File Excel kosong." });

      const requiredCols = ["nomor_induk", "password", "name", "role", "class_name"];
      const missingCols = requiredCols.filter(col => !(col in rows[0]));
      if (missingCols.length > 0) return res.status(400).json({ success: false, message: `Kolom tidak ditemukan: ${missingCols.join(", ")}` });

      let inserted = 0, skipped = 0;
      const errors: string[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row.nomor_induk || !row.password || !row.name || !row.role) { skipped++; errors.push(`Baris ${i+2}: data tidak lengkap`); continue; }
        if (!["student", "admin"].includes(row.role)) { skipped++; errors.push(`Baris ${i+2}: role tidak valid`); continue; }
        try {
          const hashedPassword = bcrypt.hashSync(String(row.password), BCRYPT_ROUNDS);
          await pool.execute(
            `INSERT INTO users (nomor_induk, password, name, role, class_name) VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE password = VALUES(password), name = VALUES(name), role = VALUES(role), class_name = VALUES(class_name)`,
            [String(row.nomor_induk), hashedPassword, String(row.name), String(row.role), String(row.class_name || "")]
          );
          inserted++;
        } catch (err: any) { skipped++; errors.push(`Baris ${i+2}: ${err.message}`); }
      }
      res.json({ success: true, message: `${inserted} ditambahkan, ${skipped} dilewati.`, inserted, skipped, errors: errors.length ? errors : undefined });
    } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
  });

  // =====================
  // PROTECTED APIs (auth required)
  // =====================

  app.get("/api/permits", authMiddleware, async (req: AuthRequest, res) => {
    const { student_id } = req.query;
    try {
      if (student_id) {
        const [rows] = await pool.execute(
          "SELECT * FROM permits WHERE student_id = ? ORDER BY created_at DESC",
          [student_id]
        );
        res.json(rows);
      } else {
        const [rows] = await pool.execute(
          "SELECT * FROM permits WHERE status IN ('wali_approved', 'fully_approved') ORDER BY created_at DESC"
        );
        res.json(rows);
      }
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/permits", authMiddleware, async (req: AuthRequest, res) => {
    const { student_id, student_name, class_name, type, reason, start_time, end_time, permit_date, proof_file, actor_name } = req.body;
    
    if (start_time > end_time) {
      return res.status(400).json({ success: false, message: "Jam mulai tidak boleh lebih besar dari jam selesai" });
    }

    const slug = generateSlug();
    try {
      const [result] = await pool.execute(
        `INSERT INTO permits (student_id, student_name, class_name, type, reason, start_time, end_time, permit_date, proof_file, sign_slug, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_wali')`,
        [student_id, student_name, class_name, type, reason, start_time, end_time, permit_date, proof_file || null, slug]
      ) as any;

      await recordLog(result.insertId, actor_name || student_name, `Mengajukan surat ${type}`);

      res.json({ success: true, id: result.insertId, sign_slug: slug });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.patch("/api/permits/:id", authMiddleware, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const permitId = parseInt(id);
    const { signature_piket, actor_name } = req.body;

    try {
      if (signature_piket) {
        await pool.execute(
          "UPDATE permits SET status = 'fully_approved', signature_piket = ?, piket_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [signature_piket, actor_name || "Guru Piket", permitId]
        );
        await recordLog(permitId, actor_name || "Guru Piket", "Menyetujui (Guru Piket Approved)");
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get("/api/permits/:id", authMiddleware, async (req: AuthRequest, res) => {
    const { id } = req.params;
    try {
      const [rows] = await pool.execute("SELECT * FROM permits WHERE id = ?", [id]) as any;
      if (rows.length > 0) {
        res.json({ success: true, permit: rows[0] });
      } else {
        res.status(404).json({ success: false, message: "Permit not found" });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get("/api/logs", authMiddleware, async (req: AuthRequest, res) => {
    const { student_id } = req.query;
    try {
      if (student_id) {
        const [rows] = await pool.execute(
          `SELECT l.*, p.type, p.student_id, p.student_name FROM permit_logs l JOIN permits p ON l.permit_id = p.id WHERE p.student_id = ? ORDER BY l.created_at DESC`,
          [student_id]
        );
        res.json(rows);
      } else {
        const [rows] = await pool.execute(
          `SELECT l.*, p.type, p.student_id, p.student_name FROM permit_logs l JOIN permits p ON l.permit_id = p.id ORDER BY l.created_at DESC`
        );
        res.json(rows);
      }
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get("/api/stats", authMiddleware, async (_req, res) => {
    try {
      const [totalRows] = await pool.execute("SELECT COUNT(*) as count FROM permits") as any;
      const [pendingRows] = await pool.execute("SELECT COUNT(*) as count FROM permits WHERE status = 'wali_approved'") as any;
      const [approvedRows] = await pool.execute("SELECT COUNT(*) as count FROM permits WHERE status = 'fully_approved'") as any;
      const [typeRows] = await pool.execute("SELECT type, COUNT(*) as count FROM permits GROUP BY type") as any;
      res.json({
        total: totalRows[0].count,
        pending: pendingRows[0].count,
        approved: approvedRows[0].count,
        types: typeRows,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get("/api/users", authMiddleware, async (_req, res) => {
    try {
      const [rows] = await pool.execute("SELECT id, nomor_induk, name, role, class_name FROM users ORDER BY role, name");
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // =====================
  // Vite Dev Server
  // =====================

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => { res.sendFile(path.join(distPath, "index.html")); });
  }

  app.listen(PORT, "0.0.0.0", () => { console.log(`🚀 Server running on http://localhost:${PORT}`); });
}

startServer();
