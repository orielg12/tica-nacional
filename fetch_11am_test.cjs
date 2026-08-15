const fs = require('fs');

async function checkNuxtAndConectate() {
  const ldRes = await fetch('https://loteriasdominicanas.com/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  });
  const html = await ldRes.text();
  const nuxtMatch = html.match(/<script[^>]*data-nuxt-data[^>]*>([\s\S]*?)<\/script>/i) ||
                    html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nuxtMatch) {
    const arr = JSON.parse(nuxtMatch[1]);
    console.log('Nuxt elements count:', arr.length);
    // Find strings related to "primera" or "anguilla"
    arr.forEach((item, idx) => {
      if (typeof item === 'string' && (item.toLowerCase().includes('primera') || item.toLowerCase().includes('anguilla'))) {
        console.log(`Idx ${idx}: "${item}" -> surrounding:`, arr.slice(Math.max(0, idx - 10), idx + 15));
      }
    });
  }

  // Check conectate
  const conectateRes = await fetch('https://www.conectate.com.do/loterias/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  });
  const cHtml = await conectateRes.text();
  // Find "La Primera" or "Primera" blocks in Conectate
  const primeraMatches = cHtml.match(/primera[\s\S]{1,500}/gi);
  if (primeraMatches) {
    console.log('--- Conectate Primera Matches ---');
    primeraMatches.slice(0, 3).forEach(m => console.log(m.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')));
  }
}

checkNuxtAndConectate();
