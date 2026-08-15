const https = require('https');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(null); }
      });
    }).on('error', reject);
  });
}

async function inspectConectatePayload() {
  const cData = await fetchJson('https://loterias.conectate.com.do/la-primera/_payload.json');
  if (!cData) return;

  console.log('Total entries:', cData.length);
  // Find strings with numbers or games
  cData.forEach((item, idx) => {
    if (Array.isArray(item) && item.length > 0 && item.length <= 5 && item.every(x => typeof x === 'string' && /^\d{2}$/.test(x))) {
      console.log(`Found ball array at ${idx}:`, item);
      console.log('Surrounding:', cData.slice(Math.max(0, idx - 10), idx + 10));
    }
  });

  // Also check if there are 2-digit number strings
  const stringItems = cData.filter(x => typeof x === 'string');
  console.log('Total string items:', stringItems.length);
  const sampleGames = stringItems.filter(s => s.toLowerCase().includes('primera') || s.toLowerCase().includes('quiniela'));
  console.log('Sample games:', sampleGames);
}

inspectConectatePayload();
