import { supabase } from '../utils/supabase';
import { useStore } from '../store/useStore';
import { isGranjitaLottery } from '../utils/lotteryRules';
import { getPanamaLocalISODate, getStartOfPanamaDayUTC, getEndOfPanamaDayUTC } from '../utils/dateUtils';

export interface PendingWinner {
  key_id: string;
  ticket_id: string;
  ticket_number?: number;
  number: string;
  grossPrize: number;
  alreadyPaid: number;
  remainingPrize: number;
  reimbursement: number;
  client: string | null;
  description: string;
  vendor_id?: string;
  ticket_date?: string;
  status?: string;
}

export async function fetchPendingWinners(
  vendorId?: string, 
  targetDate?: string, 
  includePaid: boolean = false
): Promise<PendingWinner[]> {
  const store = useStore.getState();
  const currentUser = store.currentUser;

  const rawRole = (currentUser?.role || '').toLowerCase();
  const isAdmin = (rawRole === 'admin') && !currentUser?.isSubAdmin;
  const isSubAdmin = currentUser?.isSubAdmin;

  // Filtrar exclusivamente los tickets del día solicitado (por defecto HOY en Panamá)
  const targetDay = targetDate || getPanamaLocalISODate();
  const startOfDay = getStartOfPanamaDayUTC(targetDay);
  const endOfDay = getEndOfPanamaDayUTC(targetDay);

  let ticketQuery = supabase
    .from('tickets')
    .select('id, ticket_number, client_name, total_amount, created_at, status, vendor_id')
    .eq('is_bank_prize', false)
    .gte('created_at', startOfDay)
    .lte('created_at', endOfDay)
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
        .filter((u: any) => u.parentAdminId === currentUser?.username)
        .map((u: any) => u.username)
        .concat(currentUser?.username || '');
      ticketQuery = ticketQuery.in('vendor_id', subAdminVendorIds);
    } else if (vendorId) {
      ticketQuery = ticketQuery.eq('vendor_id', vendorId);
    }
  }

  const { data: tickets, error: tErr } = await ticketQuery;
  if (tErr) { console.error('[prizeService] tickets error:', tErr); throw tErr; }
  if (!tickets || tickets.length === 0) return [];

  console.log('[prizeService] tickets today:', tickets.length, 'vendorId:', vendorId, 'date:', targetDay);

  const allTicketIds = tickets.map((t: any) => t.id);
  const ticketNumbersAll: any[] = [];
  const chunks: string[][] = [];
  for (let i = 0; i < allTicketIds.length; i += 100) {
    chunks.push(allTicketIds.slice(i, i + 100));
  }

  // Ejecución en paralelo de números de tickets y resultados del día
  const [resultsRes, ...tnResults] = await Promise.all([
    supabase
      .from('results')
      .select('draw_id, date, winning_number')
      .eq('date', targetDay),
    ...chunks.map(chunk =>
      supabase
        .from('ticket_numbers')
        .select('id, ticket_id, draw_id, number_played, amount, covers(excess_amount)')
        .in('ticket_id', chunk)
    )
  ]);

  if (resultsRes.error) {
    console.error('[prizeService] results error:', resultsRes.error);
    throw resultsRes.error;
  }
  const results = resultsRes.data;

  tnResults.forEach(({ data, error }) => {
    if (error) console.error('[prizeService] tn batch error:', error);
    if (data) ticketNumbersAll.push(...data);
  });

  console.log('[prizeService] ticket_numbers:', ticketNumbersAll.length, 'results:', results?.length);

  const tnByTicket: Record<string, any[]> = {};
  ticketNumbersAll.forEach((tn: any) => {
    if (!tnByTicket[tn.ticket_id]) tnByTicket[tn.ticket_id] = [];
    tnByTicket[tn.ticket_id].push(tn);
  });

  const consolidated: Record<string, PendingWinner> = {};

  tickets.forEach((ticket: any) => {
    const ticketDate = getPanamaLocalISODate(new Date(ticket.created_at));

    const items = tnByTicket[ticket.id] || [];
    const totalViles = items.reduce((sum: number, tn: any) => sum + parseFloat(tn.amount || '0'), 0) || 1;
    const inferredMode = (ticket.total_amount / totalViles) >= 0.24 ? 0.25 : 0.20;

    items.forEach((item: any) => {
      const result = results?.find((r: any) => r.draw_id === item.draw_id && r.date === ticketDate);
      if (!result) return;

      const [first, second, third] = result.winning_number.split('-');
      const numPlayed = String(item.number_played).trim();
      const lotteryObj = useStore.getState().lotteriesMaster.find((l: any) => l.id === item.draw_id);
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
        } else {
          if (p.padStart(2, '0') === w.padStart(2, '0')) return true;
        }
        return false;
      };

      let prizeMultiplier = 0;
      const posArr: string[] = [];
      if (isMatch(numPlayed, first)) { prizeMultiplier += inferredMode === 0.25 ? 14 : 11; posArr.push('1er'); }
      if (!isGranjita && isMatch(numPlayed, second)) { prizeMultiplier += 3; posArr.push('2do'); }
      if (!isGranjita && isMatch(numPlayed, third)) { prizeMultiplier += 2; posArr.push('3er'); }

      if (prizeMultiplier > 0) {
        const awardAmount = parseFloat(item.amount) * prizeMultiplier;
        const coveredAmount = item.covers?.reduce((sum: number, c: any) => sum + parseFloat(c.excess_amount || '0'), 0) || 0;
        const coveredAward = coveredAmount * prizeMultiplier;
        const pos = isGranjita ? 'Ganador' : posArr.join(' y ');
        const desc = `${item.number_played} (${pos} en ${lotteryName})`;


        if (!consolidated[ticket.id]) {
          consolidated[ticket.id] = {
            key_id: ticket.id, ticket_id: ticket.id, ticket_number: ticket.ticket_number,
            number: item.number_played, grossPrize: 0, alreadyPaid: 0, remainingPrize: 0,
            reimbursement: 0, client: ticket.client_name, description: [] as any,
            vendor_id: ticket.vendor_id, ticket_date: ticketDate, status: ticket.status
          };
        } else {
          consolidated[ticket.id].number = 'Multiple';
        }
        consolidated[ticket.id].grossPrize += awardAmount;
        consolidated[ticket.id].reimbursement += coveredAward;
        (consolidated[ticket.id].description as any).push(desc);
      }
    });
  });

  console.log('[prizeService] winning:', Object.keys(consolidated).length);
  const winningTicketIds = Object.keys(consolidated);
  const paidMap: Record<string, number> = {};
  if (winningTicketIds.length > 0) {
    const pChunks: string[][] = [];
    for (let i = 0; i < winningTicketIds.length; i += 30) {
      pChunks.push(winningTicketIds.slice(i, i + 30));
    }
    const payoutBatches = await Promise.all(
      pChunks.map(chunk =>
        supabase.from('payouts').select('ticket_id, amount, paid_by').in('ticket_id', chunk)
      )
    );
    payoutBatches.forEach(({ data: payouts }) => {
      if (payouts) {
        payouts.forEach((p: any) => {
          if (p.paid_by !== 'EXTERNAL_BANK_REIMBURSEMENT') {
            paidMap[p.ticket_id] = (paidMap[p.ticket_id] || 0) + parseFloat(p.amount || '0');
          }
        });
      }
    });
  }

  const list: PendingWinner[] = [];
  Object.values(consolidated).forEach(c => {
    c.alreadyPaid = paidMap[c.ticket_id] || 0;
    c.remainingPrize = Math.max(0, c.grossPrize - c.alreadyPaid);
    c.description = (c.description as any as string[]).join(' | ');
    if (includePaid ? true : c.remainingPrize > 0.001) list.push(c);
  });

  list.sort((a, b) => {
    if (a.remainingPrize > 0 && b.remainingPrize === 0) return -1;
    if (a.remainingPrize === 0 && b.remainingPrize > 0) return 1;
    return (b.ticket_number || 0) - (a.ticket_number || 0);
  });

  console.log('[prizeService] returning', list.length);
  return list;
}
