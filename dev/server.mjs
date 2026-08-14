/**
 * DEV-ONLY static server used for offline verification.
 * Emulates the two Vite behaviours this project relies on:
 *   - `?raw` imports of .glsl/.vert/.frag files
 *   - extensionless module specifiers
 * Not part of the shipped application (Vite handles both natively).
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const PORT = Number(process.env.PORT ?? 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
};

async function exists(path) {
  try {
    const info = await stat(path);
    return info.isFile();
  } catch {
    return false;
  }
}

async function resolve(pathname) {
  const direct = join(ROOT, normalize(pathname));
  if (await exists(direct)) return direct;
  for (const candidate of [`${direct}.js`, `${direct}.mjs`, join(direct, 'index.js')]) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

/**
 * Extensionless specifiers must be redirected rather than served in place:
 * the browser resolves a module's relative imports against its final URL, so
 * serving /a/b for /a/b/index.js would break every sibling import.
 */
async function canonicalPath(pathname) {
  const file = await resolve(pathname);
  if (!file) return null;
  const web = `/${file.slice(ROOT.length + 1)}`;
  return web === pathname ? null : web;
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/dev/index.html';

    const canonical = await canonicalPath(pathname);
    if (canonical) {
      response.writeHead(302, { location: canonical + url.search });
      response.end();
      return;
    }

    // Vite's `?raw` suffix: return the file contents as a JS module.
    if (url.searchParams.has('raw')) {
      const file = await resolve(pathname);
      if (!file) {
        response.writeHead(404);
        response.end('not found');
        return;
      }
      const source = await readFile(file, 'utf8');
      response.writeHead(200, { 'content-type': MIME['.js'] });
      response.end(`export default ${JSON.stringify(source)};`);
      return;
    }

    const file = await resolve(pathname);
    if (!file) {
      response.writeHead(404);
      response.end('not found');
      return;
    }

    const body = await readFile(file);
    response.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500);
    response.end(String(error));
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`dev server on http://127.0.0.1:${PORT}`);
});
