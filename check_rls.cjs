const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nqoqdlycxkwunngkuewb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xb3FkbHljeGt3dW5uZ2t1ZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzkzNzUsImV4cCI6MjA5MTE1NTM3NX0.Dm8RCh2pqFhwu9lJvIeuTnNWYpArSUjxPcWR1-WV4oE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Querying table policies...');
  // We can query pg_policies or pg_tables
  const { data, error } = await supabase.rpc('execute_sql', {
    sql_query: "SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE tablename = 'lotteries';"
  });

  if (error) {
    console.error('RPC Error:', error);
    // If RPC execute_sql is not available, we can try querying it from pg_catalog / information_schema directly
    const { data: d2, error: e2 } = await supabase.from('pg_policies').select('*');
    console.error('Alt attempt error:', e2);
  } else {
    console.log('Policies:', data);
  }
}

check();
