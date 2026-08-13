const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nqoqdlycxkwunngkuewb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xb3FkbHljeGt3dW5uZ2t1ZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzkzNzUsImV4cCI6MjA5MTE1NTM3NX0.Dm8RCh2pqFhwu9lJvIeuTnNWYpArSUjxPcWR1-WV4oE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectTables() {
  const todayTicketIds = [
    '36a8d662-c550-4618-965f-38de744b39c5',
    '312637f2-c159-4a22-a049-4754a8cc89d9',
    '1ac07306-2742-4327-bf92-497410df65d3'
  ];

  console.log('--- TICKET NUMBERS FOR TODAY TICKETS ---');
  const { data: numbers, error: errN } = await supabase
    .from('ticket_numbers')
    .select('*')
    .in('ticket_id', todayTicketIds);
  
  if (errN) console.error('ticket_numbers error:', errN);
  else {
    console.log('Ticket numbers sample:', numbers ? numbers[0] : 'None');
    console.log('Ticket numbers count:', numbers ? numbers.length : 0);
  }

  console.log('--- EXTERNAL SALES ---');
  const { data: extSales, error: errExt } = await supabase
    .from('external_sales')
    .select('*')
    .gte('created_at', '2026-08-12T00:00:00');
  
  if (errExt) console.log('external_sales table error / not present:', errExt.message);
  else console.log('external_sales found:', extSales);
}

inspectTables();
