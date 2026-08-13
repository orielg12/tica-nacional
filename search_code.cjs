const fs = require('fs');
const path = require('path');

function searchDir(dir, pattern) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...searchDir(fullPath, pattern));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.js') || entry.name.endsWith('.cjs'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (pattern.test(content)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

const matches = searchDir('C:/Users/ThinkPad/.gemini/antigravity/scratch/lottery_system', /conectate|scrape|Scraper|fetchResult/i);
console.log('Matching files:', matches);
