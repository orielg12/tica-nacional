const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nqoqdlycxkwunngkuewb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xb3FkbHljeGt3dW5uZ2t1ZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzkzNzUsImV4cCI6MjA5MTE1NTM3NX0.Dm8RCh2pqFhwu9lJvIeuTnNWYpArSUjxPcWR1-WV4oE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log('Testing profile update...');
  const { data, error } = await supabase
    .from('profiles')
    .update({ name: 'vendedor1||Ambos' })
    .eq('username', 'vendedor1')
    .select('*');

  if (error) {
    console.error('Update failed:', error);
  } else {
    console.log('Update succeeded! Result:', data);
  }
}

test();
