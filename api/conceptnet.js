import { createServer } from 'node:http';
import { URL } from 'node:url';

const CONCEPTNET_ORIGIN = 'https://api.conceptnet.io';
const CONCEPTNET_HOST = 'api.conceptnet.io';

const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
};

const sendJson = (res, status, payload) => {
  setCorsHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

const resolveTargetUrl = (term, directUrl) => {
  if (directUrl) {
    const parsed = new URL(directUrl, CONCEPTNET_ORIGIN);
    if (parsed.host !== CONCEPTNET_HOST) {
      throw new Error('only api.conceptnet.io is allowed');
    }
    return parsed.toString();
  }

  if (!term) {
    throw new Error('missing term');
  }

  const normalized = term.startsWith('/') ? term : `/${term}`;
  return `${CONCEPTNET_ORIGIN}${normalized}`;
};

const conceptNetProxy = async (req, res) => {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (requestUrl.pathname !== '/api/conceptnet') {
    sendJson(res, 404, { error: 'not found' });
    return;
  }

  const term = requestUrl.searchParams.get('term');
  const directUrl = requestUrl.searchParams.get('url');

  let targetUrl;
  try {
    targetUrl = resolveTargetUrl(term, directUrl);
  } catch (error) {
    sendJson(res, 400, { error: error.message || 'missing term' });
    return;
  }

  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
      sendJson(res, response.status, {
        error: 'ConceptNet error',
        status: response.status,
        statusText: response.statusText,
        targetUrl
      });
      return;
    }

    const data = await response.json();
    setCorsHeaders(res);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
  } catch (error) {
    console.error('Proxy fetch failed', error);
    sendJson(res, 500, { error: 'proxy fetch failed', detail: error.message, targetUrl });
  }
};

export default conceptNetProxy;

if (process.env.NODE_ENV !== 'production') {
  const port = process.env.PORT || 8787;
  const server = createServer((req, res) => {
    conceptNetProxy(req, res);
  });

  server.listen(port, () => {
    console.log(`ConceptNet proxy listening on http://localhost:${port}/api/conceptnet`);
  });
}
