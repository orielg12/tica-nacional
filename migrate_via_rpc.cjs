const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nqoqdlycxkwunngkuewb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xb3FkbHljeGt3dW5uZ2t1ZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzkzNzUsImV4cCI6MjA5MTE1NTM3NX0.Dm8RCh2pqFhwu9lJvIeuTnNWYpArSUjxPcWR1-WV4oE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log('Running migration via execute_sql RPC...');
  const { data, error } = await supabase.rpc('execute_sql', {
    sql_query: "ALTER TABLE lotteries ADD COLUMN IF NOT EXISTS close_minutes INTEGER DEFAULT 10;"
  });

  if (error) {
    console.error('RPC Error running migration:', error);
  } else {
    console.log('Migration output:', data);
    console.log('Successfully added close_minutes column!');
  }
}

runMigration();
