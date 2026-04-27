const WHATSAPP_NUMBER = "905348439206";
const ADMIN_QUERY_KEY = "admin";
const productsGrid = document.getElementById("products-grid");
const filterButtons = document.querySelectorAll(".filter-btn");
const adminForm = document.getElementById("admin-form");
const adminLoginForm = document.getElementById("admin-login-form");
const adminLoginMessage = document.getElementById("admin-login-message");
const orderForm = document.getElementById("order-form");
const adminSection = document.getElementById("admin");
const adminLogoutBtn = document.getElementById("admin-logout-btn");

let products = [];
let activeFilter = "all";
let isAdminAuthenticated = false;

function formatCategoryLabel(category) {
  if (category === "vetement") return "Vêtement";
  if (category === "chaussure") return "Chaussure";
  return "Accessoire";
}

function formatStyleLabel(style) {
  return style === "moderne" ? "Moderne" : "Traditionnel";
}

function formatTargetLabel(target) {
  if (target === "mariee") return "Mariée";
  if (target === "marie") return "Marié";
  if (target === "invite") return "Invité(e)";
  if (target === "femme_honneur") return "Femme d'honneur";
  if (target === "famille") return "Famille";
  return "Public mariage";
}

function detectTargetAudience(name, line) {
  const source = `${name} ${line}`.toLowerCase();
  if (source.includes("mariée") || source.includes("mariee")) return "mariee";
  if (source.includes("marié") || source.includes("marie ")) return "marie";
  if (source.includes("femme d'honneur") || source.includes("demoiselle")) {
    return "femme_honneur";
  }
  if (source.includes("famille")) return "famille";
  return "invite";
}

function getAutoDescription(productName, category, target) {
  const categoryLabel =
    category === "vetement"
      ? "vêtement"
      : category === "chaussure"
      ? "chaussure"
      : "accessoire";
  const targetLabel = formatTargetLabel(target);
  return `${productName} est un ${categoryLabel} de mariage comorien conçu pour ${targetLabel}, avec une finition élégante et une qualité premium.`;
}

function normalizeProduct(product) {
  return {
    ...product,
    category: product.category || "vetement",
    style: product.style || "traditionnel",
    target: product.target || detectTargetAudience(product.name || "", product.line || ""),
    line: product.line || "Collection générale",
  };
}

async function fetchProducts() {
  const response = await fetch("/api/products");
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data.products) ? data.products.map(normalizeProduct) : [];
}

function renderProducts() {
  const filtered =
    activeFilter === "all"
      ? products
      : products.filter((p) =>
          activeFilter === "traditionnel" || activeFilter === "moderne"
            ? p.style === activeFilter
            : p.category === activeFilter
        );

  productsGrid.innerHTML = filtered
    .map(
      (p) => `
      <article class="product-card">
        <img src="${p.image}" alt="${p.name}" />
        <div class="product-meta">
          <h4>${p.name}</h4>
          <span class="price">${p.price} €</span>
        </div>
        <p class="category-tag">
          ${formatCategoryLabel(p.category)} • ${formatStyleLabel(
            p.style
          )} • ${p.line} • ${formatTargetLabel(p.target)}
        </p>
        <p class="description">${p.description}</p>
        <button class="btn ghost order-now-btn" data-id="${p.id}">
          Commander ce produit
        </button>
      </article>`
    )
    .join("");

  document.querySelectorAll(".order-now-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const product = products.find((p) => p.id === btn.dataset.id);
      if (!product) return;
      const text = `Bonjour NIKKAH GLAM, je veux commander: ${product.name} (${product.price} €).`;
      const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank");
    });
  });
}

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeFilter = btn.dataset.filter;
    renderProducts();
  });
});

function hasAdminPageAccess() {
  const url = new URL(window.location.href);
  return url.searchParams.get(ADMIN_QUERY_KEY) === "1";
}

function setAdminVisibility() {
  if (!hasAdminPageAccess()) {
    adminSection.classList.add("hidden");
    return;
  }
  adminSection.classList.remove("hidden");
  if (isAdminAuthenticated) {
    adminLoginForm.classList.add("hidden");
    adminForm.classList.remove("hidden");
  } else {
    adminLoginForm.classList.remove("hidden");
    adminForm.classList.add("hidden");
  }
}

async function checkAdminSession() {
  const response = await fetch("/api/admin/session", { credentials: "include" });
  if (!response.ok) return false;
  const data = await response.json();
  return data.authenticated === true;
}

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = document.getElementById("admin-password").value;
  adminLoginMessage.textContent = "";
  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    adminLoginMessage.textContent = data.message || "Connexion refusée.";
    return;
  }
  adminLoginForm.reset();
  isAdminAuthenticated = true;
  setAdminVisibility();
});

adminForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.getElementById("admin-product-name").value.trim();
  const category = document.getElementById("admin-category").value;
  const style = document.getElementById("admin-style").value;
  const target = document.getElementById("admin-target").value;
  const line = document.getElementById("admin-line").value.trim();
  const price = Number(document.getElementById("admin-price").value);
  const imageUrl = document.getElementById("admin-image").value.trim();
  const imageFileInput = document.getElementById("admin-image-file");
  const imageFile = imageFileInput.files[0];

  if (!name || !category || !style || !target || !line || !price) {
    alert("Merci de remplir tous les champs.");
    return;
  }

  if (!imageUrl && !imageFile) {
    alert("Ajoute un lien photo ou choisis une image.");
    return;
  }

  const finalTarget =
    target === "auto" ? detectTargetAudience(name, line) : target;

  const payload = new FormData();
  payload.append("name", name);
  payload.append("category", category);
  payload.append("style", style);
  payload.append("target", finalTarget);
  payload.append("line", line);
  payload.append("price", String(price));
  payload.append(
    "description",
    getAutoDescription(`${name} (${line})`, category, finalTarget)
  );
  if (imageFile) {
    payload.append("imageFile", imageFile);
  } else {
    payload.append("imageUrl", imageUrl);
  }

  const response = await fetch("/api/products", {
    method: "POST",
    credentials: "include",
    body: payload,
  });

  if (!response.ok) {
    alert("Ajout refusé. Vérifie la session admin.");
    return;
  }

  products = await fetchProducts();
  renderProducts();
  adminForm.reset();
  alert("Produit ajouté avec succès.");
});

orderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.getElementById("client-name").value.trim();
  const country = document.getElementById("client-country").value.trim();
  const phone = document.getElementById("client-phone").value.trim();
  const payment = document.getElementById("client-payment").value;
  const address = document.getElementById("client-address").value.trim();
  const notes = document.getElementById("client-notes").value.trim();

  const message = `
Nouvelle commande NIKKAH GLAM
Nom: ${name}
Pays: ${country}
Téléphone: ${phone}
Paiement: ${payment === "mvola" ? "Mvola" : "Cash"}
Adresse: ${address}
Détails: ${notes || "Aucun"}
  `.trim();

  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    message
  )}`;
  window.open(whatsappUrl, "_blank");

  alert("Commande préparée. Confirmez l'envoi sur WhatsApp.");
  orderForm.reset();
});

document.getElementById("year").textContent = new Date().getFullYear();
adminLogoutBtn.addEventListener("click", async () => {
  await fetch("/api/admin/logout", {
    method: "POST",
    credentials: "include",
  });
  isAdminAuthenticated = false;
  setAdminVisibility();
});

async function init() {
  products = await fetchProducts();
  renderProducts();
  isAdminAuthenticated = await checkAdminSession();
  setAdminVisibility();
}

init();
