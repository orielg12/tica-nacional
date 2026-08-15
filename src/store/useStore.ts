import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LOTTERY_SCHEDULE, type LotteryConfig } from '../utils/lotteryRules';
import { supabase } from '../utils/supabase';

export interface CartItem {
  id: string; // unique internal ID
  number: string; // 00-99 or 00-99-00-99
  amount: number;
  lotteries: LotteryConfig[];
  isPalet?: boolean;
  isGranjita?: boolean;
  num1?: string;
  num2?: string;
}

export interface Ticket {
  id: string;
  client_name: string;
  total_amount: number;
  status: 'active' | 'cancelled' | 'paid';
  created_at: string;
  cart: CartItem[];
  lotteries: LotteryConfig[];
}

export interface Result {
  id: string;
  lotteryId: string;
  date: string;
  winning_number: string;
}

export interface User {
  id: string | number;
  name: string;
  role: string;
  commission: number;
  status: 'Activo' | 'Inactivo';
  username: string;
  password?: string;
  saleModeAccess?: '0.20' | '0.25' | 'Ambos';
  allowPalet?: boolean;
  allowGranjita?: boolean;
}

interface State {
  cart: CartItem[];
  tickets: Ticket[];
  results: Result[];
  users: User[];
  lotteriesMaster: LotteryConfig[];
  globalRiskLimit: number;
  selectedLotteries: LotteryConfig[];
  currentUser: User | null;
  
  ticketHeader: string;
  ticketFooter: string;
  cancelGraceMinutes: number; // 0 = sin límite (anular hasta hora de cierre del sorteo), >0 = minutos de gracia desde impresión
  saleMode: number;
  
  partnerModeActive: boolean;
  partnerCapital: number;
  partnerSplit: number;
  partnerReinvestPct: number;
  
  externalBankName: string;
  telegramToken: string;
  telegramChatId: string;
  enableVendorForecasts: boolean;
  
  // Actions
  setCancelGraceMinutes: (mins: number) => void;
  toggleVendorForecasts: (enable: boolean) => void;
  updatePartnerConfig: (active: boolean, capital: number, split: number, reinvest: number) => void;
  setExternalBankName: (name: string) => void;
  setSaleMode: (mode: number) => void;
  addNumber: (num: string, amount: number, isGranjita?: boolean) => void;
  addPaletPlay: (num1: string, num2: string, amount: number) => void;
  removeNumber: (id: string) => void;
  updateNumber: (id: string, newNumber: string, newAmount: number) => void;
  clearCart: () => void;
  
  toggleLottery: (lottery: LotteryConfig) => void;
  clearLotteries: () => void;
  
  getCartTotal: () => number;

  addTicket: (ticket: Ticket) => void;
  updateTicketStatus: (id: string, status: 'active' | 'cancelled' | 'paid') => void;

  addResult: (result: Result) => void;
  fetchUsers: () => Promise<void>;
  addUser: (user: Omit<User, 'id'>) => Promise<boolean>;
  deleteUser: (id: string | number) => Promise<boolean>;
  editUser: (id: string | number, newName: string, newCommission: number, newStatus: 'Activo' | 'Inactivo', newUsername: string, newPassword?: string, newSaleModeAccess?: '0.20' | '0.25' | 'Ambos', allowPalet?: boolean, allowGranjita?: boolean) => Promise<boolean>;
  
  fetchLotteries: () => Promise<void>;
  toggleMasterLottery: (id: string) => Promise<void>;
  addMasterLottery: (lottery: LotteryConfig) => Promise<boolean>;
  deleteMasterLottery: (id: string) => Promise<void>;
  editMasterLottery: (id: string, updates: Partial<LotteryConfig>) => Promise<boolean>;
  updateRiskLimit: (limit: number) => void;
  updateTicketConfig: (header: string, footer: string) => void;
  
  login: (username: string, password?: string) => boolean;
  logout: () => void;
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      cart: [],
      tickets: [],
      results: [],
      users: [
        { id: 0, name: 'Administrador', role: 'Admin', commission: 0, status: 'Activo', username: 'admin', password: '123', saleModeAccess: 'Ambos' },
        { id: 1, name: 'Ronier José', role: 'Vendedor', commission: 15, status: 'Activo', username: 'ronier', password: '123', saleModeAccess: 'Ambos' },
        { id: 2, name: 'Banca Central', role: 'Vendedor', commission: 10, status: 'Inactivo', username: 'banca', password: '123', saleModeAccess: 'Ambos' },
      ],
      lotteriesMaster: [...LOTTERY_SCHEDULE],
      globalRiskLimit: 100,
      selectedLotteries: [],
      currentUser: null,
      
