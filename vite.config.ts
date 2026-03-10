import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react-swc'

// Plugin que actúa como proxy de la API de Notion durante el desarrollo.
// En producción, la ruta /api/notion la sirve la serverless function de Vercel.
function notionApiDevPlugin(env: Record<string, string>): Plugin {
  const NOTION_TOKEN = env.VITE_NOTION_TOKEN;
  const DATABASE_ID = env.VITE_NOTION_DATABASE_ID;
  const NOTION_VACACIONES_TOKEN = env.VITE_NOTION_VACACIONES_TOKEN;
  const VACACIONES_DATABASE_ID = env.VITE_NOTION_VACACIONES_DATABASE_ID;
  const NOTION_API_BASE = 'https://api.notion.com/v1';
  const NOTION_VERSION = '2022-06-28';

  const readBody = (req: import('http').IncomingMessage): Promise<string> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks).toString()));
      req.on('error', reject);
    });

  return {
    name: 'notion-api-dev',
    configureServer(server) {
      server.middlewares.use('/api/notion', async (req, res) => {
        // Preflight CORS
        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        try {
          const rawBody = await readBody(req);
          const { action, body } = JSON.parse(rawBody);

          const headers: Record<string, string> = {
            Authorization: `Bearer ${NOTION_TOKEN}`,
            'Content-Type': 'application/json',
            'Notion-Version': NOTION_VERSION,
          };

          let notionRes: Response;

          switch (action) {
            case 'query':
              notionRes = await fetch(
                `${NOTION_API_BASE}/databases/${DATABASE_ID}/query`,
                { method: 'POST', headers, body: JSON.stringify(body || {}) },
              );
              break;

            case 'create':
              notionRes = await fetch(`${NOTION_API_BASE}/pages`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  parent: { database_id: DATABASE_ID },
                  properties: body.properties,
                }),
              });
              break;

            case 'update':
              notionRes = await fetch(
                `${NOTION_API_BASE}/pages/${body.pageId}`,
                {
                  method: 'PATCH',
                  headers,
                  body: JSON.stringify({ properties: body.properties }),
                },
              );
              break;

            case 'archive':
              notionRes = await fetch(
                `${NOTION_API_BASE}/pages/${body.pageId}`,
                {
                  method: 'PATCH',
                  headers,
                  body: JSON.stringify({ archived: true }),
                },
              );
              break;

            case 'query-vacaciones':
              notionRes = await fetch(
                `${NOTION_API_BASE}/databases/${VACACIONES_DATABASE_ID}/query`,
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${NOTION_VACACIONES_TOKEN}`,
                    'Content-Type': 'application/json',
                    'Notion-Version': NOTION_VERSION,
                  },
                  body: JSON.stringify(body || {}),
                },
              );
              break;

            default:
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Acción no válida' }));
              return;
          }

          const data = await notionRes.json();
          res.writeHead(notionRes.status, {
            'Content-Type': 'application/json',
          });
          res.end(JSON.stringify(data));
        } catch (err) {
          console.error('Error en el proxy de desarrollo de Notion:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Error interno del servidor' }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());

  return {
    plugins: [react(), notionApiDevPlugin(env)],
    build: {
      sourcemap: false,
    },
  };
})
