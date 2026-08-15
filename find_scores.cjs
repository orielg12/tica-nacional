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

async function findScores() {
  const data = await fetchJson('https://loteriasdominicanas.com/_payload.json');
  if (!data) return;

  // Let's find any object that contains 'score' or 'winning' or array of numbers
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (item && typeof item === 'object') {
      if (item.score !== undefined || item.scores !== undefined || item.winning_number !== undefined) {
        console.log(`Idx ${i}:`, JSON.stringify(item));
      }
    }
  }

  // Also check conectate payload
  const cData = await fetchJson('https://loterias.conectate.com.do/la-primera/_payload.json');
  if (cData) {
    console.log('\n--- Conectate La Primera payload length:', cData.length);
    for (let i = 0; i < cData.length; i++) {
      const item = cData[i];
      if (item && typeof item === 'object') {
        if (item.score !== undefined || item.scores !== undefined || item.winning_number !== undefined || item.session !== undefined) {
          console.log(`Conectate Idx ${i}:`, JSON.stringify(item));
        }
      }
    }
  }
}

findScores();
