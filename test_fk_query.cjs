const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nqoqdlycxkwunngkuewb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xb3FkbHljeGt3dW5uZ2t1ZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzkzNzUsImV4cCI6MjA5MTE1NTM3NX0.Dm8RCh2pqFhwu9lJvIeuTnNWYpArSUjxPcWR1-WV4oE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testQuery() {
  console.log('Testing query from ticket_numbers:');
  const { data, error } = await supabase
    .from('ticket_numbers')
    .select('number_played, amount, draw_id, ticket:ticket_id(status, sale_mode)')
    .limit(5);

  console.log('ticket:ticket_id result:', data, 'error:', error);

  const { data: d2, error: e2 } = await supabase
    .from('ticket_numbers')
    .select('number_played, amount, draw_id, ticket:tickets(status, sale_mode)')
    .limit(5);

  console.log('ticket:tickets result:', d2, 'error:', e2);
}

testQuery();
