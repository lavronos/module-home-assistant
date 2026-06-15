(async () => {
  const root = document.getElementById("module-root");
  const mode = document.body.dataset.mode === "dashboard" ? "dashboard" : "page";
  const api = "/api/modules/runtime/home-assistant/api";

  renderLoading();

  try {
    const [manifest, status] = await Promise.all([
      requestJson("module.json", "Не удалось загрузить Home Assistant."),
      requestJson(`${api}/status`, "Не удалось получить состояние HA Bridge.")
    ]);

    if (!status.connected) {
      renderSetupState(manifest);
      return;
    }

    renderOverview(manifest, normalizeOverview(status));
  } catch (error) {
    renderError(error instanceof Error ? error.message : "Не удалось открыть Home Assistant.");
  }

  function renderLoading() {
    root.innerHTML = `<div class="module-loading"><span class="spinner"></span>Получаю данные Home Assistant...</div>`;
  }

  function normalizeOverview(status) {
    const bridge = status.bridge || {};
    const snapshot = status.latestSnapshot || {};
    const data = snapshotRoot(snapshot.data || {});
    const states = recordArray(data, ["states", "state", "entityStates"]);
    const entities = recordArray(data, ["entities", "entityRegistry", "entity_registry"]);
    const devices = recordArray(data, ["devices", "deviceRegistry", "device_registry"]);
    const areas = recordArray(data, ["areas", "areaRegistry", "area_registry"]);
    const registry = new Map();
    const stateById = new Map();

    entities.forEach((item) => {
      const id = text(item.entity_id, item.entityId, item.id);
      if (id) registry.set(id, item);
    });
    states.forEach((item) => {
      const id = text(item.entity_id, item.entityId, item.id);
      if (id) stateById.set(id, item);
    });

    const entityIds = new Set([...registry.keys(), ...stateById.keys()]);
    const areaById = new Map(
      areas
        .map((area) => {
          const id = text(area.area_id, area.areaId, area.id, area.name);
          return id ? [id, { id, name: text(area.name, id), floor: text(area.floor, area.level) }] : null;
        })
        .filter(Boolean)
    );
    const deviceById = new Map(
      devices
        .map((device) => {
          const id = text(device.id, device.device_id, device.deviceId);
          return id ? [id, device] : null;
        })
        .filter(Boolean)
    );

    const normalizedEntities = [...entityIds].sort().map((entityId) => {
      const item = registry.get(entityId) || {};
      const stateItem = stateById.get(entityId) || {};
      const attributes = object(stateItem.attributes);
      const deviceId = text(item.device_id, item.deviceId, stateItem.device_id, attributes.device_id);
      const device = deviceById.get(deviceId) || {};
      const areaId = text(item.area_id, item.areaId, stateItem.area_id, attributes.area_id, device.area_id, device.areaId);
      const area = areaById.get(areaId);
      const state = text(stateItem.state, item.state, "unknown");
      const domain = entityId.split(".")[0] || "entity";
      const unit = text(attributes.unit_of_measurement, attributes.unit);
      return {
        entityId,
        name: text(attributes.friendly_name, item.name_by_user, item.name, item.original_name, labelFromId(entityId)),
        state,
        stateLabel: formatState(state, unit),
        domain,
        areaId: areaId || null,
        areaName: area?.name || null,
        deviceId: deviceId || null,
        deviceName: text(device.name_by_user, device.name, device.model),
        unavailable: state === "unavailable" || state === "unknown",
        lastTriggered: text(attributes.last_triggered, item.last_triggered),
        lastUpdated: text(stateItem.last_updated, stateItem.lastChanged)
      };
    });

    const normalizedDevices = devices
      .map((device) => {
        const id = text(device.id, device.device_id, device.deviceId);
        if (!id) return null;
        const deviceEntities = normalizedEntities.filter((entity) => entity.deviceId === id);
        const areaId = text(device.area_id, device.areaId, deviceEntities.find((entity) => entity.areaId)?.areaId);
        return {
          id,
          name: text(device.name_by_user, device.name, device.model, id),
          areaId: areaId || null,
          areaName: areaById.get(areaId)?.name || deviceEntities.find((entity) => entity.areaName)?.areaName || null,
          manufacturer: text(device.manufacturer),
          model: text(device.model),
          entities: deviceEntities,
          unavailable: deviceEntities.filter((entity) => entity.unavailable).length
        };
      })
      .filter(Boolean);

    const roomIds = new Set([...areaById.keys(), ...normalizedEntities.map((entity) => entity.areaId).filter(Boolean)]);
    const rooms = [...roomIds].map((areaId) => {
      const roomEntities = normalizedEntities.filter((entity) => entity.areaId === areaId);
      const roomDevices = normalizedDevices.filter((device) => device.areaId === areaId);
      const lights = roomEntities.filter((entity) => entity.domain === "light");
      return {
        id: areaId,
        name: areaById.get(areaId)?.name || roomEntities[0]?.areaName || labelFromId(areaId),
        floor: areaById.get(areaId)?.floor || "",
        entities: roomEntities,
        devices: roomDevices,
        lightsOn: lights.filter((entity) => entity.state === "on").length,
        lightsTotal: lights.length,
        unavailable: roomEntities.filter((entity) => entity.unavailable).length,
        temperature: roomEntities.find((entity) => /temperature/.test(entity.entityId))?.stateLabel || "",
        humidity: roomEntities.find((entity) => /humidity/.test(entity.entityId))?.stateLabel || ""
      };
    }).sort((left, right) => left.name.localeCompare(right.name));

    const counts = bridge.counts || {};
    const automations = normalizedEntities.filter((entity) => entity.domain === "automation");
    const sensors = normalizedEntities.filter((entity) => ["sensor", "binary_sensor"].includes(entity.domain));
    const scenes = normalizedEntities.filter((entity) => entity.domain === "scene");
    const scripts = normalizedEntities.filter((entity) => entity.domain === "script");
    const domains = [...normalizedEntities.reduce((map, entity) => map.set(entity.domain, (map.get(entity.domain) || 0) + 1), new Map()).entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((left, right) => right.count - left.count);

    return {
      bridge,
      snapshot,
      name: text(data.homeAssistant?.name, data.home_assistant?.name, data.info?.name, bridge.homeAssistantName, "Home Assistant"),
      version: text(data.homeAssistant?.version, data.home_assistant?.version, data.info?.version, bridge.homeAssistantVersion),
      url: text(data.homeAssistant?.url, data.home_assistant?.url, data.info?.external_url),
      counts: {
        areas: rooms.length || number(counts.areas),
        devices: normalizedDevices.length || number(counts.devices),
        entities: normalizedEntities.length || number(counts.entities),
        automations: automations.length || number(counts.automations),
        sensors: sensors.length,
        unavailable: normalizedEntities.filter((entity) => entity.unavailable).length
      },
      rooms,
      devices: normalizedDevices,
      entities: normalizedEntities,
      automations,
      sensors,
      scenes,
      scripts,
      domains,
      events: Array.isArray(status.recentEvents) ? status.recentEvents : []
    };
  }

  function renderOverview(manifest, data) {
    if (mode === "dashboard") {
      root.innerHTML = `
        <section class="dashboard-card">
          <div class="dashboard-header">
            <div class="identity-icon">${icon("home")}</div>
            <div class="min-width-0 dashboard-title"><span>Home Assistant</span><strong>${escapeHtml(data.name)}</strong></div>
            ${statusPill("Подключено", "green")}
          </div>
          <div class="dashboard-stats">
            ${smallMetric("Помещения", data.counts.areas)}
            ${smallMetric("Устройства", data.counts.devices)}
            ${smallMetric("Объекты", data.counts.entities)}
            ${smallMetric("Автоматизации", data.counts.automations)}
          </div>
          <div class="dashboard-footer">${icon("refresh")} ${escapeHtml(updateLabel(data))}</div>
        </section>
      `;
      return;
    }

    root.innerHTML = `
      <div class="page-stack">
        ${pageHeader(manifest, data)}
        <section class="metric-grid">
          ${metric("shield", "Bridge", "Подключён", data.bridge.lastSeenAt ? `Связь ${formatDate(data.bridge.lastSeenAt)}` : "Защищённое соединение", "green")}
          ${metric("home", "Помещения", data.counts.areas, `${data.counts.devices} устройств`, "blue")}
          ${metric("cpu", "Объекты", data.counts.entities, `${data.counts.sensors} сенсоров`, "violet")}
          ${metric("list", "Автоматизации", data.automations.filter((item) => item.state === "on").length, `из ${data.counts.automations} включено`, "amber")}
        </section>

        <section class="module-panel bridge-panel">
          <div>
            <span class="section-label">HA Bridge</span>
            <h2>${escapeHtml(data.name)}</h2>
            <p>${escapeHtml(data.version ? `Home Assistant ${data.version}` : "Защищённая локальная синхронизация")}</p>
          </div>
          <div class="bridge-facts">
            ${fact("Подключён", formatDate(data.bridge.pairedAt))}
            ${fact("Последний снимок", formatDate(data.bridge.lastSnapshotAt || data.snapshot.receivedAt))}
            ${fact("Последнее событие", formatDate(data.bridge.lastEventAt))}
          </div>
          <a class="secondary-button" href="/settings#module-home-assistant" target="_top">${icon("settings")} Настройки подключения</a>
        </section>

        <section class="three-column-layout">
          <div class="column-stack">
            ${roomsPanel(data.rooms)}
            ${entityPanel("Автоматизации", "list", data.automations, 12, "Автоматизации пока не пришли в snapshot.")}
          </div>
          <div class="column-stack">
            ${entityPanel("Сенсоры", "activity", data.sensors, 14, "Сенсоры пока не пришли в snapshot.")}
            ${eventsPanel(data.events)}
          </div>
          <div class="column-stack">
            ${actionsPanel(data.scenes, data.scripts)}
            ${domainsPanel(data.domains, data.counts.unavailable)}
          </div>
        </section>

        <section class="two-column-layout">
          ${devicesPanel(data.devices)}
          ${entityPanel("Все объекты", "cpu", data.entities, 18, "Список объектов пока пуст.")}
        </section>
      </div>
    `;

    document.getElementById("refresh")?.addEventListener("click", () => window.location.reload());
  }

  function pageHeader(manifest, data) {
    return `
      <header class="app-header">
        <div class="min-width-0">
          <div class="title-row">
            <span class="title-icon">${icon("home")}</span>
            <div class="min-width-0">
              <div class="title-with-status"><h1>${escapeHtml(manifest.name || "Home Assistant")}</h1>${statusPill("В сети", "green")}</div>
              <p>${escapeHtml(manifest.summary || "")}</p>
            </div>
          </div>
          <div class="header-meta">
            <span>${escapeHtml(data.url ? displayUrl(data.url) : data.name)}</span>
            ${data.version ? `<span>Версия ${escapeHtml(data.version)}</span>` : ""}
            <span>${escapeHtml(updateLabel(data))}</span>
          </div>
        </div>
        <button class="refresh-button" id="refresh" type="button">${icon("refresh")} Обновить</button>
      </header>
    `;
  }

  function roomsPanel(rooms) {
    return panel("Помещения", "home", rooms.length
      ? `<div class="room-grid">${rooms.map((room) => `
          <article class="room-card">
            <div class="room-card__top">${icon("home")}${room.unavailable ? `<span class="warning-badge">${room.unavailable} недоступно</span>` : ""}</div>
            <h3 title="${escapeAttribute(room.name)}">${escapeHtml(room.name)}</h3>
            <p>${escapeHtml([room.temperature, room.humidity].filter(Boolean).join(" · ") || room.floor || "Устройства Home Assistant")}</p>
            <footer><span>${room.devices.length} устройств · ${room.entities.length} объектов</span>${room.lightsTotal ? `<strong>${icon("light")} ${room.lightsOn}/${room.lightsTotal}</strong>` : ""}</footer>
          </article>`).join("")}</div>`
      : empty("Home Assistant пока не прислал помещения."));
  }

  function entityPanel(title, iconName, entities, limit, emptyText) {
    return panel(title, iconName, entities.length
      ? `<div class="entity-list">${entities.slice(0, limit).map((entity) => `
          <div class="entity-row">
            <span class="entity-icon">${icon(domainIcon(entity.domain))}</span>
            <div class="min-width-0"><strong title="${escapeAttribute(entity.name)}">${escapeHtml(entity.name)}</strong><span title="${escapeAttribute([entity.areaName, entity.entityId].filter(Boolean).join(" · "))}">${escapeHtml([entity.areaName, entity.entityId].filter(Boolean).join(" · "))}</span></div>
            <div class="entity-state ${entity.unavailable ? "entity-state--warning" : ""}">${escapeHtml(entity.stateLabel)}</div>
          </div>`).join("")}</div>`
      : empty(emptyText), entities.length);
  }

  function eventsPanel(events) {
    return panel("Последние события", "radio", events.length
      ? `<div class="event-list">${events.slice(0, 10).map((event) => `
          <div class="event-row">
            <span class="event-icon">${icon("radio")}</span>
            <div class="min-width-0"><strong>${escapeHtml(event.entityId || event.eventType || "Home Assistant")}</strong><span>${escapeHtml(event.eventType || "state_changed")}</span></div>
            <time>${escapeHtml(formatDate(event.receivedAt, true))}</time>
          </div>`).join("")}</div>`
      : empty("Событий изменения состояния пока нет."), events.length);
  }

  function actionsPanel(scenes, scripts) {
    const actions = [...scenes.map((item) => ({ ...item, kind: "Сцена" })), ...scripts.map((item) => ({ ...item, kind: "Скрипт" }))];
    return panel("Сцены и скрипты", "power", actions.length
      ? `<div class="action-grid">${actions.slice(0, 12).map((item) => `
          <article class="action-card"><span>${icon(item.domain === "scene" ? "sliders" : "power")}</span><small>${item.kind}</small><strong title="${escapeAttribute(item.name)}">${escapeHtml(item.name)}</strong><code>${escapeHtml(item.entityId)}</code></article>`).join("")}</div>`
      : empty("Сцены и скрипты пока не пришли в snapshot."), actions.length);
  }

  function domainsPanel(domains, unavailable) {
    return panel("Домены HA", "grid", `
      <div class="domain-grid">${domains.slice(0, 12).map((item) => `<div><span>${escapeHtml(domainLabel(item.domain))}</span><strong>${item.count}</strong></div>`).join("")}</div>
      ${unavailable ? `<div class="warning-note">${icon("warning")} ${unavailable} объектов недоступно</div>` : ""}
    `);
  }

  function devicesPanel(devices) {
    return panel("Все устройства", "devices", devices.length
      ? `<div class="entity-list entity-list--scroll">${devices.slice(0, 24).map((device) => `
          <div class="entity-row">
            <span class="entity-icon">${icon("devices")}</span>
            <div class="min-width-0"><strong title="${escapeAttribute(device.name)}">${escapeHtml(device.name)}</strong><span>${escapeHtml([device.areaName, device.manufacturer, device.model].filter(Boolean).join(" · ") || "Без помещения")}</span></div>
            <div class="entity-state">${device.entities.length} объектов${device.unavailable ? `<small>${device.unavailable} недоступно</small>` : ""}</div>
          </div>`).join("")}</div>`
      : empty("Список устройств пока пуст."), devices.length);
  }

  function panel(title, iconName, content, count) {
    return `<article class="module-panel"><div class="panel-title"><div><span class="section-label">${icon(iconName)} Home Assistant</span><h2>${escapeHtml(title)}</h2></div>${count !== undefined ? `<span class="count-badge">${count}</span>` : ""}</div>${content}</article>`;
  }

  function metric(iconName, label, value, detail, tone) {
    return `<article class="metric-card metric-card--${tone}"><span class="metric-card__icon">${icon(iconName)}</span><div class="min-width-0"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong><small>${escapeHtml(detail)}</small></div></article>`;
  }

  function fact(label, value) {
    return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "Нет данных")}</strong></div>`;
  }

  function statusPill(label, tone) {
    return `<span class="status-pill status-pill--${tone}"><i></i>${escapeHtml(label)}</span>`;
  }

  function smallMetric(label, value) {
    return `<div class="small-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
  }

  function renderSetupState(manifest) {
    root.innerHTML = `
      <div class="page-stack">
        <header class="app-header"><div class="title-row"><span class="title-icon">${icon("home")}</span><div><h1>${escapeHtml(manifest.name || "Home Assistant")}</h1><p>${escapeHtml(manifest.summary || "")}</p></div></div></header>
        <section class="connection-state">
          <span class="connection-icon">${icon("link")}</span>
          <div><span class="section-label">Требуется подключение</span><h2>Home Assistant не подключён</h2><p>Создайте код подключения в настройках модуля и введите его в интеграции LavronOS HA Bridge внутри Home Assistant.</p><a class="primary-button" href="/settings#module-home-assistant" target="_top">${icon("settings")} Открыть настройки Home Assistant</a></div>
        </section>
      </div>
    `;
  }

  function renderError(message) {
    root.innerHTML = `<section class="connection-state connection-state--error"><span class="connection-icon">${icon("warning")}</span><div><span class="section-label">Ошибка модуля</span><h2>Не удалось открыть Home Assistant</h2><p>${escapeHtml(message)}</p><a class="primary-button" href="/settings#module-home-assistant" target="_top">Проверить настройки</a></div></section>`;
  }

  function snapshotRoot(value) {
    const current = object(value);
    const data = object(current.data);
    return data.states || data.entities || data.devices || data.areas ? data : current;
  }

  function recordArray(source, keys) {
    const containers = [source, object(source.data), object(source.snapshot), object(source.registries)];
    for (const container of containers) {
      for (const key of keys) {
        const value = container[key];
        if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object");
        if (value && typeof value === "object") return Object.values(value).filter((item) => item && typeof item === "object");
      }
    }
    return [];
  }

  function object(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function text(...values) {
    const value = values.find((item) => typeof item === "string" && item.trim());
    return value ? value.trim() : "";
  }

  function number(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function labelFromId(value) {
    return String(value || "").split(".").pop().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function formatState(state, unit) {
    const labels = { on: "Включено", off: "Выключено", unavailable: "Недоступно", unknown: "Нет данных", home: "Дома", not_home: "Не дома" };
    return unit && Number.isFinite(Number(state)) ? `${state} ${unit}` : labels[state] || state || "Нет данных";
  }

  function domainLabel(domain) {
    return { automation: "Автоматизации", binary_sensor: "Бинарные сенсоры", climate: "Климат", cover: "Шторы", device_tracker: "Трекеры", light: "Освещение", media_player: "Медиа", person: "Люди", scene: "Сцены", script: "Скрипты", sensor: "Сенсоры", switch: "Переключатели" }[domain] || labelFromId(domain);
  }

  function domainIcon(domain) {
    return { automation: "list", binary_sensor: "activity", climate: "activity", light: "light", scene: "sliders", script: "power", sensor: "activity" }[domain] || "cpu";
  }

  function updateLabel(data) {
    const value = data.bridge.lastSnapshotAt || data.snapshot.receivedAt || data.bridge.lastSeenAt;
    return value ? `Снимок ${formatDate(value)}` : "Ожидаю первый снимок";
  }

  function displayUrl(value) {
    try {
      return new URL(value).host;
    } catch {
      return value;
    }
  }

  function formatDate(value, timeOnly = false) {
    if (!value) return "Нет данных";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("ru-RU", timeOnly ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function empty(message) {
    return `<div class="empty-state">${escapeHtml(message)}</div>`;
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

  function icon(name) {
    const paths = {
      activity: '<path d="M3 12h4l2-7 4 14 2-7h6"/>',
      cpu: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>',
      devices: '<rect x="4" y="3" width="16" height="12" rx="2"/><path d="M8 21h8M12 15v6"/>',
      grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
      home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/>',
      light: '<path d="M9 18h6M10 22h4"/><path d="M8.5 14.5A7 7 0 1 1 15.5 14.5C14.5 15.4 14 16 14 18h-4c0-2-.5-2.6-1.5-3.5Z"/>',
      link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/>',
      list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
      power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>',
      radio: '<path d="M5.6 18.4a9 9 0 0 1 0-12.8M8.5 15.5a5 5 0 0 1 0-7M18.4 5.6a9 9 0 0 1 0 12.8M15.5 8.5a5 5 0 0 1 0 7"/><circle cx="12" cy="12" r="1"/>',
      refresh: '<path d="M20 11a8 8 0 1 0 2 5M20 4v7h-7"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
      shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
      sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/>',
      warning: '<path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>'
    };
    return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.grid}</svg>`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }
})();
