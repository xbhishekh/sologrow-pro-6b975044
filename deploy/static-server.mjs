#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.argv[2] || "dist");
const port = Number(process.argv[3] || 3000);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function safeAssetPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }

  const relative = normalize(decoded).replace(/^[/\]+/, "");
  const candidate = resolve(join(root, relative));
  // Robust check: candidate must be within root. 
  // We use a trailing slash to avoid matching /opt/dist-backup with /opt/dist prefix.
  const rootDir = root.endsWith("/") ? root : `${root}/`;
  return (candidate === root || candidate.startsWith(rootDir)) ? candidate : undefined;
}

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
  let filePath = safeAssetPath(requestUrl.pathname);

  if (!filePath) {
    response.writeHead(400).end("Bad request");
    return;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = join(root, "index.html");
  }

  if (!existsSync(filePath)) {
    response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" }).end("Build unavailable");
    return;
  }

  const extension = extname(filePath).toLowerCase();
  const immutable = requestUrl.pathname.startsWith("/assets/");
  response.writeHead(200, {
    "Content-Type": contentTypes[extension] || "application/octet-stream",
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
});

server.on("error", (err) => {
  console.error("Server error:", err.message);
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Ensure no other process is bound to it.`);
  }
  process.exit(1);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`OrganicSMM frontend serving ${root} on 0.0.0.0:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
