const https = require('https');

async function parseDomNumbers() {
  const url = 'https://loteriasdominicanas.com/';
  console.log('Fetching', url);
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();

  // Search for games sections in HTML
  // Let's search for "La Primera" block
  const primeraIdx = html.toLowerCase().indexOf('primera');
  if (primeraIdx !== -1) {
    console.log('--- Primera block in HTML ---');
    console.log(html.substring(primeraIdx - 100, primeraIdx + 800));
  }

  // Search for Anguilla block
  const anguillaIdx = html.toLowerCase().indexOf('anguilla');
  if (anguillaIdx !== -1) {
    console.log('--- Anguilla block in HTML ---');
    console.log(html.substring(anguillaIdx - 100, anguillaIdx + 800));
  }
}

parseDomNumbers();
