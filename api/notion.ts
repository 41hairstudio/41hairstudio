import type { IncomingMessage, ServerResponse } from 'http';

interface NotionRequestBody {
  action: string;
  body?: {
    pageId?: string;
    properties?: Record<string, unknown>;
    filter?: Record<string, unknown>;
    sorts?: Record<string, unknown>[];
    [key: string]: unknown;
  };
}

interface VercelRequest extends IncomingMessage {
  method: string;
  body: NotionRequestBody;
}

interface VercelResponse extends ServerResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
}

const NOTION_TOKEN = process.env.VITE_NOTION_TOKEN || '';
const DATABASE_ID = process.env.VITE_NOTION_DATABASE_ID || '';
const NOTION_VACACIONES_TOKEN = process.env.VITE_NOTION_VACACIONES_TOKEN || '';
const VACACIONES_DATABASE_ID = process.env.VITE_NOTION_VACACIONES_DATABASE_ID || '';
const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Manejar preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { action, body = {} } = req.body;

    const headers = {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION
    };

    let response;

    switch (action) {
      case 'query':
        // Consultar base de datos
        response = await fetch(`${NOTION_API_BASE}/databases/${DATABASE_ID}/query`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body || {})
        });
        break;

      case 'create':
        // Crear página
        response = await fetch(`${NOTION_API_BASE}/pages`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            parent: { database_id: DATABASE_ID },
            properties: body.properties
          })
        });
        break;

      case 'update':
        // Actualizar página
        response = await fetch(`${NOTION_API_BASE}/pages/${body.pageId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            properties: body.properties
          })
        });
        break;

      case 'archive':
        // Archivar página
        response = await fetch(`${NOTION_API_BASE}/pages/${body.pageId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            archived: true
          })
        });
        break;

      case 'query-vacaciones':
        // Consultar base de datos de vacaciones (usa token y BD propios)
        response = await fetch(`${NOTION_API_BASE}/databases/${VACACIONES_DATABASE_ID}/query`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${NOTION_VACACIONES_TOKEN}`,
            'Content-Type': 'application/json',
            'Notion-Version': NOTION_VERSION,
          },
          body: JSON.stringify(body || {})
        });
        break;

      default:
        return res.status(400).json({ error: 'Acción no válida' });
    }

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error de Notion:', errorData);
      return res.status(response.status).json({ error: errorData });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('Error en API:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
