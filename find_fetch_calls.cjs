async function findFetchCalls() {
  const scripts = [
    '/_nuxt/session.vue.CuLxFX_c.1786372647667.js',
    '/_nuxt/feed.vue.D6FpYg8M.1786372647667.js',
    '/_nuxt/score.vue.B0dewx6v.1786372647667.js',
    '/_nuxt/entry.CmmLvP-9.1786372647667.js'
  ];

  for (const s of scripts) {
    const res = await fetch(`https://loteriasdominicanas.com${s}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const js = await res.text();
    // Search for $fetch or api
    const idx = js.indexOf('$fetch');
    if (idx !== -1) {
      console.log(`Found $fetch in ${s}:`);
      console.log(js.substring(idx - 50, idx + 200));
    }
    const apiIdx = js.indexOf('.api(');
    if (apiIdx !== -1) {
      console.log(`Found .api( in ${s}:`);
      console.log(js.substring(apiIdx - 50, apiIdx + 200));
    }
  }
}

findFetchCalls();
