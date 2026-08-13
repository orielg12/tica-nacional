import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { Lock } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const store = useStore();
  const navigate = useNavigate();

  useEffect(() => {
     if (store.currentUser) {
        if (store.currentUser.role === 'Admin') {
           navigate('/admin', { replace: true });
        } else {
           navigate('/vendor/pos', { replace: true });
        }
        return;
     }

     // Sincronizar usuarios y sorteos desde DB al abrir la app de login
     Promise.all([store.fetchUsers(), store.fetchLotteries()]).then(() => {
       setIsLoading(false);
     });
  }, [store.currentUser, navigate]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    const success = store.login(username, password);
    if (success) {
      const user = useStore.getState().currentUser;
      if (user?.role === 'Admin') {
        // Fallback for admins mistakenly logging in here
        navigate('/admin', { replace: true });
      } else {
        navigate('/vendor/pos', { replace: true });
      }
    } else {
      setError('Credenciales incorrectas o cuenta inactiva.');
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-slate-900 justify-center items-center text-white pb-10">
      
      <div className="mb-10 text-center flex flex-col items-center">
         <div className="w-20 h-20 bg-teal-500 rounded-full flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(20,184,166,0.5)]">
            <Lock size={40} className="text-white" />
         </div>
         <h1 
           className="text-3xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-300 drop-shadow-sm select-none cursor-pointer"
           onDoubleClick={() => navigate('/admin/login')}
           title="Punto de Venta"
         >
           GO
         </h1>
         <p className="text-gray-400 text-sm mt-1 tracking-widest font-bold">PUNTO DE VENTA</p>
      </div>

      <div className="bg-slate-800 p-6 rounded-2xl shadow-xl w-[90%] max-w-[340px] border border-slate-700">
        
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
           
           <div>
             <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wide">Usuario</label>
             <input 
               type="text" 
               value={username}
               onChange={(e) => setUsername(e.target.value)}
               className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 h-[55px] text-lg font-bold text-white focus:outline-none focus:border-teal-400 transition-colors"
               placeholder="Tu usuario"
               required
               autoComplete="off"
               autoCapitalize="off"
               autoCorrect="off"
             />
           </div>

           <div>
             <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wide">Contraseña</label>
             <input 
               type="password" 
               value={password}
               onChange={(e) => setPassword(e.target.value)}
               className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 h-[55px] text-lg font-bold text-white focus:outline-none focus:border-teal-400 transition-colors tracking-[0.3em]"
               placeholder="••••••••"
               required
             />
           </div>

           {error && (
             <p className="text-center text-sm font-bold text-red-400 mt-2">{error}</p>
           )}

           <button 
             type="submit"
             disabled={!username || !password || isLoading}
             className="w-full mt-4 bg-teal-600 disabled:bg-teal-900/50 disabled:text-teal-800 active:bg-teal-500 text-white font-bold py-4 rounded-xl text-lg uppercase tracking-wider transition-all flex justify-center items-center"
           >
             {isLoading ? <Lock className="animate-pulse" /> : 'Entrar'}
           </button>

        </form>

      </div>
    </div>
  );
}
