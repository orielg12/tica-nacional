async function findConfigInHtml() {
  const pageRes = await fetch('https://loteriasdominicanas.com/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await pageRes.text();
  const idx = html.indexOf('apiBase');
  if (idx !== -1) {
    console.log('Found apiBase in HTML:');
    console.log(html.substring(idx - 100, idx + 400));
  } else {
    console.log('apiBase not directly found in HTML text');
  }

  // Also search for "https://" in the Nuxt data script
  const nuxtMatch = html.match(/<script[^>]*data-nuxt-data[^>]*>([\s\S]*?)<\/script>/i) ||
                    html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nuxtMatch) {
    const arr = JSON.parse(nuxtMatch[1]);
    arr.forEach((item, i) => {
      if (typeof item === 'string' && item.startsWith('https://api.')) {
        console.log(`Found API URL at ${i}:`, item);
      }
    });
  }
}

findConfigInHtml();
