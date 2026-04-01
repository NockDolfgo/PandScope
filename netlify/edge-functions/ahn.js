// Netlify Edge Function: ahn.js
// Haalt gebouwhoogte op via Esri AHN4 ImageServer
// DSM = dakrand (inclusief gebouwen), DTM = maaiveld (grond)
// Gebouwhoogte = DSM - DTM
// Aanroepen: /api/ahn?x=90650.9&y=435909

export default async function handler(req) {
  const url = new URL(req.url);
  const x = url.searchParams.get('x');
  const y = url.searchParams.get('y');

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (!x || !y) {
    return new Response(JSON.stringify({ error: 'x en y zijn verplicht (RD coördinaten)' }), { status: 400, headers });
  }

  const base = 'https://ahn.arcgisonline.nl/arcgis/rest/services';
  const params = `geometry=${x},${y}&geometryType=esriGeometryPoint&sr=28992&returnGeometry=false&f=json`;

  try {
    // DSM en DTM parallel ophalen
    const [rDsm, rDtm] = await Promise.all([
      fetch(`${base}/AHNviewer/AHN4_DSM_50cm/ImageServer/identify?${params}`),
      fetch(`${base}/Hoogtebestand/AHN4_DTM_50cm/ImageServer/identify?${params}`),
    ]);

    const [dDsm, dDtm] = await Promise.all([rDsm.json(), rDtm.json()]);

    // value is een string ("19.429") of "NoData"
    const dsm = dDsm?.value && dDsm.value !== 'NoData' ? parseFloat(dDsm.value) : null;

    // DTM geeft op hoge resolutie soms NoData (pand op de kaartrand)
    // Gebruik dan de lage-resolutie waarden uit properties.Values
    let dtm = dDtm?.value && dDtm.value !== 'NoData' ? parseFloat(dDtm.value) : null;
    if (dtm === null && dDtm?.properties?.Values) {
      // Neem eerste niet-NoData waarde uit de lagere resoluties
      const vals = dDtm.properties.Values.filter(v => v !== 'NoData').map(parseFloat);
      if (vals.length > 0) dtm = vals[0];
    }

    const gebouwHoogte = (dsm !== null && dtm !== null) ? +(dsm - dtm).toFixed(2) : null;

    return new Response(JSON.stringify({
      dsm,          // dakrand in m NAP
      dtm,          // maaiveld in m NAP
      gebouwHoogte, // berekend verschil in meters
    }), { headers });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}

export const config = { path: '/api/ahn' };