      ticketHeader: 'GO',
      ticketFooter: 'REVISE SU TICKET\nVALIDO POR 15 DIAS\n* GRACIAS POR PREFERIRNOS *',
      cancelGraceMinutes: 10,
      saleMode: 0.20,
      
      partnerModeActive: false,
      partnerCapital: 7000,
      partnerSplit: 70,
      partnerReinvestPct: 0,
      
      
      externalBankName: 'Loteka Centro',
      telegramToken: '8423828162:AAHt_SOIsO9a94LxPzdfbeqqvqj3tmZuX2A',
      telegramChatId: '716975040',
      enableVendorForecasts: false,
      
      setCancelGraceMinutes: (mins) => set({ cancelGraceMinutes: mins }),
      
      toggleVendorForecasts: (enable) => set({ enableVendorForecasts: enable }),
      
      setSaleMode: (mode) => set({ saleMode: Math.round(mode * 100) / 100 }),
      
      setExternalBankName: (name) => set({ externalBankName: name }),
      
      updatePartnerConfig: (active, capital, split, reinvest) => set({
         partnerModeActive: active,
         partnerCapital: capital,
         partnerSplit: split,
         partnerReinvestPct: reinvest
      }),
      
      addNumber: (num, amount, isGranjita = false) => {
        const newItem: CartItem = {
          id: Math.random().toString(36).substring(7),
          number: num,
          amount,
          lotteries: get().selectedLotteries,
          isGranjita,
        };
        set((state) => ({ cart: [...state.cart, newItem] }));
      },
      
      addPaletPlay: (num1, num2, amount) => {
        const n1 = num1.padStart(2, '0');
        const n2 = num2.padStart(2, '0');
        const newItem: CartItem = {
          id: Math.random().toString(36).substring(7),
          number: `${n1}-${n2}`,
          amount,
          lotteries: get().selectedLotteries,
          isPalet: true,
          num1: n1,
          num2: n2
        };
        set((state) => ({ cart: [...state.cart, newItem] }));
      },
      
      removeNumber: (id) => set((state) => ({
        cart: state.cart.filter((item) => item.id !== id)
      })),
      
      updateNumber: (id, newNumber, newAmount) => set((state) => ({
        cart: state.cart.map(item =>
          item.id === id ? { ...item, number: newNumber, amount: newAmount } : item
        )
      })),
      
      clearCart: () => set({ cart: [] }),
      
      toggleLottery: (lottery) => set((state) => {
        const isSelected = state.selectedLotteries.some(l => l.id === lottery.id);
        if (isSelected) {
          return { selectedLotteries: state.selectedLotteries.filter(l => l.id !== lottery.id) };
        }
        return { selectedLotteries: [...state.selectedLotteries, lottery] };
      }),
      
      clearLotteries: () => set({ selectedLotteries: [] }),
      
      getCartTotal: () => {
        const cart = get().cart;
        return cart.reduce((total, item) => total + (item.amount * item.lotteries.length), 0);
      },

      addTicket: (ticket) => set((state) => ({ tickets: [ticket, ...state.tickets] })),
      
      updateTicketStatus: (id, status) => set((state) => ({
        tickets: state.tickets.map(t => t.id === id ? { ...t, status } : t)
      })),

      addResult: (result) => set((state) => {
        // Remove old result for the same lottery on the same day if it exists
        const filtered = state.results.filter(r => !(r.lotteryId === result.lotteryId && r.date === result.date));
        return { results: [result, ...filtered] };
      }),

