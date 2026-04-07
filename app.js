(() => {
  const loadingOverlay = document.getElementById("loading");

  // Supabase 初始化 (請替換為您的 Supabase URL 和 API Key)
  const SUPABASE_URL = 'https://vztealcurhcjvkrrtvui.supabase.co'; // 替換為您的 Supabase URL
  const SUPABASE_ANON_KEY = 'sb_publishable_aLGlNwheFAthxrd0LReqQg_H0XfStht'; // 替換為您的 Supabase Anon Key
  if (!window.supabase?.createClient) {
    if (loadingOverlay) {
      loadingOverlay.innerHTML = "<p>Supabase SDK 載入失敗，請重新整理頁面後再試。</p>";
    }
    throw new Error("Supabase SDK not loaded");
  }
  const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const STORAGE_KEY = "tripPlanner.v2.data";
  const LEGACY_ITEMS_KEY = "tripPlanner.v1.items";
  const LEGACY_SETTINGS_KEY = "tripPlanner.v1.settings";
  const DEFAULT_TRIP_NAME = "我的旅程";
  const DEFAULT_TIME = "09:00";
  const currencyFormatter = new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  });

  const els = {
    tripSelect: document.getElementById("tripSelect"),
    btnNewTrip: document.getElementById("btnNewTrip"),
    btnRenameTrip: document.getElementById("btnRenameTrip"),
    btnDeleteTrip: document.getElementById("btnDeleteTrip"),
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
    budget: document.getElementById("budget"),
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
    summaryTripName: document.getElementById("summaryTripName"),
    summaryTripRange: document.getElementById("summaryTripRange"),
    summaryBudget: document.getElementById("summaryBudget"),
    summaryBudgetAverage: document.getElementById("summaryBudgetAverage"),
    summaryItemCount: document.getElementById("summaryItemCount"),
    summaryTransports: document.getElementById("summaryTransports"),
    summaryLocations: document.getElementById("summaryLocations"),

    // 載入相關
    loading: loadingOverlay,
    btnLogout: document.getElementById("btnLogout"),
  };

  let data = null;
  let editingId = null;
  let currentUser = null;
  let mobileFormCollapsed = false;
  let startupStatus = null;

  function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toYmd(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function todayYmd() {
    return toYmd(new Date());
  }

  function isMobileViewport() {
    return window.matchMedia("(max-width: 820px)").matches;
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

  function writeStorage(payload, fallbackMessage) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch (error) {
      setStatus("bad", fallbackMessage || normalizeStorageError(error));
      return false;
    }
  }

  function normalizeBudget(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.round(parsed);
  }

  function formatCurrency(amount) {
    return currencyFormatter.format(amount || 0);
  }

  function formatDow(date) {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }

  function parseStartTs(startLocal) {
    const ts = new Date(startLocal).getTime();
    return Number.isFinite(ts) ? ts : NaN;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function isValidHttpUrl(value) {
    if (!value) return false;
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
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
      const attrs = [...el.attributes].map((attr) => attr.name);
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

  function createTrip(name, startDate, items = [], durationDays = 7) {
    return {
      id: uid(),
      name: name || DEFAULT_TRIP_NAME,
      startDate: startDate || todayYmd(),
      durationDays: Math.min(40, Math.max(1, Number(durationDays) || 7)),
      createdAt: Date.now(),
      items: items.map(normalizeItem),
    };
  }

  function normalizeItem(item) {
    return {
      id: String(item?.id || uid()),
      startLocal: String(item?.startLocal || `${todayYmd()}T${DEFAULT_TIME}`),
      title: String(item?.title || "").trim(),
      location: String(item?.location || "").trim(),
      transport: String(item?.transport || "").trim(),
      budget: normalizeBudget(item?.budget || 0),
      notesHtml: sanitizeNotesHtml(String(item?.notesHtml || "")),
      createdAt: Number.isFinite(Number(item?.createdAt)) ? Number(item.createdAt) : Date.now(),
    };
  }

  function normalizeTrip(trip) {
    return {
      id: String(trip?.id || uid()),
      name: String(trip?.name || DEFAULT_TRIP_NAME).trim() || DEFAULT_TRIP_NAME,
      startDate: String(trip?.startDate || todayYmd()),
      durationDays: Math.min(40, Math.max(1, Number(trip?.durationDays) || 7)),
      createdAt: Number.isFinite(Number(trip?.createdAt)) ? Number(trip.createdAt) : Date.now(),
      items: Array.isArray(trip?.items)
        ? trip.items.map(normalizeItem).filter((item) => item.title)
        : [],
    };
  }

  function createDefaultData() {
    const trip = createTrip(DEFAULT_TRIP_NAME, todayYmd(), []);
    return {
      version: 2,
      activeTripId: trip.id,
      ui: { showAll: false },
      trips: [trip],
    };
  }

  function loadLegacyData() {
    try {
      const rawItems = localStorage.getItem(LEGACY_ITEMS_KEY);
      const rawSettings = localStorage.getItem(LEGACY_SETTINGS_KEY);
      const items = rawItems ? JSON.parse(rawItems) : [];
      const settings = rawSettings ? JSON.parse(rawSettings) : null;
      if (!Array.isArray(items) || items.length === 0) return null;
      const trip = createTrip(DEFAULT_TRIP_NAME, settings?.startDate || todayYmd(), items);
      rememberStartupStatus("warn", "已將舊版資料升級為多旅程格式。");
      return {
        version: 2,
        activeTripId: trip.id,
        ui: { showAll: Boolean(settings?.showAll) },
        trips: [trip],
      };
    } catch {
      return null;
    }
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const legacy = loadLegacyData();
        return legacy || createDefaultData();
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.trips)) {
        throw new Error("Invalid data");
      }
      const trips = parsed.trips.map(normalizeTrip);
      const activeTripId = trips.some((trip) => trip.id === parsed.activeTripId)
        ? parsed.activeTripId
        : trips[0]?.id;

      if (!trips.length) return createDefaultData();

      return {
        version: 2,
        activeTripId,
        ui: { showAll: Boolean(parsed?.ui?.showAll) },
        trips,
      };
    } catch {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      rememberStartupStatus("warn", "已清除損壞的資料，現在可以重新儲存。");
      return createDefaultData();
    }
  }

  function saveData(message) {
    return writeStorage(data, message);
  }

  function getActiveTrip() {
    return data.trips.find((trip) => trip.id === data.activeTripId) || data.trips[0];
  }

  function cloneData(source) {
    return JSON.parse(JSON.stringify(source));
  }

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
  }

  function toDbTimestamptz(localValue) {
    if (!localValue) return null;
    const normalized = localValue.includes("T") && localValue.length === 16 ? `${localValue}:00` : localValue;
    const parsed = new Date(normalized);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }

  function fromDbTimestamptz(value) {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) {
      return `${todayYmd()}T${DEFAULT_TIME}`;
    }
    return `${toYmd(parsed)}T${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`;
  }

  function mapTripRowToLocal(row, items = []) {
    return normalizeTrip({
      id: row.id,
      name: row.name,
      startDate: row.start_date,
      durationDays: row.duration_days,
      createdAt: Date.parse(row.created_at),
      items,
    });
  }

  function mapTripItemRowToLocal(row) {
    return normalizeItem({
      id: row.id,
      startLocal: fromDbTimestamptz(row.start_local),
      title: row.title,
      location: row.location,
      transport: row.transport,
      budget: row.budget,
      notesHtml: row.notes_html,
      createdAt: Date.parse(row.created_at),
    });
  }

  function saveLocalBackup(message) {
    return writeStorage(data, message || "本機備份儲存失敗。");
  }

  function replaceTripRecord(oldTripId, nextTrip) {
    data.trips = data.trips.map((trip) => (trip.id === oldTripId ? normalizeTrip(nextTrip) : trip));
    if (data.activeTripId === oldTripId) {
      data.activeTripId = nextTrip.id;
    }
  }

  function replaceTripItemRecord(tripId, oldItemId, nextItem) {
    data.trips = data.trips.map((trip) => {
      if (trip.id !== tripId) return trip;
      return {
        ...trip,
        items: trip.items.map((item) => (item.id === oldItemId ? normalizeItem(nextItem) : item)),
      };
    });
  }

  function getTripDbPayload(trip) {
    return {
      user_id: currentUser.id,
      name: trip.name,
      start_date: trip.startDate,
      duration_days: Math.min(40, Math.max(1, Number(trip.durationDays) || 7)),
      show_all: false,
    };
  }

  function getTripItemDbPayload(tripId, item) {
    return {
      trip_id: tripId,
      title: item.title,
      location: item.location || "",
      transport: item.transport || "",
      budget: normalizeBudget(item.budget),
      start_local: toDbTimestamptz(item.startLocal),
      notes_html: sanitizeNotesHtml(item.notesHtml || ""),
    };
  }

  function getErrorMessage(error, fallback = "雲端同步失敗。") {
    return error?.message || fallback;
  }

  async function loadTripsFromSupabase(localBackup) {
    const { data: tripRows, error: tripsError } = await supabaseClient
      .from("trips")
      .select("id, name, start_date, duration_days, show_all, created_at")
      .order("created_at", { ascending: true });

    if (tripsError) throw tripsError;
    if (!Array.isArray(tripRows) || tripRows.length === 0) return null;

    const tripIds = tripRows.map((row) => row.id);
    const { data: itemRows, error: itemsError } = await supabaseClient
      .from("trip_items")
      .select("id, trip_id, title, location, transport, budget, start_local, notes_html, created_at")
      .in("trip_id", tripIds)
      .order("start_local", { ascending: true })
      .order("created_at", { ascending: true });

    if (itemsError) throw itemsError;

    const itemsByTripId = new Map();
    for (const row of itemRows || []) {
      const existingItems = itemsByTripId.get(row.trip_id) || [];
      existingItems.push(mapTripItemRowToLocal(row));
      itemsByTripId.set(row.trip_id, existingItems);
    }

    const trips = tripRows.map((row) => mapTripRowToLocal(row, itemsByTripId.get(row.id) || []));
    const activeTripId = trips.some((trip) => trip.id === localBackup?.activeTripId)
      ? localBackup.activeTripId
      : trips[0].id;

    return {
      version: 2,
      activeTripId,
      ui: {
        showAll: Boolean(localBackup?.ui?.showAll),
      },
      trips,
    };
  }

  async function createTripInSupabase(trip) {
    const payload = getTripDbPayload(trip);
    const { data: row, error } = await supabaseClient
      .from("trips")
      .insert(payload)
      .select("id, name, start_date, duration_days, show_all, created_at")
      .single();

    if (error) throw error;
    return mapTripRowToLocal(row, trip.items);
  }

  async function updateTripInSupabase(trip) {
    if (!isUuid(trip.id)) {
      return createTripInSupabase(trip);
    }

    const payload = {
      name: trip.name,
      start_date: trip.startDate,
      duration_days: Math.min(40, Math.max(1, Number(trip.durationDays) || 7)),
    };

    const { data: row, error } = await supabaseClient
      .from("trips")
      .update(payload)
      .eq("id", trip.id)
      .select("id, name, start_date, duration_days, show_all, created_at")
      .single();

    if (error) throw error;
    return mapTripRowToLocal(row, trip.items);
  }

  async function deleteTripInSupabase(tripId) {
    if (!isUuid(tripId)) return;
    const { error } = await supabaseClient.from("trips").delete().eq("id", tripId);
    if (error) throw error;
  }

  async function ensureTripSynced(trip) {
    if (isUuid(trip.id)) return trip;

    const syncedTrip = await createTripInSupabase(trip);
    replaceTripRecord(trip.id, syncedTrip);
    saveLocalBackup("旅程已同步到雲端，但本機備份更新失敗。");
    return getActiveTrip().id === syncedTrip.id
      ? getActiveTrip()
      : data.trips.find((entry) => entry.id === syncedTrip.id) || syncedTrip;
  }

  async function upsertTripItemInSupabase(trip, item) {
    const syncedTrip = await ensureTripSynced(trip);
    const payload = getTripItemDbPayload(syncedTrip.id, item);

    if (!payload.start_local) {
      throw new Error("行程時間格式無效，無法同步到雲端。");
    }

    if (!isUuid(item.id)) {
      const { data: row, error } = await supabaseClient
        .from("trip_items")
        .insert(payload)
        .select("id, trip_id, title, location, transport, budget, start_local, notes_html, created_at")
        .single();

      if (error) throw error;
      return {
        syncedTrip,
        syncedItem: mapTripItemRowToLocal(row),
      };
    }

    const { data: row, error } = await supabaseClient
      .from("trip_items")
      .update(payload)
      .eq("id", item.id)
      .select("id, trip_id, title, location, transport, budget, start_local, notes_html, created_at")
      .single();

    if (error) throw error;
    return {
      syncedTrip,
      syncedItem: mapTripItemRowToLocal(row),
    };
  }

  async function deleteTripItemInSupabase(itemId) {
    if (!isUuid(itemId)) return;
    const { error } = await supabaseClient.from("trip_items").delete().eq("id", itemId);
    if (error) throw error;
  }

  async function clearTripItemsInSupabase(trip) {
    const syncedTrip = await ensureTripSynced(trip);
    const { error } = await supabaseClient.from("trip_items").delete().eq("trip_id", syncedTrip.id);
    if (error) throw error;
    return syncedTrip;
  }

  function sortItems(items) {
    return [...items].sort((a, b) => {
      const at = parseStartTs(a.startLocal);
      const bt = parseStartTs(b.startLocal);
      if (at !== bt) return at - bt;
      return a.createdAt - b.createdAt;
    });
  }

  function get7Days(startYmd) {
    const start = new Date(`${startYmd}T00:00`);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      days.push(date);
    }
    return days;
  }

  function getTransportValue() {
    if (els.transport.value === "其他") {
      const custom = els.transportCustom.value.trim();
      return custom || "其他";
    }
    return els.transport.value;
  }

  function setTransportValue(value) {
    const known = ["步行", "捷運", "火車", "高鐵", "計程車", "自駕", "飛機", "其他"];
    if (known.includes(value)) {
      els.transport.value = value;
      els.transportCustom.value = "";
      els.transportCustom.disabled = value !== "其他";
      return;
    }
    els.transport.value = "其他";
    els.transportCustom.value = value || "";
    els.transportCustom.disabled = false;
  }

  function getMapsUrl(location) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
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

  function clearForm(statusText = "新增模式：填表後按「儲存行程」。") {
    const activeTrip = getActiveTrip();
    editingId = null;
    els.form.reset();
    els.date.value = activeTrip.startDate;
    els.time.value = DEFAULT_TIME;
    els.transport.value = "步行";
    els.transportCustom.value = "";
    els.transportCustom.disabled = true;
    els.budget.value = "";
    els.notesEditor.innerHTML = "";
    els.linkUrl.value = "";
    els.btnDelete.disabled = true;
    setStatus("ok", statusText);
  }

  function fillForm(item) {
    editingId = item.id;
    const [datePart, timePart] = item.startLocal.split("T");
    els.date.value = datePart || getActiveTrip().startDate;
    els.time.value = (timePart || DEFAULT_TIME).slice(0, 5);
    els.title.value = item.title || "";
    els.location.value = item.location || "";
    setTransportValue(item.transport || "步行");
    els.budget.value = item.budget ? String(item.budget) : "";
    els.notesEditor.innerHTML = sanitizeNotesHtml(item.notesHtml || "");
    els.btnDelete.disabled = false;
    setStatus("warn", "編輯模式：修改後按「儲存行程」，或按「取消編輯」。");
  }

  function renderTripSelect() {
    const options = data.trips
      .map((trip) => `<option value="${escapeHtml(trip.id)}">${escapeHtml(trip.name)}</option>`)
      .join("");
    els.tripSelect.innerHTML = options;
    els.tripSelect.value = data.activeTripId;
    els.btnDeleteTrip.disabled = data.trips.length <= 1;
  }

  function renderSummary(activeTrip, visibleItems, days) {
    const totalBudget = visibleItems.reduce((sum, item) => sum + item.budget, 0);
    const avgBudget = visibleItems.length ? Math.round(totalBudget / visibleItems.length) : 0;
    const locationCount = visibleItems.filter((item) => item.location).length;
    const uniqueTransports = [...new Set(visibleItems.map((item) => item.transport).filter(Boolean))];

    els.summaryTripName.textContent = activeTrip.name;
    els.summaryTripRange.textContent = `${days[0].toLocaleDateString()} → ${days[6].toLocaleDateString()}`;
    els.summaryBudget.textContent = formatCurrency(totalBudget);
    els.summaryBudgetAverage.textContent = visibleItems.length
      ? `平均每項 ${formatCurrency(avgBudget)}`
      : "尚未填寫預算";
    els.summaryItemCount.textContent = `${visibleItems.length} 筆`;
    els.summaryTransports.textContent = uniqueTransports.length
      ? uniqueTransports.join(" / ")
      : "尚未設定交通";
    els.summaryLocations.textContent = `${locationCount} 筆地點`;
  }

  function render() {
    const activeTrip = getActiveTrip();
    const startYmd = activeTrip.startDate;
    const days = get7Days(startYmd);
    const showAll = data.ui.showAll;
    const ymds = new Set(days.map(toYmd));

    els.startDate.value = activeTrip.startDate;
    els.toggleShowAll.checked = showAll;

    const sortedItems = sortItems(activeTrip.items);
    const visibleItems = showAll
      ? sortedItems
      : sortedItems.filter((item) => ymds.has(item.startLocal.slice(0, 10)));

    const hiddenCount = sortedItems.length - visibleItems.length;
    els.metaCount.textContent = `Items: ${sortedItems.length}${hiddenCount ? ` (hidden ${hiddenCount})` : ""}`;
    els.metaRange.textContent = `${days[0].toLocaleDateString()} → ${days[6].toLocaleDateString()}`;
    renderSummary(activeTrip, visibleItems, days);

    const buckets = new Map();
    for (const day of days) buckets.set(toYmd(day), []);
    if (showAll) buckets.set("__ALL__", []);

    for (const item of visibleItems) {
      const key = showAll ? "__ALL__" : item.startLocal.slice(0, 10);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(item);
    }

    els.board.innerHTML = "";

    const dayKeys = showAll ? ["__ALL__"] : days.map(toYmd);
    for (const key of dayKeys) {
      const dayDate = showAll ? null : days.find((day) => toYmd(day) === key) || null;
      const items = buckets.get(key) || [];
      const section = document.createElement("section");
      section.className = "day";
      section.innerHTML = `
        <div class="day__head">
          <div class="day__date">${escapeHtml(showAll ? "全部日期" : dayDate.toLocaleDateString())}</div>
          <div class="day__dow">${escapeHtml(showAll ? activeTrip.name : formatDow(dayDate))}</div>
        </div>
        <div class="day__list"></div>
      `;
      const list = section.querySelector(".day__list");

      if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "hint";
        empty.textContent = showAll ? "目前沒有任何行程。" : "這一天沒有行程（可以新增一筆！）。";
        list.appendChild(empty);
      } else {
        for (const item of items) {
          const timeText = item.startLocal.split("T")[1]?.slice(0, 5) || "--:--";
          const mapsButton = item.location
            ? `<a class="mapLink" href="${getMapsUrl(item.location)}" target="_blank" rel="noopener noreferrer" data-stop-card="true">Google Maps</a>`
            : "";
          const budgetBadge = item.budget ? `<div class="tag">${escapeHtml(formatCurrency(item.budget))}</div>` : "";
          const notes = sanitizeNotesHtml(item.notesHtml);

          const card = document.createElement("article");
          card.className = "card";
          card.tabIndex = 0;
          card.setAttribute("role", "button");
          card.setAttribute("aria-label", `編輯行程：${item.title}`);
          card.dataset.id = item.id;
          card.innerHTML = `
            <div class="card__top">
              <div class="timeBadge">${escapeHtml(timeText)}</div>
              <div class="tag ${item.transport ? "tag--acid" : ""}">${escapeHtml(item.transport || "未填交通")}</div>
            </div>
            <div class="card__title">${escapeHtml(item.title)}</div>
            <div class="card__row">
              <div class="tag ${item.location ? "tag--hot" : ""}">${escapeHtml(item.location || "未填地點")}</div>
              ${budgetBadge}
            </div>
            ${notes ? `<div class="card__notes">${notes}</div>` : ""}
            ${mapsButton ? `<div class="card__actions">${mapsButton}</div>` : ""}
          `;

          card.addEventListener("click", (event) => {
            const target = /** @type {HTMLElement | null} */ (event.target);
            if (target?.closest("[data-stop-card='true']")) return;
            const currentItem = getActiveTrip().items.find((entry) => entry.id === item.id);
            if (!currentItem) return;
            fillForm(currentItem);
            ensureFormVisibleOnMobile();
            if (!isMobileViewport()) {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          });

          card.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              card.click();
            }
          });

          list.appendChild(card);
        }
      }

      els.board.appendChild(section);
    }
  }

  function commitActiveTrip(nextTrip, successMessage) {
    const previousData = cloneData(data);
    data.trips = data.trips.map((trip) => (trip.id === nextTrip.id ? nextTrip : trip));
    if (!saveData()) {
      data = previousData;
      return false;
    }
    if (successMessage) setStatus("ok", successMessage);
    return true;
  }

  async function handleTripCreate() {
    const rawName = prompt("請輸入新旅程名稱：", `旅程 ${data.trips.length + 1}`);
    if (rawName === null) return;
    const name = rawName.trim();
    if (!name) {
      setStatus("bad", "旅程名稱不能為空。");
      return;
    }

    const previousData = cloneData(data);
    const trip = createTrip(name, todayYmd(), []);
    data.trips.push(trip);
    data.activeTripId = trip.id;
    if (!saveData()) {
      data = previousData;
      return;
    }
    renderTripSelect();
    clearForm(`已新增旅程「${trip.name}」。`);
    render();
    if (isMobileViewport()) setMobileFormCollapsed(true);

    try {
      const syncedTrip = await createTripInSupabase(trip);
      replaceTripRecord(trip.id, syncedTrip);
      saveLocalBackup("旅程已同步到雲端，但本機備份更新失敗。");
      renderTripSelect();
      render();
      clearForm(`已新增旅程「${syncedTrip.name}」，並同步到雲端。`);
    } catch (error) {
      setStatus("warn", `旅程已先保存於本機，雲端同步失敗：${getErrorMessage(error)}`);
    }
  }

  async function handleTripRename() {
    const activeTrip = getActiveTrip();
    const rawName = prompt("請輸入新的旅程名稱：", activeTrip.name);
    if (rawName === null) return;
    const name = rawName.trim();
    if (!name) {
      setStatus("bad", "旅程名稱不能為空。");
      return;
    }
    const nextTrip = { ...activeTrip, name };
    if (!commitActiveTrip(nextTrip, `已重新命名為「${name}」。`)) return;
    renderTripSelect();
    render();

    try {
      const syncedTrip = await updateTripInSupabase(nextTrip);
      replaceTripRecord(nextTrip.id, syncedTrip);
      saveLocalBackup("旅程名稱已同步到雲端，但本機備份更新失敗。");
      renderTripSelect();
      render();
      setStatus("ok", `已更新旅程名稱為「${syncedTrip.name}」，並同步到雲端。`);
    } catch (error) {
      setStatus("warn", `旅程名稱已先保存於本機，雲端同步失敗：${getErrorMessage(error)}`);
    }
  }

  async function handleTripDelete() {
    const activeTrip = getActiveTrip();
    if (data.trips.length === 1) {
      setStatus("bad", "至少要保留一個旅程。");
      return;
    }
    const ok = confirm(`確定刪除旅程「${activeTrip.name}」？\n\n這會刪除該旅程底下所有行程。`);
    if (!ok) return;

    const previousData = cloneData(data);
    data.trips = data.trips.filter((trip) => trip.id !== activeTrip.id);
    data.activeTripId = data.trips[0].id;
    if (!saveData()) {
      data = previousData;
      return;
    }
    renderTripSelect();
    clearForm(`已刪除旅程「${activeTrip.name}」。`);
    render();

    try {
      await deleteTripInSupabase(activeTrip.id);
      setStatus("ok", `已刪除旅程「${activeTrip.name}」，並同步到雲端。`);
    } catch (error) {
      setStatus("warn", `旅程已先從本機移除，雲端同步失敗：${getErrorMessage(error)}`);
    }
  }

  async function handleLogout() {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
  }

  function exportData() {
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      data,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `trip-planner-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
    setStatus("ok", "已匯出所有旅程資料。");
  }

  async function importData() {
    const file = els.importFile.files?.[0];
    els.importFile.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const incomingData = parsed?.data?.trips
        ? parsed.data
        : parsed?.trips
          ? parsed
          : Array.isArray(parsed?.items)
            ? {
                version: 2,
                activeTripId: null,
                ui: { showAll: false },
                trips: [createTrip("匯入旅程", todayYmd(), parsed.items)],
              }
            : null;

      if (!incomingData) {
        setStatus("bad", "匯入失敗：檔案內容不是支援的旅程格式。");
        return;
      }

      const normalized = {
        version: 2,
        activeTripId: incomingData.activeTripId,
        ui: { showAll: Boolean(incomingData?.ui?.showAll) },
        trips: incomingData.trips.map(normalizeTrip).filter((trip) => trip.name),
      };

      if (!normalized.trips.length) {
        setStatus("bad", "匯入失敗：找不到可用旅程。");
        return;
      }

      if (!normalized.trips.some((trip) => trip.id === normalized.activeTripId)) {
        normalized.activeTripId = normalized.trips[0].id;
      }

      const ok = confirm(`匯入 ${normalized.trips.length} 個旅程，將覆蓋目前所有資料。`);
      if (!ok) return;

      const previousData = cloneData(data);
      data = normalized;
      if (!saveData()) {
        data = previousData;
        return;
      }

      renderTripSelect();
      clearForm("已匯入旅程資料。");
      render();
    } catch {
      setStatus("bad", "匯入失敗：檔案不是有效 JSON。");
    }
  }

  async function clearActiveTripItems() {
    const activeTrip = getActiveTrip();
    const ok = confirm(`確定清空旅程「${activeTrip.name}」的所有行程？\n（建議先匯出備份）`);
    if (!ok) return;

    const nextTrip = { ...activeTrip, items: [] };
    if (!commitActiveTrip(nextTrip, `已清空「${activeTrip.name}」的所有行程。`)) return;
    clearForm();
    render();

    try {
      await clearTripItemsInSupabase(activeTrip);
      setStatus("ok", `已清空旅程「${activeTrip.name}」的行程，並同步到雲端。`);
    } catch (error) {
      setStatus("warn", `行程已先從本機清空，雲端同步失敗：${getErrorMessage(error)}`);
    }
  }

  function wireEvents() {
    els.tripSelect.addEventListener("change", () => {
      const previousData = cloneData(data);
      data.activeTripId = els.tripSelect.value;
      if (!saveData("切換旅程失敗，請稍後再試。")) {
        data = previousData;
        renderTripSelect();
        return;
      }
      clearForm(`已切換到「${getActiveTrip().name}」。`);
      render();
      if (isMobileViewport()) setMobileFormCollapsed(true);
    });

    els.btnNewTrip.addEventListener("click", handleTripCreate);
    els.btnRenameTrip.addEventListener("click", handleTripRename);
    els.btnDeleteTrip.addEventListener("click", handleTripDelete);

    els.startDate.addEventListener("change", async () => {
      const activeTrip = getActiveTrip();
      const nextTrip = { ...activeTrip, startDate: els.startDate.value || activeTrip.startDate };
      if (!commitActiveTrip(nextTrip)) return;
      if (!editingId) els.date.value = nextTrip.startDate;
      render();

      try {
        const syncedTrip = await updateTripInSupabase(nextTrip);
        replaceTripRecord(nextTrip.id, syncedTrip);
        saveLocalBackup("旅程起始日已同步到雲端，但本機備份更新失敗。");
        renderTripSelect();
        render();
        setStatus("ok", "已更新旅程起始日，並同步到雲端。");
      } catch (error) {
        setStatus("warn", `起始日已先保存於本機，雲端同步失敗：${getErrorMessage(error)}`);
      }
    });

    els.toggleShowAll.addEventListener("change", () => {
      const previousData = cloneData(data);
      data.ui.showAll = els.toggleShowAll.checked;
      if (!saveData("檢視設定儲存失敗。")) {
        data = previousData;
        return;
      }
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

    els.form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const activeTrip = getActiveTrip();
      const originalEditingId = editingId;
      const date = els.date.value;
      const time = els.time.value;
      const title = els.title.value.trim();
      const location = els.location.value.trim();
      const transport = getTransportValue().trim();
      const budget = normalizeBudget(els.budget.value);
      const notesHtml = sanitizeNotesHtml(els.notesEditor.innerHTML);

      if (!date || !time || !title) {
        setStatus("bad", "請至少填：日期、時間、行程名稱。");
        return;
      }

      const startLocal = `${date}T${time}`;
      if (!Number.isFinite(parseStartTs(startLocal))) {
        setStatus("bad", "日期 / 時間格式無法解析，請重新選擇。");
        return;
      }

      const nextItems = [...activeTrip.items];
      let successMessage = "已新增行程，並自動排序。";

      if (editingId) {
        const index = nextItems.findIndex((item) => item.id === editingId);
        if (index === -1) {
          setStatus("bad", "找不到要編輯的行程（可能已被刪除）。");
          clearForm();
          render();
          return;
        }
        nextItems[index] = {
          ...nextItems[index],
          startLocal,
          title,
          location,
          transport,
          budget,
          notesHtml,
        };
        successMessage = "已更新行程，並自動排序。";
      } else {
        nextItems.push({
          id: uid(),
          startLocal,
          title,
          location,
          transport,
          budget,
          notesHtml,
          createdAt: Date.now(),
        });
      }

      const nextTrip = { ...activeTrip, items: nextItems };
      if (!commitActiveTrip(nextTrip, successMessage)) return;
      render();
      clearForm(successMessage);
      if (isMobileViewport()) setMobileFormCollapsed(true);

      try {
        const localItem = originalEditingId
          ? nextItems.find((item) => item.id === originalEditingId)
          : nextItems[nextItems.length - 1];
        const { syncedTrip, syncedItem } = await upsertTripItemInSupabase(nextTrip, localItem);
        replaceTripRecord(nextTrip.id, syncedTrip);
        replaceTripItemRecord(syncedTrip.id, localItem.id, syncedItem);
        saveLocalBackup("行程已同步到雲端，但本機備份更新失敗。");
        renderTripSelect();
        render();
        clearForm(originalEditingId ? "已更新行程，並同步到雲端。" : "已新增行程，並同步到雲端。");
      } catch (error) {
        setStatus("warn", `行程已先保存於本機，雲端同步失敗：${getErrorMessage(error)}`);
      }
    });

    els.btnCancelEdit.addEventListener("click", () => {
      clearForm();
      if (isMobileViewport()) setMobileFormCollapsed(true);
    });

    els.btnDelete.addEventListener("click", async () => {
      if (!editingId) return;
      const activeTrip = getActiveTrip();
      const target = activeTrip.items.find((item) => item.id === editingId);
      if (!target) {
        clearForm();
        render();
        return;
      }
      const ok = confirm(`確定刪除這筆行程？\n\n${target.startLocal}\n${target.title}`);
      if (!ok) return;
      const nextTrip = {
        ...activeTrip,
        items: activeTrip.items.filter((item) => item.id !== editingId),
      };
      if (!commitActiveTrip(nextTrip, "已刪除行程。")) return;
      clearForm("已刪除行程。");
      if (isMobileViewport()) setMobileFormCollapsed(true);
      render();

      try {
        await deleteTripItemInSupabase(target.id);
        setStatus("ok", "已刪除行程，並同步到雲端。");
      } catch (error) {
        setStatus("warn", `行程已先從本機移除，雲端同步失敗：${getErrorMessage(error)}`);
      }
    });

    els.btnLink.addEventListener("click", () => {
      const url = (els.linkUrl.value || "").trim();
      if (!isValidHttpUrl(url)) {
        setStatus("bad", "請輸入有效網址（http:// 或 https://）。");
        return;
      }

      const selection = document.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setStatus("bad", "請先在備註欄選取一段文字。");
        return;
      }

      const range = selection.getRangeAt(0);
      if (!els.notesEditor.contains(range.commonAncestorContainer)) {
        setStatus("bad", "請在備註欄內選取文字後再套用連結。");
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

    els.btnExport.addEventListener("click", exportData);
    els.importFile.addEventListener("change", importData);
    els.btnClear.addEventListener("click", clearActiveTripItems);

    // 登出事件
    els.btnLogout.addEventListener("click", handleLogout);

    window.addEventListener("resize", syncFormPanelUi);
  }

  async function init() {
    // 檢查登入狀態
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      // 未登入，重定向到登入頁面
      window.location.href = 'login.html';
      return;
    }

    // 檢查用戶角色
    const { data: userData, error: userError } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (userError || !userData) {
      await supabaseClient.auth.signOut();
      window.location.href = 'login.html';
      return;
    }

    currentUser = { ...session.user, role: userData.role };

    data = loadData();
    try {
      const remoteData = await loadTripsFromSupabase(data);
      if (remoteData) {
        startupStatus = null;
        data = remoteData;
        saveLocalBackup("雲端資料已載入，但本機備份更新失敗。");
      } else if (data?.trips?.length) {
        rememberStartupStatus("warn", "目前雲端尚無旅程資料，已先載入本機備援。");
      } else {
        data = createDefaultData();
      }
    } catch (error) {
      rememberStartupStatus("warn", `雲端資料讀取失敗，已改用本機備援：${getErrorMessage(error, "讀取 Supabase 失敗。")}`);
    }

    // 隱藏載入遮罩
    els.loading.style.display = 'none';

    mobileFormCollapsed = isMobileViewport();
    renderTripSelect();
    wireEvents();
    clearForm();
    if (startupStatus) {
      setStatus(startupStatus.kind, startupStatus.text);
    } else {
      setStatus("ok", `歡迎 ${userData.role === 'admin' ? '管理者' : '使用者'} ${session.user.email}`);
    }
    syncFormPanelUi();
    render();
  }

  init();
})();
