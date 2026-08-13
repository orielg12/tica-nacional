const fs = require('fs');
const readline = require('readline');

const logFile = 'C:\\Users\\ThinkPad\\.gemini\\antigravity\\brain\\6966afc1-f145-4182-b711-d3c06ca2eabc\\.system_generated\\logs\\transcript_full.jsonl';

async function searchLog() {
  const fileStream = fs.createReadStream(logFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log('Searching logs around step 2059...');

  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);
      if (obj.step_index >= 2058 && obj.step_index <= 2075) {
        console.log(`Step ${obj.step_index} (${obj.type}):`, obj.content ? obj.content.substring(0, 500) : JSON.stringify(obj.tool_calls, null, 2));
      }
    } catch (e) {}
  }
}

searchLog();
