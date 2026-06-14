(async () => {
  const root = document.getElementById("module-root");
  const mode = document.body.dataset.mode === "dashboard" ? "dashboard" : "page";
  const api = "/api/modules/runtime/home-assistant/api";

  try {
    const [manifest, status] = await Promise.all([
      requestJson("module.json", "Не удалось загрузить Home Assistant."),
      requestJson(`${api}/status`, "Не удалось получить состояние HA Bridge.")
    ]);

    renderShell(manifest);

    if (!status.connected) {
      renderSetupState();
      return;
    }

    renderOverview(status);
  } catch (error) {
    renderError(error instanceof Error ? error.message : "Не удалось открыть Home Assistant.");
  }

  function renderShell(manifest) {
    root.innerHTML = `
      <header class="module-heading">
        <div class="min-width-0">
          <p class="module-eyebrow">${escapeHtml(manifest.categoryLabel || "Smart Home")}</p>
          <h1>${escapeHtml(manifest.name || "Home Assistant")}</h1>
          <p class="module-summary">${escapeHtml(manifest.summary || manifest.description || "")}</p>
        </div>
        <button class="refresh-button" id="refresh" type="button">Обновить</button>
      </header>
      <div id="module-content"><div class="module-loading"><span class="spinner"></span>Получаю данные Home Assistant...</div></div>
    `;
    document.getElementById("refresh")?.addEventListener("click", () => window.location.reload());
  }

  function renderSetupState() {
    const content = document.getElementById("module-content") || root;
    content.innerHTML = `
      <section class="connection-state">
        <div class="connection-icon">HA</div>
        <div>
          <p class="module-eyebrow">Требуется подключение</p>
          <h2>Home Assistant не подключён</h2>
          <p>Создайте код подключения в настройках модуля и введите его в интеграции LavronOS HA Bridge внутри Home Assistant.</p>
          <a class="module-button" href="/settings#module-home-assistant" target="_top">Открыть настройки Home Assistant</a>
        </div>
      </section>
    `;
  }

  function renderOverview(status) {
    const content = document.getElementById("module-content");
    const bridge = status.bridge || {};
    const counts = bridge.counts || {};
    const events = Array.isArray(status.recentEvents) ? status.recentEvents : [];
    const snapshot = status.latestSnapshot || {};
    const snapshotData = snapshot.data && typeof snapshot.data === "object" ? snapshot.data : {};
    const snapshotName =
      snapshotData.homeAssistant?.name ||
      snapshotData.home_assistant?.name ||
      snapshotData.info?.name ||
      bridge.homeAssistantName ||
      "Home Assistant";
    const snapshotVersion =
      snapshotData.homeAssistant?.version ||
      snapshotData.home_assistant?.version ||
      snapshotData.info?.version ||
      bridge.homeAssistantVersion ||
      "";

    if (mode === "dashboard") {
      content.innerHTML = `
        <section class="dashboard-card">
          <div class="dashboard-header">
            <div class="min-width-0"><p class="module-eyebrow">HA Bridge</p><h2>${escapeHtml(snapshotName)}</h2></div>
            <span class="status-pill"><span></span>Подключено</span>
          </div>
          <div class="dashboard-stats">
            ${smallMetric("Помещения", counts.areas)}
            ${smallMetric("Устройства", counts.devices)}
            ${smallMetric("Объекты", counts.entities)}
            ${smallMetric("Автоматизации", counts.automations)}
          </div>
          <p class="dashboard-update">${escapeHtml(lastUpdateLabel(bridge, snapshot))}</p>
        </section>
      `;
      return;
    }

    content.innerHTML = `
      <section class="hero-card">
        <div class="hero-icon">HA</div>
        <div class="min-width-0">
          <div class="hero-status"><span class="status-pill"><span></span>Bridge подключён</span></div>
          <h2>${escapeHtml(snapshotName)}</h2>
          <p>${escapeHtml(snapshotVersion ? `Home Assistant ${snapshotVersion}` : "Home Assistant через LavronOS HA Bridge")}</p>
          <div class="hero-meta">
            <span>Последняя связь: ${escapeHtml(formatDate(bridge.lastSeenAt))}</span>
            <span>Последний снимок: ${escapeHtml(formatDate(bridge.lastSnapshotAt || snapshot.receivedAt))}</span>
          </div>
        </div>
      </section>

      <section class="metric-grid">
        ${metric("Помещения", counts.areas, "Пространства Home Assistant", "blue")}
        ${metric("Устройства", counts.devices, "Подключённые устройства", "green")}
        ${metric("Объекты", counts.entities, `${numberValue(counts.states)} состояний`, "violet")}
        ${metric("Автоматизации", counts.automations, `${numberValue(counts.scenes)} сцен · ${numberValue(counts.scripts)} скриптов`, "amber")}
      </section>

      <section class="content-grid">
        <article class="panel">
          <div class="panel-heading"><div><p class="module-eyebrow">Синхронизация</p><h2>Состояние bridge</h2></div><span class="status-pill"><span></span>В сети</span></div>
          <dl class="detail-list">
            ${detail("Home Assistant", bridge.homeAssistantName)}
            ${detail("Версия", bridge.homeAssistantVersion)}
            ${detail("Подключён", formatDate(bridge.pairedAt))}
            ${detail("Последнее событие", formatDate(bridge.lastEventAt))}
          </dl>
          <a class="module-button module-button--secondary" href="/settings#module-home-assistant" target="_top">Управление подключением</a>
        </article>

        <article class="panel">
          <div class="panel-heading"><div><p class="module-eyebrow">Активность</p><h2>Последние события</h2></div><span class="count-pill">${events.length}</span></div>
          <div class="event-list">${renderEvents(events)}</div>
        </article>
      </section>
    `;
  }

  function renderEvents(events) {
    if (!events.length) {
      return '<div class="empty">Home Assistant пока не прислал событий изменения состояния.</div>';
    }

    return events
      .slice(0, 8)
      .map(
        (event) => `
          <div class="event-row">
            <span class="event-dot"></span>
            <div class="min-width-0">
              <strong>${escapeHtml(event.entityId || event.eventType || "Home Assistant")}</strong>
              <span>${escapeHtml(event.eventType || "state_changed")}</span>
            </div>
            <time>${escapeHtml(formatDate(event.receivedAt, true))}</time>
          </div>
        `
      )
      .join("");
  }

  function metric(label, value, detailText, tone) {
    return `<article class="metric metric--${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(numberValue(value))}</strong><small>${escapeHtml(detailText)}</small></article>`;
  }

  function smallMetric(label, value) {
    return `<div class="small-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(numberValue(value))}</strong></div>`;
  }

  function detail(label, value) {
    if (!value) return "";
    return `<div><dt>${escapeHtml(label)}</dt><dd title="${escapeAttribute(value)}">${escapeHtml(value)}</dd></div>`;
  }

  function lastUpdateLabel(bridge, snapshot) {
    const value = bridge.lastSnapshotAt || snapshot.receivedAt || bridge.lastSeenAt;
    return value ? `Обновлено ${formatDate(value)}` : "Ожидаю первый снимок";
  }

  async function requestJson(url, fallback) {
    const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(errorMessage(payload, fallback));
    return payload;
  }

  function errorMessage(payload, fallback) {
    if (typeof payload === "string" && payload.trim()) return payload;
    if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
    if (typeof payload?.error?.message === "string" && payload.error.message.trim()) return payload.error.message;
    if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;
    return fallback;
  }

  function renderError(message) {
    root.innerHTML = `<section class="connection-state connection-state--error"><div class="connection-icon">!</div><div><h2>Не удалось открыть Home Assistant</h2><p>${escapeHtml(message)}</p><a class="module-button" href="/settings#module-home-assistant" target="_top">Проверить настройки</a></div></section>`;
  }

  function numberValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? String(number) : "0";
  }

  function formatDate(value, timeOnly = false) {
    if (!value) return "Нет данных";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("ru-RU", timeOnly
      ? { hour: "2-digit", minute: "2-digit" }
      : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }
})();
