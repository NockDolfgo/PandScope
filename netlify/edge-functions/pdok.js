// Netlify Edge Function: pdok.js
// Proxiet alle PDOK calls zodat de browser geen CORS-problemen heeft
// Aanroepen vanuit HTML: /api/pdok?actie=suggest&q=...
//                        /api/pdok?actie=lookup&id=...
//                        /api/pdok?actie=bag&vboId=...
//                        /api/pdok?actie=perceel&gemeentecode=...&sectie=...&nummer=...
//                        /api/pdok?actie=woz&vboId=...

export default async function handler(req) {
  const url = new URL(req.url);
  const actie = url.searchParams.get('actie');

  // CORS headers — staan altijd in het antwoord
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    let apiUrl;

    if (actie === 'suggest') {
      const q = url.searchParams.get('q') || '';
      apiUrl = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?q=${encodeURIComponent(q)}&fq=type:(adres)&rows=6&fl=weergavenaam,id,centroide_ll`;

    } else if (actie === 'lookup') {
      const id = url.searchParams.get('id') || '';
      apiUrl = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup?id=${encodeURIComponent(id)}&fl=adresseerbaarobject_id,nummeraanduiding_id,centroide_rd,centroide_ll,oppervlakte,bouwjaar,gebruiksdoel,gekoppeld_perceel,weergavenaam,gemeentenaam,gemeentecode`;

    } else if (actie === 'bag') {
      // BAG verblijfsobject → pand-ID ophalen
      const vboId = url.searchParams.get('vboId') || '';
      const dsoKey = Deno.env.get('DSO_API_KEY') || '';
      apiUrl = `https://api.pdok.nl/lv/bag/ogc/v2/collections/verblijfsobjecten/items?adresseerbaarObjectIdentificatie=${vboId}&f=json&limit=1`;
      const r = await fetch(apiUrl, { headers: { 'x-api-key': dsoKey } });
      const d = await r.json();
      return new Response(JSON.stringify(d), { headers });

    } else if (actie === 'perceel') {
      // BRK kadastrale kaart — perceeloppervlak via gemeentecode+sectie+nummer
      const gem = url.searchParams.get('gemeentecode') || '';
      const sec = url.searchParams.get('sectie') || '';
      const nr  = url.searchParams.get('nummer') || '';
      if (gem && sec && nr) {
        apiUrl = `https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&typeName=kadastralekaart:Perceel&outputFormat=application/json&CQL_FILTER=kadastraleGemeentecode='${gem}'+AND+sectie='${sec}'+AND+perceelnummer=${nr}&count=1`;
      } else {
        // Fallback: bbox op coördinaten
        const x = url.searchParams.get('x') || '';
        const y = url.searchParams.get('y') || '';
        const d = 50;
        apiUrl = `https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&typeName=kadastralekaart:Perceel&outputFormat=application/json&srsName=EPSG:28992&bbox=${+x-d},${+y-d},${+x+d},${+y+d},EPSG:28992&count=5`;
      }

    } else if (actie === 'woz') {
      const vboId = url.searchParams.get('vboId') || '';
      const dsoKey = Deno.env.get('DSO_API_KEY') || '';
      apiUrl = `https://api.pdok.nl/lv/woz/ogc/v1/collections/wozobjecten/items?adresseerbaarobjectidentificatie=${vboId}&f=json&limit=1`;
      const r = await fetch(apiUrl, { headers: { 'x-api-key': dsoKey } });
      const d = await r.json();
      return new Response(JSON.stringify(d), { headers });

    } else {
      return new Response(JSON.stringify({ error: 'Onbekende actie' }), { status: 400, headers });
    }

    const resp = await fetch(apiUrl);
    const data = await resp.json();
    return new Response(JSON.stringify(data), { headers });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}

export const config = { path: '/api/pdok' };
