async function inspectNuxtJs() {
  const pageRes = await fetch('https://loteriasdominicanas.com/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await pageRes.text();
  const scriptMatches = html.match(/\/(_nuxt\/[a-zA-Z0-9_\-\.]+)/g);
  console.log('Nuxt scripts found:', scriptMatches);

  if (scriptMatches) {
    for (const scriptPath of scriptMatches.slice(0, 5)) {
      const fullUrl = `https://loteriasdominicanas.com${scriptPath}`;
      console.log('Fetching script:', fullUrl);
      const sRes = await fetch(fullUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const jsCode = await sRes.text();
      // Search for API urls or baseURL
      const apiMatches = jsCode.match(/https?:\/\/[a-zA-Z0-9_\-\.]+(?:\/api|\/dominicana|\/sessions|\/games)[a-zA-Z0-9_\-\/\?]*/g);
      console.log(`API matches in ${scriptPath}:`, apiMatches);
      
      const baseURLMatches = jsCode.match(/baseURL:[^,}\)]+/g);
      console.log(`baseURL in ${scriptPath}:`, baseURLMatches);
    }
  }
}

inspectNuxtJs();
