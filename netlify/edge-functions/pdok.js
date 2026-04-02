// netlify/edge-functions/pdok.js
// Proxy voor alle PDOK calls + BRK + WOZ
// Aanroepen vanuit HTML via /api/pdok?actie=...

export default async function handler(req) {
  const url = new URL(req.url);
  const actie = url.searchParams.get('actie');
  const dsoKey = Deno.env.get('DSO_API_KEY') || '';

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    let apiUrl, r, d;

    // ── Suggest: autocomplete adres ──
    if (actie === 'suggest') {
      const q = url.searchParams.get('q') || '';
      apiUrl = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?q=${encodeURIComponent(q)}&fq=type:(adres)&rows=6&fl=weergavenaam,id,centroide_ll`;
      r = await fetch(apiUrl);
      d = await r.json();
      return new Response(JSON.stringify(d), { headers });

    // ── Lookup: volledige BAG data op adres-ID ──
    } else if (actie === 'lookup') {
      const id = url.searchParams.get('id') || '';
      apiUrl = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup?id=${encodeURIComponent(id)}&fl=adresseerbaarobject_id,nummeraanduiding_id,centroide_rd,centroide_ll,oppervlakte,bouwjaar,gebruiksdoel,gekoppeld_perceel,weergavenaam,gemeentenaam,gemeentecode`;
      r = await fetch(apiUrl);
      d = await r.json();
      return new Response(JSON.stringify(d), { headers });

    // ── Perceel: kadastrale oppervlakte via BRK WFS ──
    } else if (actie === 'perceel') {
      const gem = url.searchParams.get('gemeentecode') || '';
      const sec = url.searchParams.get('sectie') || '';
      const nr  = url.searchParams.get('nummer') || '';
      const x   = url.searchParams.get('x') || '';
      const y   = url.searchParams.get('y') || '';

      if (gem && sec && nr) {
        // Methode A: via kadastrale aanduiding (meest nauwkeurig)
        apiUrl = `https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&typeName=kadastralekaart:Perceel&outputFormat=application/json&CQL_FILTER=kadastraleGemeentecode='${gem}'+AND+sectie='${sec}'+AND+perceelnummer=${nr}&count=1`;
      } else if (x && y) {
        // Methode B: bbox op RD-coördinaten
        const d2 = 50;
        apiUrl = `https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&typeName=kadastralekaart:Perceel&outputFormat=application/json&srsName=EPSG:28992&bbox=${+x-d2},${+y-d2},${+x+d2},${+y+d2},EPSG:28992&count=5`;
      } else {
        return new Response(JSON.stringify({ error: 'Geef gemeentecode+sectie+nummer of x+y mee' }), { status: 400, headers });
      }
      r = await fetch(apiUrl);
      d = await r.json();
      return new Response(JSON.stringify(d), { headers });

    // ── WOZ: vastgestelde waarde ──
    } else if (actie === 'woz') {
      const vboId = url.searchParams.get('vboId') || '';
      // Officieel PDOK WOZ endpoint
      apiUrl = `https://api.pdok.nl/lv/woz/wozobjecten/v1/wozobject?adresseerbaarobjectidentificatie=${vboId}`;
      r = await fetch(apiUrl, { headers: { 'Accept': 'application/json' } });
      if (!r.ok) {
        return new Response(JSON.stringify({ vastgesteldeWaarde: null }), { headers });
      }
      d = await r.json();
      const woz = d?._embedded?.wozobjecten?.[0]?.vastgesteldeWaarde ?? null;
      return new Response(JSON.stringify({ vastgesteldeWaarde: woz }), { headers });

    } else {
      return new Response(JSON.stringify({ error: 'Onbekende actie: ' + actie }), { status: 400, headers });
    }

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}

export const config = { path: '/api/pdok' };
