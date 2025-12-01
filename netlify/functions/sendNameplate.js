export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method not allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, headers, body: 'Invalid JSON' };
  }

  const { referenceId, savedTemplates } = payload || {};
  if (!referenceId || !Array.isArray(savedTemplates) || savedTemplates.length === 0) {
    return { statusCode: 400, headers, body: 'referenceId and savedTemplates are required.' };
  }

  const hookUrl = process.env.ZAPIER_HOOK_URL_NAMEPLATE;
  if (!hookUrl) {
    return { statusCode: 500, headers, body: 'Missing ZAPIER_HOOK_URL_NAMEPLATE' };
  }

  try {
    const resp = await fetch(hookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const text = await resp.text();
    return {
      statusCode: resp.status,
      headers,
      body: JSON.stringify({ ok: resp.ok, status: resp.status, text })
    };
  } catch (err) {
    return { statusCode: 500, headers, body: 'Failed to reach Zapier hook' };
  }
};
