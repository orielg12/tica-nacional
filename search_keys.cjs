const fs = require('fs');
const readline = require('readline');

const logFile = 'C:\\Users\\ThinkPad\\.gemini\\antigravity\\brain\\6966afc1-f145-4182-b711-d3c06ca2eabc\\.system_generated\\logs\\transcript_full.jsonl';

const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xb3FkbHljeGt3dW5uZ2t1ZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzkzNzUsImV4cCI6MjA5MTE1NTM3NX0.Dm8RCh2pqFhwu9lJvIeuTnNWYpArSUjxPcWR1-WV4oE';

async function searchLog() {
  const fileStream = fs.createReadStream(logFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log('Searching full logs for any keys other than the anon key...');

  for await (const line of rl) {
    // Find JWT keys starting with eyJ
    const regex = /eyJ[a-zA-Z0-9_\-\.]+/g;
    let match;
    while ((match = regex.exec(line)) !== null) {
      const key = match[0];
      if (key !== anonKey && key.length > 50) {
        console.log('Found potential service key:', key.substring(0, 30) + '...');
        // Let's decode payload to check if it's service_role
        try {
          const parts = key.split('.');
          if (parts[1]) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            console.log('Key payload:', payload);
          }
        } catch(e) {}
      }
    }
  }
}

searchLog();
