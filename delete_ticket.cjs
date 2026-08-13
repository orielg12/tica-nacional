const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://nqoqdlycxkwunngkuewb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xb3FkbHljeGt3dW5uZ2t1ZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzkzNzUsImV4cCI6MjA5MTE1NTM3NX0.Dm8RCh2pqFhwu9lJvIeuTnNWYpArSUjxPcWR1-WV4oE';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const partialId = '1d0e1733';
  console.log(`Searching for ticket with ID starting with '${partialId}'...`);
  
  // Find ticket
  const { data: tickets, error: tErr } = await supabase
    .from('tickets')
    .select('*');
  
  if (tErr) {
    console.error('Error fetching tickets:', tErr);
    return;
  }
  
  const ticket = tickets?.find(t => t.id.toLowerCase().startsWith(partialId.toLowerCase()));
  if (!ticket) {
    console.log('Ticket not found.');
    return;
  }
  
  console.log('Ticket found:', ticket);
  const ticketId = ticket.id;

  // 1. Delete from payouts
  console.log('Deleting payouts...');
  const { error: pErr } = await supabase
    .from('payouts')
    .delete()
    .eq('ticket_id', ticketId);
  if (pErr) console.error('Error deleting payouts:', pErr);

  // 2. Find ticket numbers to delete covers
  const { data: tns, error: tnSelectErr } = await supabase
    .from('ticket_numbers')
    .select('id')
    .eq('ticket_id', ticketId);
  
  if (tnSelectErr) {
    console.error('Error fetching ticket numbers:', tnSelectErr);
  } else if (tns && tns.length > 0) {
    const tnIds = tns.map(tn => tn.id);
    console.log('Deleting covers for ticket numbers:', tnIds);
    const { error: cErr } = await supabase
      .from('covers')
      .delete()
      .in('ticket_number_id', tnIds);
    if (cErr) console.error('Error deleting covers:', cErr);
  }

  // 3. Delete from ticket_numbers
  console.log('Deleting ticket numbers...');
  const { error: tnErr } = await supabase
    .from('ticket_numbers')
    .delete()
    .eq('ticket_id', ticketId);
  if (tnErr) console.error('Error deleting ticket numbers:', tnErr);

  // 4. Delete from tickets
  console.log('Deleting ticket header...');
  const { error: delErr } = await supabase
    .from('tickets')
    .delete()
    .eq('id', ticketId);
  
  if (delErr) {
    console.error('Error deleting ticket:', delErr);
  } else {
    console.log('TICKET DELETED SUCCESSFULLY!');
  }
}
run();
