async function checkLaPrimeraHTML() {
  const res = await fetch('https://www.loteriasdominicanas.com/la-primera', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  });
  const html = await res.text();
  console.log('HTML length:', html.length);

  // Check if there are elements with class score, ball, number, result
  const matchScores = html.match(/class="[^"]*(?:score|ball|numero|number|result)[^"]*"[^>]*>([\s\S]*?)<\//gi);
  if (matchScores) {
    console.log('Found score elements:', matchScores.length);
    matchScores.slice(0, 20).forEach(m => console.log('>', m));
  }

  // Look for any string of format "XX - XX - XX" or "XX XX XX" where XX is 00-99
  const pattern = /(?:(?:[0-9]{2}[-\s,]+){2}[0-9]{2})/g;
  const numMatches = html.match(pattern);
  console.log('Found 3-number patterns:', numMatches ? numMatches.slice(0, 20) : 'None');

  // Let's also search within the Nuxt data script inside this page
  const nuxtMatch = html.match(/<script[^>]*data-nuxt-data[^>]*>([\s\S]*?)<\/script>/i) ||
                    html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nuxtMatch) {
    const arr = JSON.parse(nuxtMatch[1]);
    console.log('Nuxt arr length:', arr.length);
    arr.forEach((item, idx) => {
      if (Array.isArray(item) && item.length >= 3 && item.every(x => typeof x === 'string' || typeof x === 'number')) {
        console.log(`Array at ${idx}:`, item, 'Context:', arr.slice(Math.max(0, idx - 5), idx + 5));
      }
    });
  }
}

checkLaPrimeraHTML();
