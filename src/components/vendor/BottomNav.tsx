import { NavLink } from 'react-router-dom';
import { ShoppingCart, Clock, List } from 'lucide-react';

export default function BottomNav() {
  return (
    <div className="flex bg-[#111827] border-t border-gray-800 pb-safe">
      <NavLink to="/vendor/pos" className={({ isActive }) => `flex-1 py-3 flex flex-col items-center justify-center transition-colors ${isActive ? 'text-teal-500 bg-teal-900/10' : 'text-gray-500 hover:text-gray-400'}`}>
        <ShoppingCart size={24} />
        <span className="text-xs mt-1 font-bold">POS</span>
      </NavLink>
      <NavLink to="/vendor/tickets" className={({ isActive }) => `flex-1 py-3 flex flex-col items-center justify-center transition-colors ${isActive ? 'text-teal-500 bg-teal-900/10' : 'text-gray-500 hover:text-gray-400'}`}>
        <List size={24} />
        <span className="text-xs mt-1 font-bold">Tickets</span>
      </NavLink>
      <NavLink to="/vendor/results" className={({ isActive }) => `flex-1 py-3 flex flex-col items-center justify-center transition-colors ${isActive ? 'text-teal-500 bg-teal-900/10' : 'text-gray-500 hover:text-gray-400'}`}>
        <Clock size={24} />
        <span className="text-xs mt-1 font-bold">Sorteos</span>
      </NavLink>
      <NavLink to="/admin" className={({ isActive }) => `flex-1 py-3 flex flex-col items-center justify-center transition-colors ${isActive ? 'text-teal-500 bg-teal-900/10' : 'text-gray-500 hover:text-gray-400'}`}>
        <span className="text-xs mt-1 font-bold border border-gray-500 rounded px-2 py-1">Admin</span>
      </NavLink>
    </div>
  );
}
