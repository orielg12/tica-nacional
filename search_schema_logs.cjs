const fs = require('fs');
const readline = require('readline');

const logFile = 'C:\\Users\\ThinkPad\\.gemini\\antigravity\\brain\\6966afc1-f145-4182-b711-d3c06ca2eabc\\.system_generated\\logs\\transcript_full.jsonl';

async function searchLog() {
  const fileStream = fs.createReadStream(logFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log('Searching full logs for commands executing SQL or schema.sql...');

  for await (const line of rl) {
    if (line.toLowerCase().includes('schema.sql') || line.toLowerCase().includes('psql') || line.toLowerCase().includes('supabase db')) {
      try {
        const obj = JSON.parse(line);
        if (obj.tool_calls) {
          console.log(`Step ${obj.step_index}:`, JSON.stringify(obj.tool_calls, null, 2));
        } else if (obj.content) {
          console.log(`Step ${obj.step_index} Content:`, obj.content.substring(0, 300));
        }
      } catch (e) {
        console.log('Match (parse err):', line.substring(0, 200));
      }
    }
  }
}

searchLog();
