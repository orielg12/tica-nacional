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

async function searchNuxtData() {
  const jsonStr = await fetchUrl('https://loterias.conectate.com.do/americanas/_payload.json');
  console.log('Payload size:', jsonStr.length);
  
  // Parse Nuxt payload structure
  try {
    const data = JSON.parse(jsonStr);
    console.log('Payload root length:', data.length);
    // Find strings containing game titles or winning numbers
    const flatStr = JSON.stringify(data);
    const matches = flatStr.match(/{"title":"New York[^}]*}/gi);
    console.log('Matches for New York:', matches);
    
    // Also search for "2130" or "Noche" or "7:30" or recent numbers
    const searchTerms = ['New York Noche', 'New York Tarde', 'Florida Noche', 'Florida Día', 'winning_numbers', 'scores', 'numbers'];
    searchTerms.forEach(term => {
      const idx = flatStr.indexOf(term);
      if (idx !== -1) {
        console.log(`Found term "${term}" at index ${idx}:`);
        console.log(flatStr.substring(idx - 100, idx + 300));
      }
    });

  } catch (e) {
    console.error('Error parsing JSON:', e);
  }
}

searchNuxtData();
