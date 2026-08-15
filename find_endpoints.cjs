async function findNuxtEndpoints() {
  const scripts = [
    '/_nuxt/dominicana.BsRMQHTe.1786372647667.js',
    '/_nuxt/index.D8NkyY5C.1786372647667.js',
    '/_nuxt/feed.vue.D6FpYg8M.1786372647667.js',
    '/_nuxt/score.vue.B0dewx6v.1786372647667.js',
    '/_nuxt/extended-ball.vue.CpHAMrnr.1786372647667.js',
    '/_nuxt/ball.vue.CSUGK0m-.1786372647667.js',
    '/_nuxt/session.vue.CuLxFX_c.1786372647667.js',
    '/_nuxt/classic.C5YYzLaw.1786372647667.js',
    '/_nuxt/conectate.CHkoAaYZ.1786372647667.js'
  ];

  for (const s of scripts) {
    const res = await fetch(`https://loteriasdominicanas.com${s}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const js = await res.text();
    // Search for strings starting with / or endpoints like /sessions, /results, /scores, /live
    const matches = js.match(/(?:["'`]\/(?:api|dominicana|sessions|games|scores|results|live|site)[a-zA-Z0-9_\-\/\?]*["'`])/g);
    if (matches) {
      console.log(`Endpoints in ${s}:`, matches);
    }
  }
}

findNuxtEndpoints();
