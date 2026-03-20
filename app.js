(() => {
  const STORAGE_KEY = "tripPlanner.v1.items";
  const SETTINGS_KEY = "tripPlanner.v1.settings";

  /** @typedef {{id:string,startLocal:string,title:string,location:string,transport:string,notesHtml:string,createdAt:number}} TripItem */

  const els = {
    startDate: document.getElementById("startDate"),
    toggleShowAll: document.getElementById("toggleShowAll"),
    btnExport: document.getElementById("btnExport"),
    importFile: document.getElementById("importFile"),
    btnClear: document.getElementById("btnClear"),

    status: document.getElementById("status"),
    form: document.getElementById("itemForm"),
    date: document.getElementById("date"),
    time: document.getElementById("time"),
    title: document.getElementById("title"),
    location: document.getElementById("location"),
    transport: document.getElementById("transport"),
    transportCustom: document.getElementById("transportCustom"),
    notesEditor: document.getElementById("notesEditor"),
    linkUrl: document.getElementById("linkUrl"),
    btnLink: document.getElementById("btnLink"),
    btnUnlink: document.getElementById("btnUnlink"),
    btnCancelEdit: document.getElementById("btnCancelEdit"),
    btnDelete: document.getElementById("btnDelete"),
    plannerForm: document.getElementById("plannerForm"),
    toggleFormPanel: document.getElementById("toggleFormPanel"),

    board: document.getElementById("board"),
    metaCount: document.getElementById("metaCount"),
    metaRange: document.getElementById("metaRange"),
  };

  /** @type {TripItem[]} */
  let items = [];
  /** @type {string|null} */
  let editingId = null;
  let mobileFormCollapsed = false;
  let startupStatus = null;

  function isMobileViewport() {
    return window.matchMedia("(max-width: 820px)").matches;
  }

  function syncFormPanelUi() {
    if (!els.plannerForm || !els.toggleFormPanel) return;
    const collapsed = isMobileViewport() ? mobileFormCollapsed : false;
    els.plannerForm.classList.toggle("is-collapsed", collapsed);
    els.toggleFormPanel.setAttribute("aria-expanded", String(!collapsed));
    els.toggleFormPanel.textContent = collapsed ? "展開表單" : "收合表單";
  }

  function setMobileFormCollapsed(collapsed) {
    mobileFormCollapsed = collapsed;
    syncFormPanelUi();
  }

  function ensureFormVisibleOnMobile() {
    if (!isMobileViewport()) return;
    setMobileFormCollapsed(false);
    els.plannerForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toYMD(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function formatDow(date) {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }

  function parseStartTs(startLocal) {
    const d = new Date(startLocal);
    const ts = d.getTime();
    return Number.isFinite(ts) ? ts : NaN;
  }

  function sortItems(list) {
    return [...list].sort((a, b) => {
      const at = parseStartTs(a.startLocal);
      const bt = parseStartTs(b.startLocal);
      if (at !== bt) return at - bt;
      return a.createdAt - b.createdAt;
    });
  }

  function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function setStatus(kind, text) {
    els.status.className = "status";
    if (kind === "ok") els.status.classList.add("status--ok");
    if (kind === "bad") els.status.classList.add("status--bad");
    if (kind === "warn") els.status.classList.add("status--warn");
    els.status.textContent = text || "";
  }

  function rememberStartupStatus(kind, text) {
    startupStatus = { kind, text };
  }

  function normalizeStorageError(error) {
    if (error instanceof DOMException) {
      if (error.name === "QuotaExceededError") {
        return "本機儲存空間已滿，請先刪除部分行程或匯出後清空。";
      }
      if (error.name === "SecurityError") {
        return "目前瀏覽器環境禁止本機儲存，請改用一般瀏覽模式再試。";
      }
    }
    return "本機儲存失敗，請確認瀏覽器允許 localStorage。";
  }

  function writeStorage(key, value, fallbackMessage) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      setStatus("bad", fallbackMessage || normalizeStorageError(error));
      return false;
    }
  }

  function isValidHttpUrl(value) {
    if (!value) return false;
    try {
      const u = new URL(value);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  function sanitizeNotesHtml(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html || ""}</div>`, "text/html");
    const root = doc.body.firstElementChild;
    if (!root) return "";

    const allowedTags = new Set(["A", "BR", "DIV", "P", "SPAN"]);
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
    const toStrip = [];
    while (walker.nextNode()) {
      const el = /** @type {HTMLElement} */ (walker.currentNode);
      if (!allowedTags.has(el.tagName)) {
        toStrip.push(el);
        continue;
      }
      const href = el.tagName === "A" ? el.getAttribute("href") || "" : "";
      const attrs = [...el.attributes].map((a) => a.name);
      for (const name of attrs) el.removeAttribute(name);
      if (el.tagName === "A") {
        if (!isValidHttpUrl(href)) {
          toStrip.push(el);
        } else {
          el.setAttribute("href", href);
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener noreferrer");
        }
      }
    }
    for (const el of toStrip) {
      const parent = el.parentNode;
      if (!parent) continue;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    }
    return root.innerHTML.trim();
  }

  function loadItems() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((x) => x && typeof x === "object")
        .map((x) => ({
          id: String(x.id || uid()),
          startLocal: String(x.startLocal || ""),
          title: String(x.title || ""),
          location: String(x.location || ""),
          transport: String(x.transport || ""),
          notesHtml: String(x.notesHtml || ""),
          createdAt: Number.isFinite(Number(x.createdAt)) ? Number(x.createdAt) : Date.now(),
        }))
        .filter((x) => x.startLocal && x.title);
    } catch {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      rememberStartupStatus("warn", "已清除損壞的行程資料，現在可以重新儲存。");
      return [];
    }
  }

  function saveItems() {
    return writeStorage(STORAGE_KEY, items);
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || typeof s !== "object") return null;
      return {
        startDate: typeof s.startDate === "string" ? s.startDate : null,
        showAll: Boolean(s.showAll),
      };
    } catch {
      try {
        localStorage.removeItem(SETTINGS_KEY);
      } catch {}
      return null;
    }
  }

  function saveSettings() {
    return writeStorage(
      SETTINGS_KEY,
      {
        startDate: els.startDate.value || null,
        showAll: els.toggleShowAll.checked,
      },
      "設定儲存失敗，但不影響本次行程內容。",
    );
  }

  function getTransportValue() {
    if (els.transport.value === "其他") {
      const v = els.transportCustom.value.trim();
      return v || "其他";
    }
    return els.transport.value;
  }

  function setTransportValue(value) {
    const known = ["步行", "捷運", "火車", "高鐵", "計程車", "自駕", "飛機", "其他"];
    if (known.includes(value)) {
      els.transport.value = value;
      els.transportCustom.value = "";
      return;
    }
    els.transport.value = "其他";
    els.transportCustom.value = value || "";
  }

  function clearForm() {
    editingId = null;
    els.form.reset();
    els.date.value = els.startDate.value || els.date.value;
    els.time.value = els.time.value || "09:00";
    els.transport.value = "步行";
    els.transportCustom.value = "";
    els.transportCustom.disabled = true;
    els.notesEditor.innerHTML = "";
    els.linkUrl.value = "";
    els.btnDelete.disabled = true;
    setStatus("ok", "新增模式：填表後按「儲存行程」。");
  }

  function fillForm(item) {
    editingId = item.id;
    const [d, t] = item.startLocal.split("T");
    els.date.value = d || "";
    els.time.value = (t || "").slice(0, 5);
    els.title.value = item.title || "";
    els.location.value = item.location || "";
    setTransportValue(item.transport || "");
    els.notesEditor.innerHTML = sanitizeNotesHtml(item.notesHtml || "");
    els.btnDelete.disabled = false;
    setStatus("warn", "編輯模式：修改後按「儲存行程」，或按「取消編輯」。");
  }

  function get7Days(startYmd) {
    const start = new Date(`${startYmd}T00:00`);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  }

  function render() {
    const startYmd = els.startDate.value;
    const showAll = els.toggleShowAll.checked;
    const days = get7Days(startYmd);
    const ymds = new Set(days.map(toYMD));

    const sorted = sortItems(items);
    const visible = showAll ? sorted : sorted.filter((x) => ymds.has(x.startLocal.slice(0, 10)));

    const hiddenCount = sorted.length - visible.length;
    els.metaCount.textContent = `Items: ${sorted.length}${hiddenCount ? ` (hidden ${hiddenCount})` : ""}`;
    els.metaRange.textContent = `${days[0].toLocaleDateString()} → ${days[6].toLocaleDateString()}`;

    const byDay = new Map();
    for (const d of days) byDay.set(toYMD(d), []);
    if (showAll) byDay.set("__ALL__", []);

    for (const it of visible) {
      const key = showAll ? "__ALL__" : it.startLocal.slice(0, 10);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(it);
    }

    els.board.innerHTML = "";

    const dayKeys = showAll ? ["__ALL__"] : days.map(toYMD);
    for (const key of dayKeys) {
      const dayDate = showAll ? null : days.find((d) => toYMD(d) === key) || null;
      const dayTitle = showAll ? "全部" : dayDate.toLocaleDateString();
      const dow = showAll ? "All Dates" : formatDow(dayDate);

      const col = document.createElement("section");
      col.className = "day";
      col.innerHTML = `
        <div class="day__head">
          <div class="day__date">${escapeHtml(dayTitle)}</div>
          <div class="day__dow">${escapeHtml(dow)}</div>
        </div>
        <div class="day__list"></div>
      `;
      const list = col.querySelector(".day__list");
      const listItems = byDay.get(key) || [];

      if (listItems.length === 0) {
        const empty = document.createElement("div");
        empty.className = "hint";
        empty.textContent = showAll ? "目前沒有任何行程。" : "這一天沒有行程（可以新增一筆！）。";
        list.appendChild(empty);
      } else {
        for (const it of listItems) {
          const card = document.createElement("article");
          card.className = "card";
          card.tabIndex = 0;
          card.setAttribute("role", "button");
          card.setAttribute("aria-label", `編輯行程：${it.title}`);
          card.dataset.id = it.id;

          const t = it.startLocal.split("T")[1]?.slice(0, 5) || "--:--";
          const notes = sanitizeNotesHtml(it.notesHtml || "");
          const location = (it.location || "").trim();
          const transport = (it.transport || "").trim();

          card.innerHTML = `
            <div class="card__top">
              <div class="timeBadge">${escapeHtml(t)}</div>
              <div class="tag ${transport ? "tag--acid" : ""}">${escapeHtml(transport || "未填交通")}</div>
            </div>
            <div class="card__title">${escapeHtml(it.title)}</div>
            <div class="card__row">
              <div class="tag ${location ? "tag--hot" : ""}">${escapeHtml(location || "未填地點")}</div>
              ${showAll ? `<div class="tag">${escapeHtml(it.startLocal.slice(0, 10))}</div>` : ""}
            </div>
            ${notes ? `<div class="card__notes">${notes}</div>` : ""}
          `;

          card.addEventListener("click", () => {
            const target = items.find((x) => x.id === it.id);
            if (!target) return;
            fillForm(target);
            ensureFormVisibleOnMobile();
            if (!isMobileViewport()) {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          });
          card.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              card.click();
            }
          });

          list.appendChild(card);
        }
      }

      els.board.appendChild(col);
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function ensureStartDateDefault() {
    const settings = loadSettings();
    const today = new Date();
    const defaultStart = settings?.startDate || toYMD(today);
    els.startDate.value = defaultStart;
    els.toggleShowAll.checked = settings?.showAll || false;
  }

  function wireEvents() {
    els.startDate.addEventListener("change", () => {
      saveSettings();
      if (!els.date.value) els.date.value = els.startDate.value;
      render();
    });

    els.toggleShowAll.addEventListener("change", () => {
      saveSettings();
      render();
    });

    if (els.toggleFormPanel && els.plannerForm) {
      els.toggleFormPanel.addEventListener("click", () => {
        setMobileFormCollapsed(!mobileFormCollapsed);
      });
    }

    els.transport.addEventListener("change", () => {
      const isOther = els.transport.value === "其他";
      els.transportCustom.disabled = !isOther;
      if (!isOther) els.transportCustom.value = "";
    });

    els.form.addEventListener("submit", (e) => {
      e.preventDefault();

      const d = els.date.value;
      const t = els.time.value;
      const title = els.title.value.trim();
      if (!d || !t || !title) {
        setStatus("bad", "請至少填：日期、時間、行程名稱。");
        return;
      }

      const startLocal = `${d}T${t}`;
      const ts = parseStartTs(startLocal);
      if (!Number.isFinite(ts)) {
        setStatus("bad", "日期/時間格式無法解析，請重新選擇。");
        return;
      }

      const notesHtml = sanitizeNotesHtml(els.notesEditor.innerHTML);
      const transport = getTransportValue().trim();
      const location = els.location.value.trim();

      if (editingId) {
        const idx = items.findIndex((x) => x.id === editingId);
        if (idx === -1) {
          setStatus("bad", "找不到要編輯的行程（可能已被刪除）。");
          clearForm();
          render();
          return;
        }
        items[idx] = {
          ...items[idx],
          startLocal,
          title,
          location,
          transport,
          notesHtml,
        };
        if (!saveItems()) return;
        setStatus("ok", "已更新行程，並自動排序。");
      } else {
        const item = {
          id: uid(),
          startLocal,
          title,
          location,
          transport,
          notesHtml,
          createdAt: Date.now(),
        };
        items.push(item);
        if (!saveItems()) {
          items = items.filter((x) => x.id !== item.id);
          return;
        }
        setStatus("ok", "已新增行程，並自動排序。");
      }

      render();
      clearForm();
      if (isMobileViewport()) setMobileFormCollapsed(true);
    });

    els.btnCancelEdit.addEventListener("click", () => {
      clearForm();
      if (isMobileViewport()) setMobileFormCollapsed(true);
    });

    els.btnDelete.addEventListener("click", () => {
      if (!editingId) return;
      const target = items.find((x) => x.id === editingId);
      if (!target) {
        clearForm();
        render();
        return;
      }
      const ok = confirm(`確定刪除這筆行程？\n\n${target.startLocal}\n${target.title}`);
      if (!ok) return;
      const nextItems = items.filter((x) => x.id !== editingId);
      const prevItems = items;
      items = nextItems;
      if (!saveItems()) {
        items = prevItems;
        return;
      }
      setStatus("ok", "已刪除行程。");
      clearForm();
      if (isMobileViewport()) setMobileFormCollapsed(true);
      render();
    });

    els.btnLink.addEventListener("click", () => {
      const url = (els.linkUrl.value || "").trim();
      if (!isValidHttpUrl(url)) {
        setStatus("bad", "請輸入有效網址（http:// 或 https://）。");
        return;
      }

      const sel = document.getSelection();
      if (!sel || sel.rangeCount === 0) {
        setStatus("bad", "請先在備註欄選取一段文字。");
        return;
      }
      const range = sel.getRangeAt(0);
      if (!els.notesEditor.contains(range.commonAncestorContainer)) {
        setStatus("bad", "請在『備註』欄位內選取文字後再套用連結。");
        return;
      }
      if (sel.isCollapsed) {
        setStatus("bad", "選取範圍為空：請先反白一段文字。");
        return;
      }

      els.notesEditor.focus();
      document.execCommand("createLink", false, url);

      els.notesEditor.innerHTML = sanitizeNotesHtml(els.notesEditor.innerHTML);
      setStatus("ok", "已套用連結（儲存行程後會保留）。");
    });

    els.btnUnlink.addEventListener("click", () => {
      els.notesEditor.focus();
      document.execCommand("unlink", false, null);
      els.notesEditor.innerHTML = sanitizeNotesHtml(els.notesEditor.innerHTML);
      setStatus("ok", "已移除連結。");
    });

    els.btnExport.addEventListener("click", () => {
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        items,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `trip-planner-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      setStatus("ok", "已匯出 JSON。");
    });

    els.importFile.addEventListener("change", async () => {
      const file = els.importFile.files?.[0];
      els.importFile.value = "";
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const incoming = Array.isArray(parsed) ? parsed : parsed?.items;
        if (!Array.isArray(incoming)) {
          setStatus("bad", "匯入失敗：JSON 格式不正確（找不到 items）。");
          return;
        }
        const merged = incoming
          .filter((x) => x && typeof x === "object")
          .map((x) => ({
            id: String(x.id || uid()),
            startLocal: String(x.startLocal || ""),
            title: String(x.title || ""),
            location: String(x.location || ""),
            transport: String(x.transport || ""),
            notesHtml: sanitizeNotesHtml(String(x.notesHtml || "")),
            createdAt: Number.isFinite(Number(x.createdAt)) ? Number(x.createdAt) : Date.now(),
          }))
          .filter((x) => x.startLocal && x.title);

        if (merged.length === 0) {
          setStatus("bad", "匯入內容為空（沒有可用的行程）。");
          return;
        }

        const ok = confirm(
          `匯入 ${merged.length} 筆行程。\n\n選「確定」會與現有資料合併（相同 id 會被覆蓋）。`,
        );
        if (!ok) return;

        const map = new Map(items.map((x) => [x.id, x]));
        for (const it of merged) map.set(it.id, it);
        const prevItems = items;
        items = [...map.values()];
        if (!saveItems()) {
          items = prevItems;
          return;
        }
        render();
        clearForm();
        setStatus("ok", `已匯入 ${merged.length} 筆行程。`);
      } catch {
        setStatus("bad", "匯入失敗：檔案不是有效 JSON。");
      }
    });

    els.btnClear.addEventListener("click", () => {
      const ok = confirm("確定清空所有行程？\n（建議先匯出備份）");
      if (!ok) return;
      const prevItems = items;
      items = [];
      if (!saveItems()) {
        items = prevItems;
        return;
      }
      clearForm();
      if (isMobileViewport()) setMobileFormCollapsed(true);
      render();
      setStatus("ok", "已清空所有行程。");
    });

    window.addEventListener("resize", () => {
      syncFormPanelUi();
    });
  }

  function init() {
    ensureStartDateDefault();
    items = loadItems();
    els.transportCustom.disabled = true;
    mobileFormCollapsed = isMobileViewport();
    wireEvents();

    if (!els.date.value) els.date.value = els.startDate.value;
    if (!els.time.value) els.time.value = "09:00";
    clearForm();
    if (startupStatus) setStatus(startupStatus.kind, startupStatus.text);
    syncFormPanelUi();
    render();
  }

  init();
})();
