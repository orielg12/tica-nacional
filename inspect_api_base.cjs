async function inspectApiBase() {
  const sRes = await fetch('https://loteriasdominicanas.com/_nuxt/entry.CmmLvP-9.1786372647667.js', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const js = await sRes.text();
  const apiBaseIdx = js.indexOf('apiBase');
  if (apiBaseIdx !== -1) {
    console.log('apiBase context:');
    console.log(js.substring(apiBaseIdx - 100, apiBaseIdx + 400));
  }
}

inspectApiBase();
