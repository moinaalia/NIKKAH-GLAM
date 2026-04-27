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
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (!fs.existsSync(PRODUCTS_FILE)) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify({ products: [] }, null, 2), "utf8");
}

if (!fs.existsSync(ORDERS_FILE)) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify({ orders: [] }, null, 2), "utf8");
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

function readOrders() {
  try {
    const raw = fs.readFileSync(ORDERS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.orders) ? parsed.orders : [];
  } catch {
    return [];
  }
}

function writeOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify({ orders }, null, 2), "utf8");
}

function normalizePromotionFields(payload = {}, fallbackPrice = 0) {
  const promoEnabled =
    payload.promoEnabled === true ||
    payload.promoEnabled === "true" ||
    payload.promoEnabled === "1" ||
    payload.promoEnabled === 1;
  const promoPrice = Number(payload.promoPrice);
  const finalPromoPrice =
    Number.isFinite(promoPrice) && promoPrice > 0 && promoPrice < fallbackPrice
      ? promoPrice
      : null;

  return {
    promoEnabled: promoEnabled && finalPromoPrice !== null,
    promoPrice: promoEnabled ? finalPromoPrice : null,
    promoLabel: String(payload.promoLabel || "").trim(),
    promoDescription: String(payload.promoDescription || "").trim(),
  };
}

function inferCategoryStyleTargetLine({ name, line, imageHint }) {
  const source = `${name || ""} ${line || ""} ${imageHint || ""}`.toLowerCase();
  const includesOne = (words) => words.some((word) => source.includes(word));

  let category = "vetement";
  if (
    includesOne([
      "chaussure",
      "escarpin",
      "sandale",
      "mocassin",
      "sneaker",
      "talon",
      "shoe",
      "heel",
      "boot",
    ])
  ) {
    category = "chaussure";
  } else if (
    includesOne([
      "accessoire",
      "bijou",
      "voile",
      "sac",
      "parure",
      "collier",
      "bracelet",
      "boucle",
      "accessory",
      "bag",
    ])
  ) {
    category = "accessoire";
  }

  const style = includesOne([
    "moderne",
    "modern",
    "costume",
    "smoking",
    "robe soiree",
    "robe soirée",
    "suit",
  ])
    ? "moderne"
    : "traditionnel";

  let target = "invite";
  if (includesOne(["homme", "marié", "marie ", "monsieur", "man", "men"])) {
    target = "marie";
  } else if (
    includesOne([
      "femme",
      "mariée",
      "mariee",
      "demoiselle",
      "femme d'honneur",
      "woman",
      "women",
      "lady",
    ])
  ) {
    target = "mariee";
  } else if (includesOne(["famille", "family"])) {
    target = "famille";
  }

  let inferredLine = "Collection générale";
  if (includesOne(["kandou"])) inferredLine = "Kandou";
  else if (includesOne(["robe"])) inferredLine = "Robe";
  else if (includesOne(["costume", "smoking", "suit"])) inferredLine = "Costume";
  else if (includesOne(["voile"])) inferredLine = "Voile";
  else if (includesOne(["bijou", "parure"])) inferredLine = "Parure";
  else if (includesOne(["sac", "bag"])) inferredLine = "Sac";
  else if (category === "chaussure") inferredLine = "Chaussures cérémonie";
  else if (category === "accessoire") inferredLine = "Accessoires mariage";
  else if (style === "traditionnel") inferredLine = "Tenue traditionnelle";
  else inferredLine = "Tenue moderne";

  return { category, style, target, line: inferredLine };
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

app.get("/api/orders", requireAdmin, (_req, res) => {
  res.json({ orders: readOrders() });
});

app.post("/api/orders", (req, res) => {
  const { name, country, phone, payment, address, notes } = req.body || {};
  if (!name || !country || !phone || !payment || !address) {
    res.status(400).json({ message: "Champs requis manquants." });
    return;
  }

  if (payment !== "mvola" && payment !== "cash") {
    res.status(400).json({ message: "Mode de paiement invalide." });
    return;
  }

  const newOrder = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    country: String(country).trim(),
    phone: String(phone).trim(),
    payment,
    address: String(address).trim(),
    notes: String(notes || "").trim(),
    createdAt: new Date().toISOString(),
    status: "nouvelle",
  };

  const orders = readOrders();
  orders.unshift(newOrder);
  writeOrders(orders);
  res.status(201).json({ order: newOrder });
});

