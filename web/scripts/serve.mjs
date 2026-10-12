import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../dist/", import.meta.url));
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
export async function serve(port = 0) {
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    const route =
      path === "/preview/"
        ? "index.html"
        : path.startsWith("/preview/")
          ? path.slice(9)
          : "";
    if (
      !route ||
      route.includes("..") ||
      route.startsWith("/") ||
      route.includes("\\")
    ) {
      response.writeHead(404).end("Not found");
      return;
    }
    try {
      const data = await readFile(resolve(root, route));
      response.writeHead(200, {
        "Content-Type": types[extname(route)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(data);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(port, "0.0.0.0", resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}/preview/` };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await serve(Number(process.argv[2] ?? 4173));
  console.log(`Production export: ${url}`);
}
