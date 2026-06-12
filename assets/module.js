(async () => {
  const root = document.getElementById("module-root");
  const mode = document.body.dataset.mode || "page";

  try {
    const manifestResponse = await fetch("module.json", { cache: "no-store" });
    if (!manifestResponse.ok) {
      throw new Error(`module.json returned HTTP ${manifestResponse.status}`);
    }

    const manifest = await manifestResponse.json();
    const endpoints = Array.isArray(manifest.runtimeData?.endpoints) ? manifest.runtimeData.endpoints : [];
    const selectedEndpoints = mode === "dashboard" ? endpoints.slice(0, 1) : endpoints;

    root.innerHTML = `
      <p class="module-eyebrow">${escapeHtml(manifest.categoryLabel || manifest.category || "LavronOS module")}</p>
      <h1>${escapeHtml(manifest.name || manifest.id)}</h1>
      <p class="module-summary">${escapeHtml(manifest.summary || manifest.description || "")}</p>
      <div class="module-grid" id="module-grid"></div>
    `;

    const grid = document.getElementById("module-grid");
    if (!selectedEndpoints.length) {
      grid.innerHTML = '<section class="module-card"><p class="module-status">This module does not declare runtime data endpoints.</p></section>';
      return;
    }

    await Promise.all(selectedEndpoints.map((endpoint) => renderEndpoint(grid, endpoint)));
  } catch (error) {
    root.innerHTML = `<p class="module-status module-status--error">${escapeHtml(error instanceof Error ? error.message : "Could not load module.")}</p>`;
  }

  async function renderEndpoint(grid, endpoint) {
    const card = document.createElement("section");
    card.className = "module-card";
    card.innerHTML = `<h2>${escapeHtml(endpoint.label || endpoint.url || "Module data")}</h2><p class="module-status">Loading...</p>`;
    grid.appendChild(card);

    try {
      const response = await fetch(endpoint.url, { cache: "no-store", credentials: "same-origin" });
      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json") ? await response.json() : await response.text();
      if (!response.ok) {
        throw new Error(typeof payload === "string" ? payload : payload.error || `HTTP ${response.status}`);
      }
      card.innerHTML = `<h2>${escapeHtml(endpoint.label || endpoint.url)}</h2><pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`;
    } catch (error) {
      card.innerHTML = `<h2>${escapeHtml(endpoint.label || endpoint.url)}</h2><p class="module-status module-status--error">${escapeHtml(error instanceof Error ? error.message : "Request failed.")}</p>`;
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