app.post("/api/products", requireAdmin, upload.single("imageFile"), (req, res) => {
  const {
    name,
    category,
    style,
    target,
    line,
    price,
    imageUrl,
    description,
    promoEnabled,
    promoPrice,
    promoLabel,
    promoDescription,
  } = req.body;
  if (!name || !price) {
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

  const inferred = inferCategoryStyleTargetLine({
    name: String(name).trim(),
    line: String(line || "").trim(),
    imageHint: req.file?.originalname || image,
  });

  const finalCategory =
    !category || category === "auto" ? inferred.category : String(category).trim();
  const finalStyle =
    !style || style === "auto" ? inferred.style : String(style).trim();
  const finalTarget =
    !target || target === "auto" ? inferred.target : String(target).trim();
  const finalLine = line ? String(line).trim() : inferred.line;
  const finalDescription =
    description && String(description).trim().length > 0
      ? String(description).trim()
      : `${String(name).trim()} - ${finalLine}, ${finalStyle}, ${finalCategory}.`;
  const finalPrice = Number(price);
  const promotion = normalizePromotionFields(
    { promoEnabled, promoPrice, promoLabel, promoDescription },
    finalPrice
  );

  const newProduct = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    category: finalCategory,
    style: finalStyle,
    target: finalTarget,
    line: finalLine,
    price: finalPrice,
    image,
    description: finalDescription,
    ...promotion,
    createdAt: new Date().toISOString(),
  };

  const products = readProducts();
  products.unshift(newProduct);
  writeProducts(products);
  res.status(201).json({ product: newProduct });
});

app.patch("/api/products/:id", requireAdmin, (req, res) => {
  const productId = String(req.params.id || "").trim();
  if (!productId) {
    res.status(400).json({ message: "Identifiant produit manquant." });
    return;
  }

  const products = readProducts();
  const productIndex = products.findIndex((item) => item.id === productId);
  if (productIndex === -1) {
    res.status(404).json({ message: "Produit introuvable." });
    return;
  }

  const current = products[productIndex];
  const patch = req.body || {};
  const nextPrice =
    patch.price !== undefined && Number.isFinite(Number(patch.price))
      ? Number(patch.price)
      : Number(current.price);
  const promotion = normalizePromotionFields(
    {
      promoEnabled:
        patch.promoEnabled !== undefined ? patch.promoEnabled : current.promoEnabled,
      promoPrice: patch.promoPrice !== undefined ? patch.promoPrice : current.promoPrice,
      promoLabel: patch.promoLabel !== undefined ? patch.promoLabel : current.promoLabel,
      promoDescription:
        patch.promoDescription !== undefined
          ? patch.promoDescription
          : current.promoDescription,
    },
    nextPrice
  );

  const updated = {
    ...current,
    price: nextPrice,
    ...promotion,
    updatedAt: new Date().toISOString(),
  };

  products[productIndex] = updated;
  writeProducts(products);
  res.json({ product: updated });
});

app.delete("/api/products/:id", requireAdmin, (req, res) => {
  const productId = String(req.params.id || "").trim();
  if (!productId) {
    res.status(400).json({ message: "Identifiant produit manquant." });
    return;
  }
  const products = readProducts();
  const productToDelete = products.find((item) => item.id === productId);
  if (!productToDelete) {
    res.status(404).json({ message: "Produit introuvable." });
    return;
  }
  const nextProducts = products.filter((item) => item.id !== productId);
  writeProducts(nextProducts);
  res.json({ ok: true });
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