      fetchUsers: async () => {
         const { data, error } = await supabase.from('profiles').select('*');
         if (!error && data) {
            const mappedUsers: User[] = data.map((d: any) => {
               const parts = (d.name || '').split('||');
               return {
                  id: d.id,
                  name: parts[0],
                  saleModeAccess: (parts[1] || 'Ambos') as '0.20' | '0.25' | 'Ambos',
                  allowPalet: parts[2] !== 'palet_off',
                  allowGranjita: parts[3] !== 'granjita_off',
                  role: d.role === 'admin' ? 'Admin' : 'Vendedor',
                  commission: parseFloat(d.commission) || 0,
                  status: d.status === 'inactive' || d.status === 'Inactivo' ? 'Inactivo' : 'Activo',
                  username: d.username,
                  password: d.password
               };
            });

            if (mappedUsers.length === 0) {
               set({ users: [
                 { id: 0, name: 'Administrador', role: 'Admin', commission: 0, status: 'Activo', username: 'admin', password: '123', saleModeAccess: 'Ambos', allowPalet: true, allowGranjita: true }
               ]});
            } else {
               set({ users: mappedUsers });
               
               // Sync logged-in user profile from DB dynamically
               const currUser = get().currentUser;
               if (currUser) {
                  const freshUser = mappedUsers.find(u => u.id === currUser.id);
                  if (freshUser) {
                     if (freshUser.status === 'Inactivo') {
                        // Logout if account was deactivated
                        set({ currentUser: null, cart: [], selectedLotteries: [], saleMode: 0.20 });
                     } else {
                        // Update current user info and enforce saleMode constraints if changed
                        let newSaleMode = get().saleMode;
                        if (freshUser.saleModeAccess === '0.20') {
                           newSaleMode = 0.20;
                        } else if (freshUser.saleModeAccess === '0.25') {
                           newSaleMode = 0.25;
                        }
                        set({ currentUser: freshUser, saleMode: newSaleMode });
                     }
                  }
               }
            }
         }
      },

      addUser: async (user) => {
         const paletTag = user.allowPalet !== false ? 'palet_on' : 'palet_off';
         const granjitaTag = user.allowGranjita !== false ? 'granjita_on' : 'granjita_off';
         const encodedName = `${user.name}||${user.saleModeAccess || 'Ambos'}||${paletTag}||${granjitaTag}`;
         const { data, error } = await supabase.from('profiles').insert({
            name: encodedName,
            role: user.role === 'Admin' ? 'admin' : 'vendor',
            username: user.username,
            password: user.password || '',
            commission: user.commission,
            status: user.status === 'Activo' ? 'active' : 'inactive'
         }).select('*').single();

         if (!error && data) {
            set((state) => ({ users: [...state.users, { ...user, id: data.id }] }));
            return true;
         }
         console.error("Error creating user:", error);
         return false;
      },
      
      deleteUser: async (id) => {
         const { error } = await supabase.from('profiles').delete().eq('id', id);
         if (!error) {
            set((state) => ({ users: state.users.filter(u => u.id !== id) }));
            return true;
         }
         return false;
      },
      
      editUser: async (id: string | number, name: string, commission: number, status: 'Activo'|'Inactivo', username: string, password?: string, saleModeAccess?: '0.20'|'0.25'|'Ambos', allowPalet?: boolean, allowGranjita?: boolean) => {
         const paletTag = allowPalet !== false ? 'palet_on' : 'palet_off';
         const granjitaTag = allowGranjita !== false ? 'granjita_on' : 'granjita_off';
         const encodedName = `${name}||${saleModeAccess || 'Ambos'}||${paletTag}||${granjitaTag}`;
         const updateData: any = {
            name: encodedName,
            commission,
            status: status === 'Activo' ? 'active' : 'inactive',
            username
         };
         if (password) updateData.password = password;

         const { error } = await supabase.from('profiles').update(updateData).eq('id', id);
         
         if (!error) {
            set((state) => ({
               users: state.users.map(u => u.id === id ? { ...u, name, commission, status, username, password: password || u.password, saleModeAccess, allowPalet, allowGranjita } : u)
            }));
            return true;
         }
         return false;
      },

      fetchLotteries: async () => {
         let { data, error } = await supabase.from('lotteries').select('*');
         if (!error && data) {
            // Sincronizar automáticamente cualquier lotería por defecto (incluyendo La Granjita) que falte en la BD
            const existingIds = new Set(data.map((d: any) => d.id));
            const missing = LOTTERY_SCHEDULE.filter(l => !existingIds.has(l.id));
            if (missing.length > 0) {
               const inserts = missing.map(l => ({
                  id: l.id,
                  name: l.name,
                  hour: l.hour,
                  minute: l.minute,
                  days: l.days || null,
                  is_active: l.isActive !== false,
                  close_minutes: l.closeMinutes ?? 10
               }));
               await supabase.from('lotteries').insert(inserts);
               const { data: refreshed } = await supabase.from('lotteries').select('*');
               if (refreshed && refreshed.length > 0) data = refreshed;
            }

            const mappedLotteries = data.map((d: any) => ({
               id: d.id,
               name: d.name,
               hour: d.hour,
               minute: d.minute,
               days: d.days || undefined,
               isActive: d.is_active,
               closeMinutes: d.close_minutes ?? 10
            }));
            
            // Ordenar cronológicamente por hora y luego por minuto
            mappedLotteries.sort((a, b) => {
               if (a.hour !== b.hour) return a.hour - b.hour;
               return a.minute - b.minute;
            });

            set({ lotteriesMaster: mappedLotteries });
         }
      },

