const STORAGE_KEY = "budgetwise-pwa-data-v1";
const SETTINGS_KEY = "budgetwise-pwa-settings-v1";
const ROWS_PER_PAGE = 20;

const palette = ["#22c55e", "#14b8a6", "#f59e0b", "#6366f1", "#3b82f6", "#ec4899", "#84cc16", "#06b6d4"];

const defaultData = {
  categories: [],
  transactions: []
};

defaultData.transactions = seedTransactions(defaultData.categories);

const defaultSettings = {
  scriptUrl: "",
  token: "",
  lastSync: "",
  theme: "light",
  syncStatus: "Local only",
  autoSync: true
};

let state = loadData();
sanitizeData();
let settings = loadSettings();
let currentPage = "dashboard";
let dashboardPeriod = "daily";
let transactionPage = 1;
let deferredInstallPrompt = null;
let autoSyncTimer = null;

const pageTitles = {
  dashboard: "Dashboard",
  categories: "Categories",
  transactions: "Transactions",
  settings: "Settings"
};

function seedTransactions(categories) {
  const find = name => categories.find(category => category.name === name)?.id;
  const today = new Date();
  const iso = daysAgo => {
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    return toISODate(date);
  };

  return [];
}

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.categories) || !Array.isArray(saved.transactions)) {
      return structuredClone(defaultData);
    }
    return saved;
  } catch {
    return structuredClone(defaultData);
  }
}

function sanitizeData() {
  state.categories = Array.isArray(state.categories) ? state.categories.filter(category => category && category.id && category.name) : [];
  state.transactions = Array.isArray(state.transactions)
    ? state.transactions
        .map(transaction => ({
          ...transaction,
          date: normalizeISODate(transaction.date),
          amount: Number(transaction.amount || 0)
        }))
        .filter(transaction => transaction.id && transaction.date && transaction.categoryId && Number.isFinite(transaction.amount))
    : [];
}

function saveData(options = {}) {
  const { autoSync = true } = options;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();

  if (autoSync) {
    scheduleAutoSync();
  }
}

function loadSettings() {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) };
  } catch {
    return { ...defaultSettings };
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  applySettingsToUI();
}

function isSafeDate(date) {
  if (!(date instanceof Date)) return false;
  const time = date.getTime();
  if (!Number.isFinite(time)) return false;
  const year = date.getFullYear();
  return year >= 2000 && year <= 2100;
}

function makeDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(year, month - 1, day);
  if (!isSafeDate(parsed)) return null;
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed;
}

function parseAppDate(dateValue) {
  if (dateValue === null || dateValue === undefined || dateValue === "") return null;

  if (dateValue instanceof Date) {
    return isSafeDate(dateValue) ? dateValue : null;
  }

  // Google Sheets sometimes returns serial date numbers. Example: 46174 = 2026-06-01.
  if (typeof dateValue === "number" && Number.isFinite(dateValue)) {
    if (dateValue > 30000 && dateValue < 80000) {
      const parsed = new Date(Math.round((dateValue - 25569) * 86400 * 1000));
      return isSafeDate(parsed) ? parsed : null;
    }
    return null;
  }

  const text = String(dateValue).trim();
  if (!text) return null;

  // Normal app date format from <input type="date">: 2026-06-01
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return makeDate(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  // Accept Sheet display dates like 01/06/2026 as day/month/year.
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    return makeDate(Number(match[3]), Number(match[2]), Number(match[1]));
  }

  // Fallback for ISO strings such as 2026-06-01T00:00:00.000Z.
  const parsed = new Date(text);
  return isSafeDate(parsed) ? parsed : null;
}

function getDateTime(dateValue) {
  const parsed = parseAppDate(dateValue);
  return parsed ? parsed.getTime() : 0;
}

function normalizeISODate(dateValue) {
  const parsed = parseAppDate(dateValue);
  if (!parsed) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toISODate(dateValue) {
  return normalizeISODate(dateValue) || normalizeISODate(new Date());
}

function formatDateTimeNow() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${toISODate(now)} ${hours}:${minutes}:${seconds}`;
}

function money(value) {
  const sign = value < 0 ? "−" : "";
  const amount = Math.abs(value).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}AED ${amount}`;
}

function getCategory(categoryId) {
  return state.categories.find(category => category.id === categoryId) || { name: "Uncategorized", type: "Deduct", budget: 0 };
}

