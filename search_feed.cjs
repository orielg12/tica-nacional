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

async function searchFeed() {
  const jsonStr = await fetchUrl('https://loterias.conectate.com.do/americanas/_payload.json');
  const arr = JSON.parse(jsonStr);

  // Search for arrays of numbers or games in Nuxt payload
  arr.forEach((item, idx) => {
    if (typeof item === 'string' && (item.includes('New York') || item.includes('Florida') || item.includes('Noche') || item.includes('Tarde'))) {
      console.log(`Index ${idx}: ${item}`);
    }
  });

  // Let's also check API endpoints called by conectate
  console.log('\n--- FETCHING CONECTATE MAIN API ENDPOINTS ---');
  try {
    const mainHtml = await fetchUrl('https://loterias.conectate.com.do');
    const apiMatches = mainHtml.match(/https:\/\/[^"' ]*api[^"' ]*/g);
    console.log('API matches:', apiMatches);
  } catch (e) {
    console.error(e);
  }
}

searchFeed();
