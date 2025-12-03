const WEBHOOK_URL = process.env.ZAPIER_HOOK_URL_NAMEPLATE;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : 'null';
  return {
    'Access-Control-Allow-Origin': allow,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

export const handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const headers = corsHeaders(origin);

  if (!WEBHOOK_URL) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ error: 'Server not configured' })
    };
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const contentType = event.headers?.['content-type'] || event.headers?.['Content-Type'] || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return {
      statusCode: 415,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ error: 'Unsupported Media Type' })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ error: 'Invalid JSON' })
    };
  }

  const safePayload = typeof payload === 'object' && payload !== null ? payload : {};
  const data = {
    ...safePayload,
    _meta: {
      source: 'nameplate-label-creator',
      receivedAt: new Date().toISOString(),
      userAgent: event.headers?.['user-agent'] || event.headers?.['User-Agent'] || '',
      referer: event.headers?.referer || event.headers?.Referer || ''
    }
  };

  try {
    const resp = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!resp.ok) {
      const text = await resp.text();
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ error: 'Zapier error', status: resp.status, body: text || '' })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ ok: true })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ error: 'Failed to reach Zapier hook' })
    };
  }
};
