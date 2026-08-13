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

async function testApi() {
  try {
    console.log('Fetching https://api.conectate.com.do/conectate ...');
    const jsonStr = await fetchUrl('https://api.conectate.com.do/conectate');
    const data = JSON.parse(jsonStr);
    console.log('Keys in API response:', Object.keys(data));
    console.log('Sample data:', JSON.stringify(data).substring(0, 1000));
  } catch (err) {
    console.error('API fetch error:', err.message);
  }
}

testApi();
