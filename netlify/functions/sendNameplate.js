export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' } };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'Method Not Allowed' };
  try {
    const hook = process.env.ZAPIER_HOOK_URL_NAMEPLATE;
    if (!hook) return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok:false, error:'Missing ZAPIER_HOOK_URL_NAMEPLATE' }) };
    const payload = JSON.parse(event.body || '{}');
    const res = await fetch(hook, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const text = await res.text();
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok:true, status: res.status, text }) };
  } catch (err) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok:false, error: String(err) }) };
  }
}
