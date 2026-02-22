document.addEventListener("DOMContentLoaded", () => {
  const DATA_URL = "data/products.json";
  const STORAGE_KEY = "tape_items_v1";

  const $ = (id) => document.getElementById(id);

  const els = {
    rows: $("rows"),
    stats: $("stats"),
    q: $("q"),
    fWidth: $("fWidth"),
    fCore: $("fCore"),
    fLen: $("fLen"),
    inStockOnly: $("inStockOnly"),
    sort: $("sort"),

    btnAdd: $("btnAdd"),
    btnImport: $("btnImport"),
    btnExport: $("btnExport"),
    btnReset: $("btnReset"),
    btnInstall: $("btnInstall"),
    fileJson: $("fileJson"),

    toast: $("toast"),

    modal: $("modal"),
    modalBackdrop: $("modalBackdrop"),
    mClose: $("mClose"),
    mCancel: $("mCancel"),
    addForm: $("addForm"),

    f_id: $("f_id"),
    f_title: $("f_title"),
    f_density: $("f_density"),
    f_width: $("f_width"),
    f_core: $("f_core"),
    f_len: $("f_len"),
    f_price: $("f_price"),
    f_old: $("f_old"),
    f_box: $("f_box"),
    f_pack: $("f_pack"),
    f_url: $("f_url"),
    f_stock: $("f_stock"),
  };

  let all = [];
  let viewItems = [];
  let dataSourceLabel = "—";

  // ===== PWA Install кнопка =====
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    els.btnInstall.hidden = false;
  });

  els.btnInstall.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    els.btnInstall.hidden = true;
  });

  // ===== Service Worker =====
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").then(() => {
      toast("PWA кеш увімкнено ✅ (offline після першого запуску)");
    }).catch(() => {
      toast("SW не запустився (перевір HTTPS)");
    });
  }

  const fmtUah = (n) =>
    (Number.isFinite(n) ? n : 0).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " грн";

  const discountPct = (price, oldPrice) => {
    const p = Number(price);
    const o = Number(oldPrice);
    if (!Number.isFinite(p) || !Number.isFinite(o) || o <= 0 || p >= o) return 0;
    return Math.round(((o - p) / o) * 10000) / 100;
  };

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (els.toast.hidden = true), 2200);
  }

  function saveToLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {}
  }

  function loadFromLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function specLabel(x) {
    const s = x.spec || {};
    const density = s.density_gsm ?? "—";
    const width = s.width_mm ?? "—";
    const core = s.core_mm ?? "—";
    const len = s.length_m ?? "—";
    return `${density} г/м² • ${width} мм • втулка ${core} мм • ${len} м`;
  }

  function uniqSorted(arr) {
    return [...new Set(arr)].sort((a, b) => Number(a) - Number(b));
  }

  function clearSelectToFirst(selectEl) {
    while (selectEl.options.length > 1) selectEl.remove(1);
  }

  function fillFilters(items) {
    clearSelectToFirst(els.fWidth);
    clearSelectToFirst(els.fCore);
    clearSelectToFirst(els.fLen);

    const widths = uniqSorted(items.map(x => x.spec?.width_mm).filter(v => Number.isFinite(Number(v))).map(Number));
    const cores  = uniqSorted(items.map(x => x.spec?.core_mm).filter(v => Number.isFinite(Number(v))).map(Number));
    const lens   = uniqSorted(items.map(x => x.spec?.length_m).filter(v => Number.isFinite(Number(v))).map(Number));

    for (const w of widths) els.fWidth.insertAdjacentHTML("beforeend", `<option value="${w}">${w} мм</option>`);
    for (const c of cores)  els.fCore.insertAdjacentHTML("beforeend", `<option value="${c}">${c} мм</option>`);
    for (const l of lens)   els.fLen.insertAdjacentHTML("beforeend", `<option value="${l}">${l} м</option>`);
  }

  function applySort(items) {
    const mode = els.sort.value;

    const get = {
      price: (x) => Number(x.price_uah) || 0,
      len:   (x) => Number(x.spec?.length_m) || 0,
      title: (x) => (x.title || "").toLowerCase(),
    };

    const dir = mode.endsWith("_desc") ? -1 : 1;
    const key = mode.startsWith("price") ? "price" : mode.startsWith("len") ? "len" : "title";

    return [...items].sort((a, b) => {
      const A = get[key](a);
      const B = get[key](b);
      if (A < B) return -1 * dir;
      if (A > B) return  1 * dir;
      return 0;
    });
  }

  function render(items) {
    if (!items.length) {
      els.rows.innerHTML = `<tr><td colspan="9" class="muted">Нічого не знайдено.</td></tr>`;
      els.stats.textContent = `0 / ${all.length} • джерело: ${dataSourceLabel}`;
      return;
    }

    const prices = items.map(x => Number(x.price_uah)).filter(n => Number.isFinite(n));
    const minP = prices.length ? Math.min(...prices) : 0;
    const maxP = prices.length ? Math.max(...prices) : 0;

    els.stats.textContent = `${items.length} / ${all.length} • ціна: ${fmtUah(minP)} — ${fmtUah(maxP)} • джерело: ${dataSourceLabel}`;

    els.rows.innerHTML = items.map(x => {
      const d = discountPct(x.price_uah, x.old_price_uah);
      const stockBadge = x.in_stock
        ? `<span class="badge ok">В наявності</span>`
        : `<span class="badge no">Немає</span>`;

      const titleHtml = x.url
        ? `<a href="${x.url}" target="_blank" rel="noopener">${x.title ?? "—"}</a>`
        : `${x.title ?? "—"}`;

      return `
        <tr>
          <td><code>${x.id ?? "—"}</code></td>
          <td>${titleHtml}</td>
          <td class="muted">${specLabel(x)}</td>
          <td class="num">${fmtUah(Number(x.price_uah))}</td>
          <td class="num">${x.old_price_uah ? fmtUah(Number(x.old_price_uah)) : "—"}</td>
          <td class="num">${d ? `${d}%` : "—"}</td>
          <td>${stockBadge}</td>
          <td class="num">${x.box_qty ?? "—"}</td>
          <td class="num">${x.pack_qty ?? "—"}</td>
        </tr>
      `;
    }).join("");
  }

  function applyFilters() {
    const q = (els.q.value || "").trim().toLowerCase();
    const w = els.fWidth.value ? Number(els.fWidth.value) : null;
    const c = els.fCore.value ? Number(els.fCore.value) : null;
    const l = els.fLen.value ? Number(els.fLen.value) : null;
    const stockOnly = els.inStockOnly.checked;

    let items = all.filter(x => {
      const hay = `${x.id ?? ""} ${x.title ?? ""}`.toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (w !== null && Number(x.spec?.width_mm) !== w) return false;
      if (c !== null && Number(x.spec?.core_mm) !== c) return false;
      if (l !== null && Number(x.spec?.length_m) !== l) return false;
      if (stockOnly && !x.in_stock) return false;
      return true;
    });

    items = applySort(items);
    viewItems = items;
    render(items);
  }

  function resetUI() {
    els.q.value = "";
    els.fWidth.value = "";
    els.fCore.value = "";
    els.fLen.value = "";
    els.inStockOnly.checked = false;
    els.sort.value = "price_asc";
    applyFilters();
  }

  function normalizeItem(x) {
    const spec = x.spec || {};
    return {
      id: String(x.id ?? ""),
      title: String(x.title ?? ""),
      spec: {
        density_gsm: spec.density_gsm != null ? Number(spec.density_gsm) : null,
        width_mm:    spec.width_mm != null ? Number(spec.width_mm) : null,
        core_mm:     spec.core_mm != null ? Number(spec.core_mm) : null,
        length_m:    spec.length_m != null ? Number(spec.length_m) : null,
      },
      price_uah: x.price_uah != null ? Number(x.price_uah) : 0,
      old_price_uah: x.old_price_uah != null ? Number(x.old_price_uah) : null,
      in_stock: Boolean(x.in_stock),
      box_qty: x.box_qty != null ? Number(x.box_qty) : null,
      pack_qty: x.pack_qty != null ? Number(x.pack_qty) : null,
      url: x.url ? String(x.url) : "",
    };
  }

  function setData(newData, sourceName) {
    if (!Array.isArray(newData)) throw new Error("JSON має бути масивом товарів (Array).");

    const cleaned = newData
      .filter(v => v && typeof v === "object")
      .map(normalizeItem)
      .filter(v => v.id || v.title);

    all = cleaned;
    dataSourceLabel = sourceName || "імпорт";

    fillFilters(all);
    resetUI();

    saveToLocal();

    if (!all.length) {
      els.rows.innerHTML = `<tr><td colspan="9" class="muted">Список порожній. Натисни “+Додати” або “Імпорт JSON”.</td></tr>`;
      els.stats.textContent = `0 / 0 • джерело: ${dataSourceLabel}`;
    }
  }

  function fileStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  function exportJSON() {
    const data = viewItems.length ? viewItems : all;
    const payload = JSON.stringify(data, null, 2);
    const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `tape_export_${fileStamp()}_${data.length}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
    toast(`Експортовано: ${data.length} позицій`);
  }

  function importJSONFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Не вдалося прочитати файл."));
      reader.onload = () => {
        try {
          const text = String(reader.result || "");
          const parsed = JSON.parse(text);

          const arr = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed.items) ? parsed.items
            : Array.isArray(parsed.products) ? parsed.products
            : Array.isArray(parsed.data) ? parsed.data
            : null;

          if (!arr) throw new Error("Очікувався масив або {items:[...]}/{products:[...]}/{data:[...]}.");

          setData(arr, `імпорт: ${file.name}`);
          toast(`Імпортовано: ${file.name}`);
          resolve();
        } catch (e) {
          reject(e);
        }
      };
      reader.readAsText(file, "utf-8");
    });
  }

  function openModal() {
    els.modal.hidden = false;
    els.addForm.reset();
    els.f_stock.checked = true;
    setTimeout(() => els.f_id.focus(), 0);
  }

  function closeModal() {
    els.modal.hidden = true;
  }

  function readNum(v) {
    const t = String(v ?? "").trim().replace(",", ".");
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  function addItemFromForm() {
    const id = String(els.f_id.value || "").trim();
    const title = String(els.f_title.value || "").trim();
    if (!id) throw new Error("ID обов'язковий.");
    if (!title) throw new Error("Назва обов'язкова.");
    if (all.some(x => String(x.id) === id)) throw new Error("Такий ID вже існує.");

    const item = normalizeItem({
      id,
      title,
      spec: {
        density_gsm: readNum(els.f_density.value),
        width_mm: readNum(els.f_width.value),
        core_mm: readNum(els.f_core.value),
        length_m: readNum(els.f_len.value),
      },
      price_uah: readNum(els.f_price.value) ?? 0,
      old_price_uah: readNum(els.f_old.value),
      in_stock: Boolean(els.f_stock.checked),
      box_qty: readNum(els.f_box.value),
      pack_qty: readNum(els.f_pack.value),
      url: String(els.f_url.value || "").trim(),
    });

    all.unshift(item);
    dataSourceLabel = `${dataSourceLabel} + додано`;
    saveToLocal();

    fillFilters(all);
    applyFilters();
    toast("Додано товар");
  }

  // ===== events =====
  const onChange = () => applyFilters();
  els.q.addEventListener("input", onChange);
  els.fWidth.addEventListener("change", onChange);
  els.fCore.addEventListener("change", onChange);
  els.fLen.addEventListener("change", onChange);
  els.inStockOnly.addEventListener("change", onChange);
  els.sort.addEventListener("change", onChange);

  els.btnReset.addEventListener("click", () => { resetUI(); toast("Скинуто"); });

  els.btnImport.addEventListener("click", () => {
    els.fileJson.value = "";
    els.fileJson.click();
  });

  els.fileJson.addEventListener("change", async () => {
    const file = els.fileJson.files && els.fileJson.files[0];
    if (!file) return;
    try {
      await importJSONFile(file);
    } catch (e) {
      toast(`Помилка імпорту: ${String(e.message || e)}`);
    }
  });

  els.btnExport.addEventListener("click", exportJSON);

  els.btnAdd.addEventListener("click", openModal);
  els.mClose.addEventListener("click", closeModal);
  els.mCancel.addEventListener("click", closeModal);
  els.modalBackdrop.addEventListener("click", closeModal);

  document.addEventListener("keydown", (e) => {
    if (!els.modal.hidden && e.key === "Escape") closeModal();
  });

  els.addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      addItemFromForm();
      closeModal();
    } catch (err) {
      toast(`Помилка: ${String(err.message || err)}`);
    }
  });

  // ===== init data (localStorage → fetch) =====
  (async () => {
    const local = loadFromLocal();
    if (local) {
      setData(local, "localStorage (offline)");
      toast("Завантажено локальні дані (offline) ✅");
      return;
    }

    try {
      const r = await fetch(DATA_URL, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setData(data, "products.json");
      toast("Завантажено products.json");
    } catch {
      setData([], "— (нема data/products.json)");
      toast("Нема products.json — імпортуй або додай вручну");
    }
  })();
});