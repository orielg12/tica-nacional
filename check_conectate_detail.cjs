const fs = require('fs');

async function parseConectate() {
  const cRes = await fetch('https://loterias.conectate.com.do/la-primera/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  });
  const html = await cRes.text();
  
  // Search for score elements or number balls
  // Let's find snippets with 'score', 'ball', 'numero', or 'session'
  const matches = html.match(/.{0,100}(?:game-scores|ball|bolita|number|scores).{0,100}/gi);
  if (matches) {
    console.log('Sample score/ball matches:');
    matches.slice(0, 10).forEach(m => console.log('>', m.replace(/\s+/g, ' ')));
  }

  // Check if there are spans with 2-digit numbers
  // In conectate, winning numbers are typically in elements like <span class="score ..."> or <div class="game-scores">
  const cleanText = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  console.log('Total non-empty lines:', lines.length);

  // Search lines containing "Primera Día" or "12:00" or "11:00"
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes('primera') && lines[i].toLowerCase().includes('día') || lines[i].toLowerCase().includes('12:00 pm') || lines[i].toLowerCase().includes('11:00 am') || lines[i].toLowerCase().includes('primera día')) {
      console.log(`Line ${i}:`, lines.slice(Math.max(0, i - 2), i + 10).join(' | '));
    }
  }
}

parseConectate();
