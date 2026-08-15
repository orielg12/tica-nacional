const https = require('https');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(null); }
      });
    }).on('error', reject);
  });
}

async function testPayloads() {
  const urls = [
    'https://loterias.conectate.com.do/la-primera/_payload.json',
    'https://loterias.conectate.com.do/anguilla/_payload.json',
    'https://loterias.conectate.com.do/americanas/_payload.json',
    'https://loteriasdominicanas.com/_payload.json'
  ];

  for (const u of urls) {
    console.log('Testing', u);
    const data = await fetchJson(u);
    if (!data) {
      console.log('Failed or not JSON');
      continue;
    }
    console.log('Success! Data array length:', Array.isArray(data) ? data.length : typeof data);
    const str = JSON.stringify(data);
    // Find games and scores
    // Look for patterns like title, score, winning_number
    if (Array.isArray(data)) {
      data.forEach((item, idx) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          if (item.title || item.name || item.game) {
            console.log(`[${u.split('/').slice(-2).join('/')}] Idx ${idx}:`, JSON.stringify(item));
          }
        }
      });
    }
  }
}

testPayloads();
