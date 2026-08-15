const https = require('https');

async function scrapeAllGames() {
  console.log('--- Scraping loteriasdominicanas.com homepage ---');
  const res = await fetch('https://loteriasdominicanas.com/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  });
  const html = await res.text();
  
  // Find Nuxt payload
  const match = html.match(/<script[^>]*data-nuxt-data[^>]*>([\s\S]*?)<\/script>/i) ||
                html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (match) {
    const arr = JSON.parse(match[1]);
    console.log('Total Nuxt items:', arr.length);
    // Find all strings
    const strings = arr.filter(x => typeof x === 'string');
    console.log('Total strings:', strings.length);
    
    // Find any 2-digit pairs or triples
    arr.forEach((item, idx) => {
      if (Array.isArray(item) && item.length >= 2 && item.length <= 5 && item.every(x => typeof x === 'string' && /^\d{2}$/.test(x))) {
        const context = arr.slice(Math.max(0, idx - 15), idx + 15).map(x => typeof x === 'string' ? `"${x}"` : JSON.stringify(x)).join(' ');
        console.log(`[Idx ${idx}] Numbers: [${item.join('-')}] -> Context: ${context.substring(0, 250)}`);
      }
    });
  }

  // Also check Conectate home
  console.log('\n--- Scraping conectate.com.do/loterias/ ---');
  const cRes = await fetch('https://www.conectate.com.do/loterias/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  });
  const cHtml = await cRes.text();
  const cMatch = cHtml.match(/<script[^>]*data-nuxt-data[^>]*>([\s\S]*?)<\/script>/i) ||
                 cHtml.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (cMatch) {
    const cArr = JSON.parse(cMatch[1]);
    console.log('Conectate Nuxt items:', cArr.length);
    cArr.forEach((item, idx) => {
      if (Array.isArray(item) && item.length >= 2 && item.length <= 5 && item.every(x => typeof x === 'string' && /^\d{2}$/.test(x))) {
        const context = cArr.slice(Math.max(0, idx - 15), idx + 15).map(x => typeof x === 'string' ? `"${x}"` : JSON.stringify(x)).join(' ');
        console.log(`[Conectate Idx ${idx}] Numbers: [${item.join('-')}] -> Context: ${context.substring(0, 250)}`);
      }
    });
  }
}

scrapeAllGames();