function signedAmount(transaction) {
  const category = getCategory(transaction.categoryId);
  return category.type === "Add" ? Number(transaction.amount) : -Number(transaction.amount);
}

function isInPeriod(dateString, period) {
  const date = parseAppDate(dateString);
  if (!date) return false;

  const now = new Date();

  if (period === "daily") {
    return toISODate(date) === toISODate(now);
  }

  if (period === "monthly") {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }

  return date.getFullYear() === now.getFullYear();
}

function periodLabel(period) {
  if (period === "daily") return "Today";
  if (period === "monthly") return "This Month";
  return "This Year";
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function showPage(page) {
  currentPage = page;
  document.querySelectorAll(".page").forEach(section => section.classList.toggle("active-page", section.id === page));
  document.querySelectorAll(".nav-link, .mobile-nav-link").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  document.getElementById("page-title").textContent = pageTitles[page];
}

function getPeriodTransactions() {
  return state.transactions.filter(transaction => isInPeriod(transaction.date, dashboardPeriod));
}

function renderDashboard() {
  const allBalance = state.transactions.reduce((sum, transaction) => sum + signedAmount(transaction), 0);
  const periodTransactions = getPeriodTransactions();
  const income = periodTransactions
    .filter(transaction => signedAmount(transaction) > 0)
    .reduce((sum, transaction) => sum + signedAmount(transaction), 0);
  const deducted = Math.abs(periodTransactions
    .filter(transaction => signedAmount(transaction) < 0)
    .reduce((sum, transaction) => sum + signedAmount(transaction), 0));

  document.getElementById("current-balance").textContent = money(allBalance);
  document.getElementById("period-income").textContent = money(income);
  document.getElementById("period-deducted").textContent = money(-deducted);
  document.getElementById("income-title").textContent = `Total Income ${periodLabel(dashboardPeriod)}`;
  document.getElementById("deduct-title").textContent = `Total Deducted ${periodLabel(dashboardPeriod)}`;
  document.getElementById("overview-period-badge").textContent = periodLabel(dashboardPeriod);
  document.getElementById("donut-total").textContent = money(deducted).replace(".00", "");

  renderCategoryBreakdown(periodTransactions, deducted);
  renderBudgetProgress(periodTransactions);
}

function renderCategoryBreakdown(periodTransactions, deducted) {
  const expenseCategories = state.categories.filter(category => category.type === "Deduct");
  const totals = expenseCategories.map((category, index) => {
    const total = periodTransactions
      .filter(transaction => transaction.categoryId === category.id)
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    return { ...category, total, color: palette[index % palette.length] };
  }).filter(item => item.total > 0);

  const breakdown = document.getElementById("category-breakdown");
  const donut = document.getElementById("donut-chart");

  if (totals.length === 0 || deducted === 0) {
    breakdown.innerHTML = `<div class="empty-state">No deducted transactions for this period yet.</div>`;
    donut.style.background = "conic-gradient(#dfe8e3 0 100%)";
    return;
  }

  let current = 0;
  const gradientParts = totals.map(item => {
    const start = current;
    const degrees = (item.total / deducted) * 360;
    current += degrees;
    return `${item.color} ${start}deg ${current}deg`;
  });
  donut.style.background = `conic-gradient(${gradientParts.join(", ")})`;

  breakdown.innerHTML = totals.map(item => {
    const percent = deducted ? (item.total / deducted) * 100 : 0;
    return `
      <div class="breakdown-row">
        <div class="breakdown-top">
          <span><span class="color-dot" style="background:${item.color}"></span>${escapeHTML(item.name)}</span>
          <strong>${money(item.total)} • ${percent.toFixed(1)}%</strong>
        </div>
        <div class="bar"><div class="bar-fill" style="width:${Math.min(percent, 100)}%; background:${item.color}"></div></div>
      </div>
    `;
  }).join("");
}

function renderBudgetProgress(periodTransactions) {
  const list = document.getElementById("budget-progress-list");
  const items = state.categories
    .filter(category => category.type === "Deduct" && Number(category.budget) > 0)
    .map(category => {
      const spent = periodTransactions
        .filter(transaction => transaction.categoryId === category.id)
        .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
      const percent = (spent / Number(category.budget)) * 100;
      return { ...category, spent, percent };
    });

  if (items.length === 0) {
    list.innerHTML = `<div class="empty-state">Add budget limits to categories to see progress.</div>`;
    return;
  }

  list.innerHTML = items.map(item => `
    <div class="progress-row">
      <div class="progress-top">
        <span>${escapeHTML(item.name)}</span>
        <strong>${money(item.spent)} / ${money(Number(item.budget))}</strong>
      </div>
      <div class="bar"><div class="bar-fill" style="width:${Math.min(item.percent, 100)}%; background:${item.percent > 100 ? "var(--danger)" : "var(--primary)"}"></div></div>
    </div>
  `).join("");
}

function renderCategorySelect() {
  const select = document.getElementById("transaction-category");
  select.innerHTML = state.categories.map(category => `
    <option value="${category.id}">${escapeHTML(category.name)} (${category.type})</option>
  `).join("");
}

function renderCategories() {
  const list = document.getElementById("category-list");
  if (state.categories.length === 0) {
    list.innerHTML = `<div class="empty-state">No categories yet. Add your first category.</div>`;
    return;
  }

  list.innerHTML = state.categories.map(category => `
    <div class="category-row">
      <div class="category-row-main">
        <div class="category-icon">${category.type === "Add" ? "+" : "−"}</div>
        <div>
          <strong>${escapeHTML(category.name)}</strong>
          <p>${category.type === "Add" ? "Adds to balance" : "Deducts from balance"} • Budget: ${money(Number(category.budget || 0))}</p>
        </div>
      </div>
      <div class="category-actions">
        <button class="icon-btn" type="button" title="Edit" onclick="editCategory('${category.id}')">✎</button>
        <button class="icon-btn danger" type="button" title="Delete" onclick="deleteCategory('${category.id}')">🗑</button>
      </div>
    </div>
  `).join("");
}

function editCategory(id) {
  const category = state.categories.find(item => item.id === id);
  if (!category) return;
  document.getElementById("category-id").value = category.id;
  document.getElementById("category-name").value = category.name;
  document.getElementById("category-type").value = category.type;
  document.getElementById("category-budget").value = category.budget || "";
  document.getElementById("category-form-title").textContent = "Edit Category";
  document.getElementById("save-category-btn").textContent = "Update Category";
  document.getElementById("cancel-category-edit").hidden = false;
  showPage("categories");
}

function resetCategoryForm() {
  document.getElementById("category-form").reset();
  document.getElementById("category-id").value = "";
  document.getElementById("category-form-title").textContent = "Add Category";
  document.getElementById("save-category-btn").textContent = "Add Category";
  document.getElementById("cancel-category-edit").hidden = true;
}

function deleteCategory(id) {
  const used = state.transactions.some(transaction => transaction.categoryId === id);
  if (used) {
    showToast("This category is already used in transactions. Delete or change those transactions first.");
    return;
  }
  if (!confirm("Delete this category? This will auto-sync if Google Sheets is connected.")) return;
  state.categories = state.categories.filter(category => category.id !== id);
  saveData();
  showToast(settings.autoSync && settings.scriptUrl ? "Category deleted. Auto-syncing..." : "Category deleted.");
}

function handleCategorySubmit(event) {
  event.preventDefault();
  const id = document.getElementById("category-id").value;
  const name = document.getElementById("category-name").value.trim();
  const type = document.getElementById("category-type").value;
  const budget = Number(document.getElementById("category-budget").value || 0);

  if (!name) return showToast("Please enter a category name.");

  const duplicate = state.categories.some(category => category.name.toLowerCase() === name.toLowerCase() && category.id !== id);
  if (duplicate) return showToast("This category name already exists.");

  if (id) {
    state.categories = state.categories.map(category => category.id === id ? { ...category, name, type, budget } : category);
    showToast("Category updated.");
  } else {
    state.categories.push({ id: crypto.randomUUID(), name, type, budget });
    showToast("Category added.");
  }

  resetCategoryForm();
  saveData();
}

function handleTransactionSubmit(event) {
  event.preventDefault();
  const id = document.getElementById("transaction-id").value;
  const date = document.getElementById("transaction-date").value;
  const description = document.getElementById("transaction-description").value.trim();
  const categoryId = document.getElementById("transaction-category").value;
  const amount = Number(document.getElementById("transaction-amount").value);

  if (!date || !description || !categoryId || amount <= 0) {
    return showToast("Please complete the transaction form.");
  }

  if (id) {
    state.transactions = state.transactions.map(transaction =>
      transaction.id === id ? { ...transaction, date, description, categoryId, amount } : transaction
    );
    showToast(settings.autoSync && settings.scriptUrl ? "Transaction updated. Auto-syncing..." : "Transaction updated.");
  } else {
    state.transactions.unshift({
      id: crypto.randomUUID(),
      date,
      description,
      categoryId,
      amount
    });
    showToast(settings.autoSync && settings.scriptUrl ? "Transaction saved. Auto-syncing..." : "Transaction saved.");
  }

  resetTransactionForm();
  transactionPage = 1;
  saveData();
}

function getFilteredTransactions() {
  const query = document.getElementById("transaction-search")?.value.trim().toLowerCase() || "";
  return [...state.transactions]
    .sort((a, b) => getDateTime(b.date) - getDateTime(a.date))
    .filter(transaction => {
      const category = getCategory(transaction.categoryId);
      const searchable = `${transaction.date} ${transaction.description} ${category.name} ${category.type} ${transaction.amount}`.toLowerCase();
      return searchable.includes(query);
    });
}

function renderTransactions() {
  const tbody = document.getElementById("transaction-table-body");
  const filtered = getFilteredTransactions();
  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  if (transactionPage > totalPages) transactionPage = totalPages;
  const start = (transactionPage - 1) * ROWS_PER_PAGE;
  const pageRows = filtered.slice(start, start + ROWS_PER_PAGE);

  document.getElementById("transaction-count-label").textContent = `Showing ${pageRows.length ? start + 1 : 0} to ${Math.min(start + ROWS_PER_PAGE, filtered.length)} of ${filtered.length} transactions`;

  if (pageRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">No transactions found.</div></td></tr>`;
  } else {
    tbody.innerHTML = pageRows.map(transaction => {
      const category = getCategory(transaction.categoryId);
      const signed = signedAmount(transaction);
      return `
        <tr>
          <td>${formatDate(transaction.date)}</td>
          <td><strong>${escapeHTML(transaction.description)}</strong></td>
          <td>${escapeHTML(category.name)}</td>
          <td><span class="type-pill ${category.type === "Add" ? "type-add" : "type-deduct"}">${category.type}</span></td>
          <td class="${signed >= 0 ? "amount-add" : "amount-deduct"}">${money(signed)}</td>
          <td>
            <div class="table-actions">
              <button class="icon-btn" type="button" title="Edit" onclick="editTransaction('${transaction.id}')">✎</button>
              <button class="icon-btn danger" type="button" title="Delete" onclick="deleteTransaction('${transaction.id}')">🗑</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const pagination = document.getElementById("pagination");
  const buttons = [];
  buttons.push(`<button type="button" ${transactionPage === 1 ? "disabled" : ""} onclick="changeTransactionPage(${transactionPage - 1})">‹</button>`);

  const maxButtons = 5;
  let start = Math.max(1, transactionPage - 2);
  let end = Math.min(totalPages, start + maxButtons - 1);
  start = Math.max(1, end - maxButtons + 1);

  for (let page = start; page <= end; page++) {
    buttons.push(`<button type="button" class="${page === transactionPage ? "active" : ""}" onclick="changeTransactionPage(${page})">${page}</button>`);
  }

  buttons.push(`<button type="button" ${transactionPage === totalPages ? "disabled" : ""} onclick="changeTransactionPage(${transactionPage + 1})">›</button>`);
  pagination.innerHTML = buttons.join("");
}

function changeTransactionPage(page) {
  transactionPage = page;
  renderTransactions();
}

function editTransaction(id) {
  const transaction = state.transactions.find(item => item.id === id);
  if (!transaction) return;

  document.getElementById("transaction-id").value = transaction.id;
  document.getElementById("transaction-date").value = transaction.date;
  document.getElementById("transaction-description").value = transaction.description;
  document.getElementById("transaction-category").value = transaction.categoryId;
  document.getElementById("transaction-amount").value = transaction.amount;
  document.getElementById("transaction-form-title").textContent = "Edit Transaction";
  document.getElementById("save-transaction-btn").textContent = "Update Transaction";
  document.getElementById("cancel-transaction-edit").hidden = false;
  showPage("transactions");
  document.getElementById("transaction-description").focus();
}

function resetTransactionForm() {
  document.getElementById("transaction-form").reset();
  document.getElementById("transaction-id").value = "";
  document.getElementById("transaction-date").value = toISODate(new Date());
  document.getElementById("transaction-form-title").textContent = "Add Transaction";
  document.getElementById("save-transaction-btn").textContent = "Save Transaction";
  document.getElementById("cancel-transaction-edit").hidden = true;
}

function deleteTransaction(id) {
  if (!confirm("Delete this transaction? This will auto-sync if Google Sheets is connected.")) return;
  state.transactions = state.transactions.filter(transaction => transaction.id !== id);
  saveData();
  showToast(settings.autoSync && settings.scriptUrl ? "Transaction deleted. Auto-syncing..." : "Transaction deleted.");
}

function formatDate(dateString) {
  const date = parseAppDate(dateString);
  if (!date) return "No date";

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[date.getMonth()] || "";
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month} ${day}, ${year}`;
}

function renderSettings() {
  document.getElementById("script-url").value = settings.scriptUrl || "";
  document.getElementById("script-token").value = settings.token || "";
  const autoSyncToggle = document.getElementById("auto-sync-toggle");
  if (autoSyncToggle) autoSyncToggle.checked = settings.autoSync !== false;
  document.getElementById("sync-status-badge").textContent = settings.syncStatus || "Local only";
  document.getElementById("last-sync-text").textContent = settings.lastSync ? `Last sync: ${settings.lastSync}` : "Last sync: Not yet synced";
}

function applySettingsToUI() {
  document.body.classList.toggle("dark", settings.theme === "dark");
  renderSettings();
  const dot = document.getElementById("sidebar-sync-dot");
  const title = document.getElementById("sidebar-sync-title");
  const subtitle = document.getElementById("sidebar-sync-subtitle");
  const synced = settings.syncStatus?.toLowerCase().includes("synced");
  dot.classList.toggle("synced", synced);
  title.textContent = synced ? "Sheets synced" : "Local mode";
  subtitle.textContent = settings.lastSync || "Data saved on this device";
}

function handleSaveSettings(options = {}) {
  const { silent = false } = options;
  settings.scriptUrl = document.getElementById("script-url").value.trim();
  settings.token = document.getElementById("script-token").value.trim();
  const autoSyncToggle = document.getElementById("auto-sync-toggle");
  if (autoSyncToggle) settings.autoSync = autoSyncToggle.checked;
  saveSettings();
  if (!silent) showToast("Settings saved.");
}

function scheduleAutoSync() {
  if (settings.autoSync === false || !settings.scriptUrl) return;

  window.clearTimeout(autoSyncTimer);

  if (!navigator.onLine) {
    settings.syncStatus = "Offline - pending sync";
    saveSettings();
    return;
  }

  settings.syncStatus = "Auto-sync pending";
  saveSettings();
  autoSyncTimer = window.setTimeout(() => syncToSheets({ auto: true, readSettingsFromForm: false }), 900);
}

async function syncToSheets(options = {}) {
  const { auto = false, readSettingsFromForm = true } = options;
  if (readSettingsFromForm) handleSaveSettings({ silent: true });
  if (!settings.scriptUrl) {
    if (!auto) showToast("Paste your Google Apps Script Web App URL first.");
    return;
  }

  const payload = {
    action: "syncAll",
    token: settings.token,
    data: state
  };

  try {
    await fetch(settings.scriptUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    settings.lastSync = formatDateTimeNow();
    settings.syncStatus = auto ? "Auto-synced to Google Sheets" : "Sent to Google Sheets";
    saveSettings();
    showToast(auto ? "Auto-synced to Google Sheets." : "Data was sent to Google Sheets. Check your spreadsheet to confirm.");
  } catch (error) {
    settings.syncStatus = auto ? "Auto-sync failed" : "Sync failed";
    saveSettings();
    showToast(auto ? "Auto-sync failed. Check your Apps Script setup." : "Sync failed. Check the Apps Script URL.");
  }
}

function loadFromSheets() {
  if (!confirm("Load data from Google Sheets? This will replace the data currently saved in this browser.")) return;
  handleSaveSettings({ silent: true });
  if (!settings.scriptUrl) return showToast("Paste your Google Apps Script Web App URL first.");

  const callbackName = `budgetwiseCallback_${Date.now()}`;
  const script = document.createElement("script");
  const url = new URL(settings.scriptUrl);
  url.searchParams.set("action", "getAll");
  url.searchParams.set("callback", callbackName);
  if (settings.token) url.searchParams.set("token", settings.token);

  window[callbackName] = response => {
    try {
      if (!response.ok) throw new Error(response.error || "Unable to load data.");
      if (response.data?.categories && response.data?.transactions) {
        state = response.data;
        sanitizeData();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        settings.lastSync = formatDateTimeNow();
        settings.syncStatus = "Google Sheets Synced";
        saveSettings();
        renderAll();
        showToast("Loaded data from Google Sheets.");
      } else {
        showToast("No valid data found in Google Sheets.");
      }
    } catch (error) {
      showToast(error.message);
    } finally {
      delete window[callbackName];
      script.remove();
    }
  };

  script.onerror = () => {
    delete window[callbackName];
    script.remove();
    showToast("Could not load from Google Sheets.");
  };

  script.src = url.toString();
  document.body.appendChild(script);
}

function exportJSON() {
  const blob = new Blob([JSON.stringify({ state, settings: { ...settings, token: "" } }, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `budgetwise-backup-${toISODate(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function importJSON(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      const importedState = imported.state || imported;
      if (!Array.isArray(importedState.categories) || !Array.isArray(importedState.transactions)) {
        throw new Error("Invalid backup file.");
      }
      state = importedState;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      renderAll();
      showToast("Backup imported.");
    } catch (error) {
      showToast(error.message);
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function clearData() {
  if (!confirm("This will clear all local data and restore sample data. Continue?")) return;
  state = structuredClone(defaultData);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
  showToast("Local data reset.");
}

function toggleTheme() {
  settings.theme = settings.theme === "dark" ? "light" : "dark";
  saveSettings();
  showToast(`Theme changed to ${settings.theme}.`);
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderAll() {
  renderDashboard();
  renderCategorySelect();
  renderCategories();
  renderTransactions();
  renderSettings();
  applySettingsToUI();
}

function bindEvents() {
  let lastTouchNavigation = 0;

  function handleNavigation(event) {
    if (event.type === "touchend") {
      event.preventDefault();
      lastTouchNavigation = Date.now();
    }

    if (event.type === "click" && Date.now() - lastTouchNavigation < 450) {
      return;
    }

    const page = event.currentTarget.dataset.page;
    if (page) {
      showPage(page);
    }
  }

  document.querySelectorAll(".nav-link, .mobile-nav-link").forEach(button => {
    button.addEventListener("touchend", handleNavigation, { passive: false });
    button.addEventListener("click", handleNavigation);
  });

  document.querySelectorAll(".period-btn").forEach(button => {
    button.addEventListener("click", () => {
      dashboardPeriod = button.dataset.period;
      document.querySelectorAll(".period-btn").forEach(btn => btn.classList.toggle("active", btn === button));
      renderDashboard();
    });
  });

  document.getElementById("quick-add-btn").addEventListener("click", () => showPage("transactions"));
  document.getElementById("category-form").addEventListener("submit", handleCategorySubmit);
  document.getElementById("cancel-category-edit").addEventListener("click", resetCategoryForm);
  document.getElementById("transaction-form").addEventListener("submit", handleTransactionSubmit);
  document.getElementById("cancel-transaction-edit").addEventListener("click", resetTransactionForm);
  document.getElementById("transaction-search").addEventListener("input", () => {
    transactionPage = 1;
    renderTransactions();
  });

  document.getElementById("save-settings-btn").addEventListener("click", () => handleSaveSettings());
  document.getElementById("sync-to-sheets-btn").addEventListener("click", () => syncToSheets());
  document.getElementById("load-from-sheets-btn").addEventListener("click", loadFromSheets);
  document.getElementById("export-json-btn").addEventListener("click", exportJSON);
  document.getElementById("import-json-input").addEventListener("change", importJSON);
  document.getElementById("clear-data-btn").addEventListener("click", clearData);
  document.getElementById("toggle-theme-btn").addEventListener("click", toggleTheme);

  window.addEventListener("online", () => {
    if (settings.autoSync !== false && settings.scriptUrl) {
      showToast("Back online. Auto-syncing latest data...");
      scheduleAutoSync();
    }
  });

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    const installBtn = document.getElementById("install-btn");
    installBtn.hidden = false;
  });

  document.getElementById("install-btn").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.getElementById("install-btn").hidden = true;
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {
        console.warn("Service worker registration failed.");
      });
    });
  }
}

function init() {
  document.getElementById("transaction-date").value = toISODate(new Date());
  bindEvents();
  renderAll();
  registerServiceWorker();
}

init();
