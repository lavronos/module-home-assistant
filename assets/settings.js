(() => {
  const root = document.getElementById("settings-root");
  const api = "/api/modules/runtime/home-assistant/api";

  void load();

  async function load() {
    const response = await fetch(`${api}/status`, { cache: "no-store", credentials: "same-origin" });
    const status = await response.json().catch(() => ({}));
    if (!response.ok) return renderError(status.error?.message || "Could not load bridge status.");

    root.innerHTML = `
      <section class="module-card">
        <h2>LavronOS HA Bridge</h2>
        <p class="module-status">${status.connected ? `${escapeHtml(status.bridge?.homeAssistantName || "Home Assistant")} is connected.` : "Home Assistant is not connected."}</p>
        ${status.pairingCode?.code ? `<p class="module-code">${escapeHtml(status.pairingCode.code)}</p>` : ""}
        <div class="module-actions">
          ${status.connected ? '<button id="disconnect" type="button">Disconnect</button>' : '<button id="pair" class="primary" type="button">Create pairing code</button>'}
        </div>
        <p id="message" class="module-status"></p>
      </section>
    `;

    document.getElementById("pair")?.addEventListener("click", () => void act("pairing-code", "POST"));
    document.getElementById("disconnect")?.addEventListener("click", () => void act("disconnect", "DELETE"));
  }

  async function act(route, method) {
    const response = await fetch(`${api}/${route}`, { method, credentials: "same-origin" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      document.getElementById("message").textContent = payload.error?.message || "Bridge request failed.";
      return;
    }
    await load();
  }

  function renderError(message) {
    root.innerHTML = `<p class="module-status module-status--error">${escapeHtml(message)}</p>`;
  }

  function escapeHtml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
})();
