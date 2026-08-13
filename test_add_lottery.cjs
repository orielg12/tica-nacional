const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nqoqdlycxkwunngkuewb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xb3FkbHljeGt3dW5uZ2t1ZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzkzNzUsImV4cCI6MjA5MTE1NTM3NX0.Dm8RCh2pqFhwu9lJvIeuTnNWYpArSUjxPcWR1-WV4oE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Inserting with days: ["Lunes", "Martes"]');
  const { data, error } = await supabase.from('lotteries').insert({
    id: '100-testlottery',
    name: 'Test Lottery',
    hour: 10,
    minute: 0,
    days: ['Lunes', 'Martes'],
    is_active: true
  }).select('*');

  if (error) {
    console.error('Insert Error with days:', error);
  } else {
    console.log('Insert Success with days:', data);
    // Cleanup
    await supabase.from('lotteries').delete().eq('id', '100-testlottery');
  }

  console.log('Inserting with no days (null):');
  const { data: data2, error: error2 } = await supabase.from('lotteries').insert({
    id: '100-testlottery-null',
    name: 'Test Lottery Null',
    hour: 10,
    minute: 0,
    days: null,
    is_active: true
  }).select('*');

  if (error2) {
    console.error('Insert Error with null days:', error2);
  } else {
    console.log('Insert Success with null days:', data2);
    // Cleanup
    await supabase.from('lotteries').delete().eq('id', '100-testlottery-null');
  }
}

check();
