const routes = new Map([
  ["status", "/api/ha/status"],
  ["snapshot", "/api/ha/snapshot"],
  ["pairing-code", "/api/ha/pairing-code"],
  ["disconnect", "/api/ha/disconnect"]
]);

export async function handleRequest(request, context) {
  const targetPath = routes.get(context.path);
  if (!targetPath) {
    return Response.json({ ok: false, error: { message: "Home Assistant module route not found." } }, { status: 404 });
  }

  return proxyRequest(request, targetPath);
}

async function proxyRequest(request, targetPath) {
  const target = new URL(targetPath, request.url);
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  return fetch(target, {
    method: request.method,
    headers: request.headers,
    body,
    redirect: "manual"
  });
}
