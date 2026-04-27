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
const catalogueSection = document.getElementById("catalogue");
const categoryBanners = document.querySelectorAll(".category-banner");
const adminOrdersPanel = document.getElementById("admin-orders-panel");
const adminOrdersList = document.getElementById("admin-orders-list");
const adminProductsPanel = document.getElementById("admin-products-panel");
const adminProductsList = document.getElementById("admin-products-list");

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

function getGenderGroupLabel(product) {
  const source = `${product.name || ""} ${product.line || ""}`.toLowerCase();
  if (product.target === "marie") return "Homme";
  if (product.target === "mariee" || product.target === "femme_honneur") return "Femme";
  if (source.includes("homme") || source.includes("marié")) return "Homme";
  if (source.includes("femme") || source.includes("mariée") || source.includes("mariee")) {
    return "Femme";
  }
  return "Mixte";
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

  if (filtered.length === 0) {
    productsGrid.innerHTML = `
      <article class="product-card">
        <div class="product-meta">
          <h4>Aucun produit disponible ici</h4>
        </div>
        <p class="description">Essayez "Tout voir" ou choisissez une autre catégorie.</p>
      </article>`;
    return;
  }

  const groups = new Map();
  filtered.forEach((product) => {
    const styleLabel = formatStyleLabel(product.style);
    const genderLabel = getGenderGroupLabel(product);
    const lineLabel = product.line || "Collection générale";
    const key = `${styleLabel}|||${genderLabel}|||${lineLabel}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(product);
  });

  productsGrid.innerHTML = [...groups.entries()]
    .map(([key, groupProducts]) => {
      const [styleLabel, genderLabel, lineLabel] = key.split("|||");
      return `
      <section class="catalog-group">
        <div class="catalog-group-head">
          <h4>${styleLabel} - ${genderLabel}</h4>
          <p>Sous-catégorie: ${lineLabel}</p>
        </div>
        <div class="catalog-group-grid">
          ${groupProducts
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
                Commander sur WhatsApp
              </button>
            </article>`
            )
            .join("")}
        </div>
      </section>`;
    })
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

function setFilter(filterValue, shouldScrollToCatalogue = false) {
  const targetButton = [...filterButtons].find(
    (button) => button.dataset.filter === filterValue
  );
  if (!targetButton) return;

  filterButtons.forEach((button) => button.classList.remove("active"));
  targetButton.classList.add("active");
  activeFilter = filterValue;
  renderProducts();

  if (shouldScrollToCatalogue) {
    catalogueSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    setFilter(btn.dataset.filter);
  });
});

categoryBanners.forEach((banner) => {
  banner.addEventListener("click", () => {
    setFilter(banner.dataset.filter, true);
  });
});

function hasAdminPageAccess() {
  const url = new URL(window.location.href);
  return url.searchParams.get(ADMIN_QUERY_KEY) === "1";
}

function setAdminVisibility() {
  if (!hasAdminPageAccess()) {
    adminSection.classList.add("hidden");
    adminOrdersPanel.classList.add("hidden");
    adminProductsPanel.classList.add("hidden");
    return;
  }
  adminSection.classList.remove("hidden");
  if (isAdminAuthenticated) {
    adminLoginForm.classList.add("hidden");
    adminForm.classList.remove("hidden");
    adminOrdersPanel.classList.remove("hidden");
    adminProductsPanel.classList.remove("hidden");
  } else {
    adminLoginForm.classList.remove("hidden");
    adminForm.classList.add("hidden");
    adminOrdersPanel.classList.add("hidden");
    adminProductsPanel.classList.add("hidden");
  }
}

async function fetchOrders() {
  const response = await fetch("/api/orders", { credentials: "include" });
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data.orders) ? data.orders : [];
}

function renderOrders(orders) {
  if (!orders.length) {
    adminOrdersList.innerHTML =
      '<p class="input-help">Aucune commande pour le moment.</p>';
    return;
  }

  adminOrdersList.innerHTML = orders
    .map((order) => {
      const paymentLabel = order.payment === "mvola" ? "Mvola" : "Cash";
      const dateLabel = new Date(order.createdAt).toLocaleString("fr-FR");
      return `
        <article class="order-card">
          <p><strong>Client:</strong> ${order.name}</p>
          <p><strong>Pays:</strong> ${order.country}</p>
          <p><strong>Téléphone:</strong> ${order.phone}</p>
          <p><strong>Paiement:</strong> ${paymentLabel}</p>
          <p><strong>Adresse:</strong> ${order.address}</p>
          <p><strong>Détails:</strong> ${order.notes || "Aucun"}</p>
          <p><strong>Reçu le:</strong> ${dateLabel}</p>
        </article>`;
    })
    .join("");
}

async function refreshAdminOrders() {
  if (!hasAdminPageAccess() || !isAdminAuthenticated) return;
  const orders = await fetchOrders();
  renderOrders(orders);
}

function renderAdminProducts() {
  if (!products.length) {
    adminProductsList.innerHTML =
      '<p class="input-help">Aucun produit disponible.</p>';
    return;
  }
  adminProductsList.innerHTML = products
    .map(
      (product) => `
        <article class="order-card">
          <p><strong>${product.name}</strong> - ${product.price} €</p>
          <p>${formatStyleLabel(product.style)} • ${formatCategoryLabel(
        product.category
      )} • ${product.line} • ${getGenderGroupLabel(product)}</p>
          <button class="btn ghost admin-delete-product-btn" data-id="${product.id}">
            Supprimer ce produit
          </button>
        </article>`
    )
    .join("");

  document.querySelectorAll(".admin-delete-product-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const confirmed = window.confirm("Confirmer la suppression de ce produit ?");
      if (!confirmed) return;
      const response = await fetch(`/api/products/${btn.dataset.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        alert("Suppression impossible.");
        return;
      }
      products = await fetchProducts();
      renderProducts();
      renderAdminProducts();
      alert("Produit supprimé avec succès.");
    });
  });
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
  await refreshAdminOrders();
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

  if (!name || !price) {
    alert("Merci de remplir au minimum le nom et le prix.");
    return;
  }

  if (!imageUrl && !imageFile) {
    alert("Ajoute un lien photo ou choisis une image.");
    return;
  }

  const finalTarget =
    !target || target === "auto" ? detectTargetAudience(name, line) : target;

  const payload = new FormData();
  payload.append("name", name);
  payload.append("category", category);
  payload.append("style", style);
  payload.append("target", finalTarget);
  if (line) payload.append("line", line);
  payload.append("price", String(price));
  payload.append("description", getAutoDescription(`${name} (${line})`, category, finalTarget));
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
  renderAdminProducts();
  adminForm.reset();
  alert("Produit ajouté et classé automatiquement.");
});

orderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.getElementById("client-name").value.trim();
  const country = document.getElementById("client-country").value.trim();
  const phone = document.getElementById("client-phone").value.trim();
  const payment = document.getElementById("client-payment").value;
  const address = document.getElementById("client-address").value.trim();
  const notes = document.getElementById("client-notes").value.trim();

  const response = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, country, phone, payment, address, notes }),
  });

  if (!response.ok) {
    alert("Impossible d'envoyer la commande. Réessaie.");
    return;
  }

  alert("Commande envoyée. Merci, nous vous contacterons rapidement.");
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
  adminOrdersList.innerHTML = "";
  adminProductsList.innerHTML = "";
});

async function init() {
  products = await fetchProducts();
  renderProducts();
  isAdminAuthenticated = await checkAdminSession();
  setAdminVisibility();
  await refreshAdminOrders();
  renderAdminProducts();
}

init();
