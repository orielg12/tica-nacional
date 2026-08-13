import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { Shield } from 'lucide-react';

export default function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const store = useStore();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
     if (store.currentUser?.role === 'Admin') {
        navigate('/admin', { replace: true });
        return;
     }
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
        navigate('/admin', { replace: true });
      } else {
        setError('No tienes permisos de Administrador.');
        store.logout();
      }
    } else {
      setError('Credenciales incorrectas o cuenta inactiva.');
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-[#17233D] justify-center items-center text-white pb-10 font-sans">
      
      <div className="mb-8 text-center flex flex-col items-center">
         <div className="w-16 h-16 bg-[#3399ff] rounded-2xl flex items-center justify-center mb-4 shadow-[0_4px_20px_rgba(51,153,255,0.4)]">
            <Shield size={32} className="text-white" />
         </div>
         <h1 className="text-2xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-[#3399ff]">
           GO
         </h1>
         <p className="text-gray-400 text-xs mt-2 tracking-widest font-bold uppercase">Portal Administrativo</p>
      </div>

      <div className="bg-[#1e2b48] p-8 rounded-2xl shadow-2xl w-[90%] max-w-[380px] border border-blue-900/30">
        
        <form onSubmit={handleLogin} className="flex flex-col gap-5">
           
           <div>
             <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wide">Usuario Administrador</label>
             <input 
               type="text" 
               value={username}
               onChange={(e) => setUsername(e.target.value)}
               className="w-full bg-[#111a2f] border border-[#2a3f66] rounded-xl p-3 text-white focus:outline-none focus:border-[#3399ff] transition-colors"
               placeholder="ej. admin"
               required
               autoComplete="off"
             />
           </div>

           <div>
             <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wide">Contraseña Segura</label>
             <input 
               type="password" 
               value={password}
               onChange={(e) => setPassword(e.target.value)}
               className="w-full bg-[#111a2f] border border-[#2a3f66] rounded-xl p-3 text-white focus:outline-none focus:border-[#3399ff] transition-colors"
               placeholder="••••••••"
               required
             />
           </div>

           {error && (
             <p className="text-center text-sm font-bold text-red-400 animate-pulse mt-2">{error}</p>
           )}

           <button 
             type="submit"
             disabled={!username || !password || isLoading}
             className="w-full mt-2 bg-[#3399ff] hover:bg-blue-500 disabled:bg-blue-900/50 disabled:text-blue-800 active:bg-blue-600 text-white font-bold py-4 rounded-xl text-sm uppercase tracking-widest transition-all shadow-lg"
           >
             {isLoading ? 'Cargando...' : 'Ingresar al Panel'}
           </button>

        </form>

      </div>
    </div>
  );
}
