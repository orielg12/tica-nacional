const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function searchPayloadScores() {
  const jsonStr = await fetchUrl('https://loterias.conectate.com.do/americanas/_payload.json');
  const arr = JSON.parse(jsonStr);

  // Search through all items in the array for game titles and score objects
  arr.forEach((item, idx) => {
    if (typeof item === 'string' && (item.includes('New York Noche') || item.includes('New York Tarde') || item.includes('Florida Noche') || item.includes('Florida Día'))) {
      console.log(`Index ${idx}: "${item}"`);
      // print surrounding array items
      const start = Math.max(0, idx - 10);
      const end = Math.min(arr.length - 1, idx + 20);
      console.log(`Surrounding items [${start}..${end}]:`, arr.slice(start, end));
    }
  });
}

searchPayloadScores();
