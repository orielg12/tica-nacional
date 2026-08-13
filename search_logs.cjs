const fs = require('fs');
const readline = require('readline');
const path = require('path');

const logFile = 'C:\\Users\\ThinkPad\\.gemini\\antigravity\\brain\\6966afc1-f145-4182-b711-d3c06ca2eabc\\.system_generated\\logs\\transcript.jsonl';

async function searchLog() {
  const fileStream = fs.createReadStream(logFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log('Searching logs for database changes or SQL execution...');

  for await (const line of rl) {
    if (line.toLowerCase().includes('sql') || line.toLowerCase().includes('alter table') || line.toLowerCase().includes('supabase.rpc')) {
      // Parse the JSON line to check its content
      try {
        const obj = JSON.parse(line);
        if (obj.tool_calls) {
          console.log(`Step ${obj.step_index} (${obj.type}):`, JSON.stringify(obj.tool_calls, null, 2));
        } else if (obj.content && (obj.content.includes('ALTER') || obj.content.includes('rpc'))) {
          console.log(`Step ${obj.step_index} Content:`, obj.content.substring(0, 300));
        }
      } catch (e) {
        // Just print the line snippet if it failed to parse
        console.log('Match (parse err):', line.substring(0, 200));
      }
    }
  }
}

searchLog();