      toggleMasterLottery: async (id) => {
         const lottery = get().lotteriesMaster.find(l => l.id === id);
         if (!lottery) return;
         const newStatus = !lottery.isActive;
         const { error } = await supabase.from('lotteries').update({ is_active: newStatus }).eq('id', id);
         if (!error) {
            set((state) => ({
               lotteriesMaster: state.lotteriesMaster.map(l => l.id === id ? { ...l, isActive: newStatus } : l)
            }));
            // Re-fetch para confirmar el estado real desde la BD
            await get().fetchLotteries();
         } else {
            alert('Error al actualizar el sorteo: ' + error.message);
         }
      },

      addMasterLottery: async (lottery) => {
         const { data, error } = await supabase.from('lotteries').insert({
            id: lottery.id,
            name: lottery.name,
            hour: lottery.hour,
            minute: lottery.minute,
            days: lottery.days || null,
            is_active: lottery.isActive,
            close_minutes: lottery.closeMinutes ?? 10
         }).select('*').single();

         if (!error && data) {
            set((state) => ({
               lotteriesMaster: [...state.lotteriesMaster, { ...lottery, isActive: data.is_active, days: data.days || undefined }]
            }));
            // Re-fetch para sincronizar todos los clientes
            await get().fetchLotteries();
            return true;
         } else {
            console.error("Error creating lottery:", error);
            alert("Error al guardar el sorteo en la nube: " + (error?.message || JSON.stringify(error)));
            return false;
         }
      },

      editMasterLottery: async (id, updates) => {
         const dbUpdates: any = {};
         if (updates.name !== undefined) dbUpdates.name = updates.name;
         if (updates.hour !== undefined) dbUpdates.hour = updates.hour;
         if (updates.minute !== undefined) dbUpdates.minute = updates.minute;
         if (updates.days !== undefined) dbUpdates.days = updates.days || null;
         if (updates.closeMinutes !== undefined) dbUpdates.close_minutes = updates.closeMinutes;

         const { error } = await supabase.from('lotteries').update(dbUpdates).eq('id', id);

         if (!error) {
            set((state) => ({
               lotteriesMaster: state.lotteriesMaster.map(l => l.id === id ? { ...l, ...updates } : l)
            }));
            await get().fetchLotteries();
            return true;
         } else {
            console.error("Error updating lottery:", error);
            alert("Error al editar el sorteo en la nube.");
            return false;
         }
      },

      deleteMasterLottery: async (id) => {
         const { error } = await supabase.from('lotteries').delete().eq('id', id);
         if (!error) {
            set((state) => ({
               lotteriesMaster: state.lotteriesMaster.filter(l => l.id !== id),
               selectedLotteries: state.selectedLotteries.filter(l => l.id !== id)
            }));
         } else {
            alert("Error al eliminar el sorteo de la nube.");
         }
      },

      updateRiskLimit: (limit) => set({ globalRiskLimit: limit }),
      
      updateTicketConfig: (header, footer) => set({ ticketHeader: header, ticketFooter: footer }),
      
      login: (username, password) => {
         const cleanUser = (username || '').trim().toLowerCase();
         const cleanPass = (password || '').trim();
         const user = get().users.find(u => (u.username || '').toLowerCase() === cleanUser && u.password === cleanPass && u.status === 'Activo');
         if (user) {
             // Asegurar que saleModeAccess siempre tenga un valor
             const userWithAccess = { ...user, saleModeAccess: user.saleModeAccess || 'Ambos' as const };
             // Configurar el saleMode inicial basado en el acceso del usuario
             const initialSaleMode = userWithAccess.saleModeAccess === '0.25' ? 0.25 : 0.20;
             set({ currentUser: userWithAccess, saleMode: initialSaleMode });
             return true;
         }
         return false;
      },
      
      logout: () => set({ currentUser: null, cart: [], selectedLotteries: [], saleMode: 0.20 })
    }),
    {
      name: 'pos-storage',
      version: 5,
      migrate: (persistedState: any, version: number) => {
         if (version < 5 || !version) {
            if (persistedState) {
               persistedState.ticketHeader = 'GO';
            }
         }
         if (persistedState && typeof persistedState.ticketHeader === 'string' && /banca|oro/i.test(persistedState.ticketHeader)) {
            persistedState.ticketHeader = 'GO';
         }
         return persistedState;
      }
    }
  )
);
