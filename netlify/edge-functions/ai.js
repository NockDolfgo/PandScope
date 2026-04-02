// netlify/edge-functions/ai.js
// Proxy voor Anthropic Claude API
// Lost het CORS probleem op — browser mag api.anthropic.com niet direct aanroepen
// Vereist ANTHROPIC_API_KEY als environment variable
// Aanroepen: POST /api/ai met zelfde body als Anthropic API

export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    const body = await req.json();
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY') || '';

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY niet ingesteld' }), { status: 500, headers });
    }

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const d = await r.json();
    return new Response(JSON.stringify(d), { headers });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}

export const config = { path: '/api/ai' };
