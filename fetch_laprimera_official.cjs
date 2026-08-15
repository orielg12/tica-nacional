async function fetchLaPrimeraOfficial() {
  try {
    console.log('Fetching https://laprimera.do/ ...');
    const res = await fetch('https://laprimera.do/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    console.log('Status:', res.status);
    const html = await res.text();
    console.log('Length:', html.length);
    const matches = html.match(/\d{2}[-\s]+\d{2}[-\s]+\d{2}/g);
    console.log('Matches:', matches);

    // Look for numbers inside ball classes or spans
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
    console.log('Text snippet:', text.substring(0, 1000).replace(/\s+/g, ' '));
  } catch(e) {
    console.error('Error:', e.message);
  }
}

fetchLaPrimeraOfficial();
