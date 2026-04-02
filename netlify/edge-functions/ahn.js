// netlify/edge-functions/ahn.js
// Haalt gebouwhoogte op via Esri AHN4 ImageServer
// DSM max over bbox = hoogste dakpunt
// DTM min over bbox = laagste maaiveld
// Gebouwhoogte = DSM max - DTM min

export default async function handler(req) {
  const url = new URL(req.url);
  const x = parseFloat(url.searchParams.get('x'));
  const y = parseFloat(url.searchParams.get('y'));

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (!x || !y) {
    return new Response(JSON.stringify({ error: 'x en y zijn verplicht (RD coördinaten)' }), { status: 400, headers });
  }

  const base = 'https://ahn.arcgisonline.nl/arcgis/rest/services';

  // Bbox van 15x15m rondom het centroide — pakt het echte hoogste dakpunt
  const bbox = encodeURIComponent(JSON.stringify({
    xmin: x - 15, ymin: y - 15, xmax: x + 15, ymax: y + 15
  }));
  const bboxParams = `geometryType=esriGeometryEnvelope&sr=28992&f=json`;
  const pointParams = `geometry=${x},${y}&geometryType=esriGeometryPoint&sr=28992&returnGeometry=false&f=json`;

  try {
    // Probeer eerst computeStatistics over bbox (nauwkeuriger)
    const [rDsm, rDtm] = await Promise.all([
      fetch(`${base}/AHNviewer/AHN4_DSM_50cm/ImageServer/computeStatistics?geometry=${bbox}&${bboxParams}`),
      fetch(`${base}/Hoogtebestand/AHN4_DTM_50cm/ImageServer/computeStatistics?geometry=${bbox}&${bboxParams}`),
    ]);

    const [dDsm, dDtm] = await Promise.all([rDsm.json(), rDtm.json()]);

    // DSM max = hoogste dakpunt, DTM min = laagste maaiveld
    let dsm = dDsm?.statistics?.[0]?.max ?? null;
    let dtm = dDtm?.statistics?.[0]?.min ?? null;

    // Fallback op identify (punt) als computeStatistics geen data geeft
    if (dsm === null) {
      const r = await fetch(`${base}/AHNviewer/AHN4_DSM_50cm/ImageServer/identify?${pointParams}`);
      const d = await r.json();
      dsm = (d?.value && d.value !== 'NoData') ? parseFloat(d.value) : null;
    }

    if (dtm === null) {
      const r = await fetch(`${base}/Hoogtebestand/AHN4_DTM_50cm/ImageServer/identify?${pointParams}`);
      const d = await r.json();
      // Probeer eerst de directe waarde
      dtm = (d?.value && d.value !== 'NoData') ? parseFloat(d.value) : null;
      // Fallback: neem laagste waarde uit lage-resolutie overzichten
      if (dtm === null && d?.properties?.Values) {
        const vals = d.properties.Values
          .filter(v => v !== 'NoData')
          .map(parseFloat)
          .filter(v => !isNaN(v));
        if (vals.length > 0) dtm = Math.min(...vals);
      }
    }

    const gebouwHoogte = (dsm !== null && dtm !== null)
      ? +(dsm - dtm).toFixed(2)
      : null;

    return new Response(JSON.stringify({
      dsm,           // dakrand in m NAP (hoogste punt over 15m bbox)
      dtm,           // maaiveld in m NAP (laagste punt over 15m bbox)
      gebouwHoogte,  // verschil = gebouwhoogte in meters
    }), { headers });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}

export const config = { path: '/api/ahn' };
