const https = require('https');

async function check11am() {
  console.log('--- Checking loteriasdominicanas API ---');
  const nowIso = new Date('2026-08-15T12:00:00.000Z').toISOString();
  try {
    const res = await fetch(`https://api.loteriasdominicanas.com/dominicana/sessions?date=${encodeURIComponent(nowIso)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (res.ok) {
      const data = await res.json();
      console.log('API items:', data.length);
      for (const s of data) {
        console.log(s.game?.title || s.game?.name, '->', s.score, 'status:', s.status, 'time:', s.time);
      }
    }
  } catch (e) {
    console.error('API err:', e);
  }

  console.log('\n--- Checking loteriasdominicanas HTML ---');
  try {
    const pageRes = await fetch('https://loteriasdominicanas.com/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await pageRes.text();
    const match = html.match(/<script[^>]*data-nuxt-data[^>]*>([\s\S]*?)<\/script>/i) ||
                  html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (match) {
      const arr = JSON.parse(match[1]);
      arr.forEach((item, idx) => {
        if (Array.isArray(item) && item.length === 3 && item.every(x => typeof x === 'string' && /^\d{2}$/.test(x))) {
          const surrounding = arr.slice(Math.max(0, idx - 15), idx + 15).map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ');
          console.log(`Ball 3-item: [${item.join('-')}] | surrounding: ${surrounding}`);
        }
      });
    }
  } catch(e) {
    console.error('Nuxt err:', e);
  }

  console.log('\n--- Checking Conectate La Primera ---');
  try {
    const cRes = await fetch('https://loterias.conectate.com.do/la-primera/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const cHtml = await cRes.text();
    // Parse numbers from cHtml
    console.log('La Primera conectate html length:', cHtml.length);
    // Find numbers or date
    const regex = /<div class="game-scores[^>]*>([\s\S]*?)<\/div>/gi;
    let m;
    while ((m = regex.exec(cHtml)) !== null) {
      console.log('Conectate score block:', m[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    }
  } catch(e) {
    console.error('Conectate err:', e);
  }
}

check11am();
