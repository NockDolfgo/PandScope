// Netlify Edge Function: rp.js
// Haalt bestemmingsplan + maximale bouwhoogte op via Ruimtelijkeplannen API v4
// Vereist RP_API_KEY als Netlify environment variable
// Aanroepen: /api/rp?x=90650.9&y=435909

export default async function handler(req) {
  const url  = new URL(req.url);
  const x    = parseFloat(url.searchParams.get('x'));
  const y    = parseFloat(url.searchParams.get('y'));
  const key  = Deno.env.get('RP_API_KEY') || '';

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (!x || !y) {
    return new Response(JSON.stringify({ error: 'x en y zijn verplicht (RD coördinaten)' }), { status: 400, headers });
  }
  if (!key) {
    return new Response(JSON.stringify({ error: 'RP_API_KEY niet ingesteld in Netlify' }), { status: 500, headers });
  }

  const base = 'https://ruimte.omgevingswet.overheid.nl/ruimtelijke-plannen/api/opvragen/v4';
  const rpHeaders = {
    'Content-Type':  'application/json',
    'Content-Crs':   'epsg:28992',
    'Accept':        'application/hal+json',
    'x-api-key':     key,
  };
  const geo = { _geo: { intersectAndNotTouches: { type: 'Point', coordinates: [x, y] } } };

  try {
    // Stap 1: bestemmingsplan zoeken op punt
    const r1 = await fetch(
      `${base}/plannen/_zoek?planType=bestemmingsplan&regelStatus=geldend&_count=3`,
      { method: 'POST', headers: rpHeaders, body: JSON.stringify(geo) }
    );
    if (!r1.ok) {
      return new Response(JSON.stringify({ error: `Plannen API: ${r1.status}` }), { status: r1.status, headers });
    }
    const d1 = await r1.json();
    const plannen = d1?._embedded?.plannen ?? [];
    if (plannen.length === 0) {
      return new Response(JSON.stringify({ planNaam: null, bpFunctie: null, maxBouwhoogte: null }), { headers });
    }

    const plan   = plannen[0];
    const planId = plan.id;
    const planNaam = plan.naam ?? null;

    // Stap 2: bestemmingsfunctie ophalen
    let bpFunctie = null;
    const r2 = await fetch(
      `${base}/plannen/${planId}/enkelbestemmingen/_zoek?_count=3`,
      { method: 'POST', headers: rpHeaders, body: JSON.stringify(geo) }
    );
    if (r2.ok) {
      const d2 = await r2.json();
      const vlakken = d2?._embedded?.enkelbestemmingen ?? [];
      if (vlakken.length > 0) {
        bpFunctie = vlakken[0].naam ?? vlakken[0].bestemmingshoofdgroep ?? null;
      }
    }

    // Stap 3: alle maatvoeringen van het plan in één call
    let maxBouwhoogte = null;
    const r3 = await fetch(
      `${base}/plannen/${planId}/maatvoeringen?bestemmingsplangebied=${planId}&_count=200`,
      { headers: { 'Accept': 'application/hal+json', 'x-api-key': key } }
    );
    if (r3.ok) {
      const d3 = await r3.json();
      for (const m of d3?._embedded?.maatvoeringen ?? []) {
        const nm = (m.naam ?? m.symboolcode ?? '').toLowerCase();
        if (nm.includes('bouwhoogte') || nm.includes('goothoogte') ||
            nm.includes('nokhoogte')  || nm.includes('maximale hoogte')) {
          const v = m.waarde ?? m.maximaleWaarde ?? null;
          if (v !== null && (maxBouwhoogte === null || +v > maxBouwhoogte)) {
            maxBouwhoogte = +v;
          }
        }
      }
    }

    return new Response(JSON.stringify({ planNaam, bpFunctie, maxBouwhoogte }), { headers });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}

export const config = { path: '/api/rp' };
