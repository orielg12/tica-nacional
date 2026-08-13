const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nqoqdlycxkwunngkuewb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xb3FkbHljeGt3dW5uZ2t1ZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzkzNzUsImV4cCI6MjA5MTE1NTM3NX0.Dm8RCh2pqFhwu9lJvIeuTnNWYpArSUjxPcWR1-WV4oE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Inserting with .select("*").single()...');
  const { data, error } = await supabase.from('lotteries').insert({
    id: 'test-single-123',
    name: 'Test Single',
    hour: 10,
    minute: 0,
    days: null,
    is_active: true
  }).select('*').single();

  if (error) {
    console.error('Error with .single():', error);
  } else {
    console.log('Success with .single():', data);
    // Cleanup
    await supabase.from('lotteries').delete().eq('id', 'test-single-123');
  }
}

check();
