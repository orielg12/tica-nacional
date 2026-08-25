import { supabase } from '../utils/supabase';
import { useStore } from '../store/useStore';
import { formatAnimalDisplay } from '../utils/granjitaAnimals';
import { isGranjitaLottery } from '../utils/lotteryRules';
import { getPanamaLocalISODate } from '../utils/dateUtils';

export interface PendingWinner {
  key_id: string;
  ticket_id: string;
  ticket_number?: number;
  number: string;
  grossPrize: number;       // Premio bruto total ganado
  alreadyPaid: number;      // Lo que ya se pagó (en cash o en jugadas)
  remainingPrize: number;   // Lo que queda por pagar
  reimbursement: number;    // Cobertura externa
  client: string | null;
  description: string;
  vendor_id?: string;
  ticket_date?: string;
  status?: string;
}

export async function fetchPendingWinners(vendorId?: string, includePaid: boolean = true): Promise<PendingWinner[]> {
  const store = useStore.getState();
  const currentUser = store.currentUser;
  const isAdmin = currentUser?.role === 'admin' && !currentUser?.isSubAdmin;
  const isSubAdmin = currentUser?.isSubAdmin;

  // 1. Fetch all active + paid tickets (No limits, supports unlimited tickets)
  let query = supabase
    .from('tickets')
    .select('id, ticket_number, client_name, total_amount, created_at, status, vendor_id, ticket_numbers(id, draw_id, number_played, amount, covers(excess_amount))')
    .eq('is_bank_prize', false)
    .in('status', ['active', 'paid'])
    .order('created_at', { ascending: false });

  if (!isAdmin) {
    if (isSubAdmin) {
      let users = store.users;
      if (!users || users.length === 0) {
        await store.fetchUsers();
        users = useStore.getState().users;
      }
      const subAdminVendorIds = (users || [])
        .filter(u => u.parentAdminId === currentUser?.username)
        .map(u => u.username)
        .concat(currentUser?.username || '');
      query = query.in('vendor_id', subAdminVendorIds);
    } else if (vendorId) {
      query = query.eq('vendor_id', vendorId);
    }
  }

  const { data: tickets, error: tErr } = await query;

  if (tErr) throw tErr;
  if (!tickets || tickets.length === 0) return [];

  const dates = [...new Set(tickets.map((t: any) => getPanamaLocalISODate(new Date(t.created_at))))];

  // 2. Fetch results for those dates in safe batches (max 50 dates per query)
  let results: any[] = [];
  const dateBatchSize = 50;
  for (let i = 0; i < dates.length; i += dateBatchSize) {
    const dateChunk = dates.slice(i, i + dateBatchSize);
    const { data: rData, error: rErr } = await supabase
      .from('results')
      .select('draw_id, date, winning_number')
      .in('date', dateChunk);
    if (rErr) throw rErr;
    if (rData) results = results.concat(rData);
  }

  // 3. Fetch all payouts for these tickets in safe batches (max 50 tickets per query) to support UNLIMITED tickets
  const ticketIds = tickets.map((t: any) => t.id);
  let payouts: any[] = [];
  const payoutBatchSize = 50;
  for (let i = 0; i < ticketIds.length; i += payoutBatchSize) {
    const idChunk = ticketIds.slice(i, i + payoutBatchSize);
    const { data: pData, error: pErr } = await supabase
      .from('payouts')
      .select('ticket_id, amount, paid_by')
      .in('ticket_id', idChunk);
    if (pErr) throw pErr;
    if (pData) payouts = payouts.concat(pData);
  }

  // Build a map of paid amounts per ticket (excluding external bank reimbursements)
  const paidMap: Record<string, number> = {};
  payouts?.forEach((p: any) => {
    if (p.paid_by !== 'EXTERNAL_BANK_REIMBURSEMENT') {
      paidMap[p.ticket_id] = (paidMap[p.ticket_id] || 0) + parseFloat(p.amount || '0');
    }
  });

  // 4. Process matches
  const consolidated: Record<string, PendingWinner> = {};

  tickets.forEach((ticket: any) => {
    const ticketDate = getPanamaLocalISODate(new Date(ticket.created_at));

    const totalViles = ticket.ticket_numbers?.reduce((sum: number, tn: any) => sum + parseFloat(tn.amount || '0'), 0) || 1;
    const inferredMode = (ticket.total_amount / totalViles) >= 0.24 ? 0.25 : 0.20;

    ticket.ticket_numbers?.forEach((item: any) => {
      const result = results?.find((r: any) => r.draw_id === item.draw_id && r.date === ticketDate);
      if (!result) return;

      const [first, second, third] = result.winning_number.split('-');
      const numPlayed = String(item.number_played).trim();
      const lotteryObj = useStore.getState().lotteriesMaster.find(l => l.id === item.draw_id);
      const lotteryName = lotteryObj?.name || item.draw_id;
      const isGranjita = isGranjitaLottery(lotteryObj);

      const isMatch = (played: string, winNum?: string) => {
        if (!winNum) return false;
        const p = String(played).trim();
        const w = String(winNum).trim();
        if (p === w) return true;
        if (isGranjita) {
          if (p === '00' || w === '00') return p === w;
          if (p.replace(/^0+/, '') === w.replace(/^0+/, '')) return true;
        }
        return false;
      };

      let prizeMultiplier = 0;
      const posArr: string[] = [];

      if (isMatch(numPlayed, first)) {
        prizeMultiplier += inferredMode === 0.25 ? 14 : 11;
        posArr.push('1er');
      }
      if (!isGranjita && isMatch(numPlayed, second)) {
        prizeMultiplier += 3;
        posArr.push('2do');
      }
      if (!isGranjita && isMatch(numPlayed, third)) {
        prizeMultiplier += 2;
        posArr.push('3er');
      }

      if (prizeMultiplier > 0) {
        const awardAmount = parseFloat(item.amount) * prizeMultiplier;
        const pos = isGranjita ? 'Ganador' : posArr.join(' y ');
        const displayPlayed = isGranjita ? formatAnimalDisplay(item.number_played) : item.number_played;
        const desc = `${displayPlayed} (${pos} en ${lotteryName})`;

        let coveredAward = 0;
        if (item.covers && item.covers.length > 0) {
          const totalCoverForNumber = item.covers.reduce((sum: number, cov: any) => sum + parseFloat(cov.excess_amount || 0), 0);
          coveredAward = totalCoverForNumber * prizeMultiplier;
        }

        if (!consolidated[ticket.id]) {
          consolidated[ticket.id] = {
            key_id: ticket.id,
            ticket_id: ticket.id,
            ticket_number: ticket.ticket_number,
            number: item.number_played,
            grossPrize: 0,
            alreadyPaid: paidMap[ticket.id] || 0,
            remainingPrize: 0,
            reimbursement: 0,
            client: ticket.client_name,
            description: [] as any,
            vendor_id: ticket.vendor_id,
            ticket_date: ticketDate,
            status: ticket.status
          };
        } else {
          consolidated[ticket.id].number = 'Múltiple';
        }

        consolidated[ticket.id].grossPrize += awardAmount;
        consolidated[ticket.id].reimbursement += coveredAward;
        (consolidated[ticket.id].description as any).push(desc);
      }
    });
  });

  // Calculate remaining prize and sort (only return pending prizes)
  const list: PendingWinner[] = [];
  Object.values(consolidated).forEach(c => {
    c.remainingPrize = Math.max(0, c.grossPrize - c.alreadyPaid);
    c.description = (c.description as any as string[]).join(' | ');
    if (includePaid ? true : c.remainingPrize > 0.001) {
      list.push(c);
    }
  });

  // Sort: Pending prizes first, then by date descending
  list.sort((a, b) => {
    if (a.remainingPrize > 0 && b.remainingPrize === 0) return -1;
    if (a.remainingPrize === 0 && b.remainingPrize > 0) return 1;
    return (b.ticket_number || 0) - (a.ticket_number || 0);
  });

  return list;
}
