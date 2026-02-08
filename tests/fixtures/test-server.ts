import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

export interface TestServer {
  url: string;
  port: number;
  server: Server;
  close: () => Promise<void>;
}

export async function createTestServer(port = 0): Promise<TestServer> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', `http://localhost`);

      // API endpoints for testing
      if (url.pathname === '/api/data') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Hello from API', timestamp: Date.now() }));
        return;
      }

      if (url.pathname === '/api/echo') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ method: req.method, headers: req.headers, body }));
        });
        return;
      }

      if (url.pathname === '/api/slow') {
        await new Promise((r) => setTimeout(r, 1000));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Slow response' }));
        return;
      }

      if (url.pathname === '/api/error') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
        return;
      }

      // Serve static files from test-pages directory
      const filePath = join(__dirname, 'test-pages', url.pathname === '/' ? 'index.html' : url.pathname);

      try {
        const content = await readFile(filePath);
        const ext = extname(filePath);
        const mimeType = MIME_TYPES[ext] || 'text/plain';
        res.writeHead(200, { 'Content-Type': mimeType });
        res.end(content);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    server.on('error', reject);

    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to get server address'));
        return;
      }

      const serverPort = addr.port;
      const serverUrl = `http://127.0.0.1:${serverPort}`;

      resolve({
        url: serverUrl,
        port: serverPort,
        server,
        close: () =>
          new Promise((resolveClose) => {
            server.close(() => resolveClose());
          }),
      });
    });
  });
}
