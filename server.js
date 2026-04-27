require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 5174);
const JWT_SECRET =
  process.env.JWT_SECRET || "change-me-in-env-please-very-important";
const ADMIN_PASSWORD_HASH =
  process.env.ADMIN_PASSWORD_HASH ||
  "$2b$12$HTKbTgtqL9IZ8UGhEv3v7Os6K4bPXYa0drfQpum0aW8KdAugVg./2";
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";

const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(__dirname, "uploads");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (!fs.existsSync(PRODUCTS_FILE)) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify({ products: [] }, null, 2), "utf8");
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Seules les images sont autorisées."));
      return;
    }
    cb(null, true);
  },
});

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(__dirname));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de tentatives. Réessaie dans 15 minutes." },
});

function readProducts() {
  try {
    const raw = fs.readFileSync(PRODUCTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.products) ? parsed.products : [];
  } catch {
    return [];
  }
}

function writeProducts(products) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify({ products }, null, 2), "utf8");
}

function requireAdmin(req, res, next) {
  const token = req.cookies.admin_token;
  if (!token) {
    res.status(401).json({ message: "Authentification requise." });
    return;
  }
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Session expirée. Reconnectez-vous." });
  }
}

app.get("/api/products", (_req, res) => {
  res.json({ products: readProducts() });
});

app.get("/api/admin/session", (req, res) => {
  const token = req.cookies.admin_token;
  if (!token) {
    res.json({ authenticated: false });
    return;
  }
  try {
    jwt.verify(token, JWT_SECRET);
    res.json({ authenticated: true });
  } catch {
    res.json({ authenticated: false });
  }
});

app.post("/api/admin/login", loginLimiter, async (req, res) => {
  const { password } = req.body || {};
  if (!password || typeof password !== "string") {
    res.status(400).json({ message: "Mot de passe requis." });
    return;
  }
  const ok = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  if (!ok) {
    res.status(401).json({ message: "Mot de passe incorrect." });
    return;
  }

  const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "2h" });
  res.cookie("admin_token", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: IS_PROD,
    maxAge: 2 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

app.post("/api/admin/logout", (_req, res) => {
  res.clearCookie("admin_token");
  res.json({ ok: true });
});

app.post("/api/products", requireAdmin, upload.single("imageFile"), (req, res) => {
  const { name, category, style, target, line, price, imageUrl, description } = req.body;
  if (!name || !category || !style || !target || !line || !price || !description) {
    res.status(400).json({ message: "Champs requis manquants." });
    return;
  }

  let image = "";
  if (req.file) {
    image = `/uploads/${req.file.filename}`;
  } else if (imageUrl && typeof imageUrl === "string") {
    image = imageUrl.trim();
  }

  if (!image) {
    res.status(400).json({ message: "Image requise." });
    return;
  }

  const newProduct = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    category: String(category).trim(),
    style: String(style).trim(),
    target: String(target).trim(),
    line: String(line).trim(),
    price: Number(price),
    image,
    description: String(description).trim(),
    createdAt: new Date().toISOString(),
  };

  const products = readProducts();
  products.unshift(newProduct);
  writeProducts(products);
  res.status(201).json({ product: newProduct });
});

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ message: "Image invalide ou trop lourde (max 5MB)." });
    return;
  }
  res.status(500).json({ message: err.message || "Erreur interne serveur." });
});

app.listen(PORT, () => {
  console.log(`NIKKAH GLAM sécurisé lancé sur http://localhost:${PORT}`);
});
