const https = require('https');

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function run() {
  try {
    console.log('Fetching https://loterias.conectate.com.do/americanas/ ...');
    const html = await fetchPage('https://loterias.conectate.com.do/americanas/');
    
    // Look for text fragments, numbers, game titles, or payload scripts
    const textMatches = html.match(/New York[^<]{0,200}/gi);
    console.log('--- NEW YORK MATCHES IN HTML ---');
    console.log(textMatches ? textMatches.slice(0, 10) : 'None');

    // Also look for numeric patterns like xx - xx - xx or ball elements
    const numbersMatches = html.match(/\d{2}[-\s]+\d{2}[-\s]+\d{2}/g);
    console.log('--- NUMBER PATTERNS IN HTML ---');
    console.log(numbersMatches ? numbersMatches.slice(0, 10) : 'None');

  } catch (err) {
    console.error(err);
  }
}

run();
