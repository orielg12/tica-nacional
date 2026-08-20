import { useState } from 'react';
import { formatLotteryTime, type LotteryDay } from '../../utils/lotteryRules';
import { useStore } from '../../store/useStore';
import { Trash2, Plus, Edit2, Save, X } from 'lucide-react';

const ALL_DAYS: LotteryDay[] = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export default function LotteryManager() {
  const store = useStore();
  const lotteries = store.lotteriesMaster;
  const isSuperAdmin = !store.currentUser?.isSubAdmin;
  const canManageLotteries = isSuperAdmin || store.currentUser?.allowManageLotteries === true;

  // Form state
  const [newName, setNewName] = useState('');
  const [newTime, setNewTime] = useState(''); // HH:MM
  const [selectedDays, setSelectedDays] = useState<LotteryDay[]>([]);
  const [closeMinutes, setCloseMinutes] = useState(10);
  const [editingId, setEditingId] = useState<string | null>(null);

  if (!canManageLotteries) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', backgroundColor: '#f4f7f6', minHeight: '100%' }}>
        <div style={{ backgroundColor: '#fff', padding: '2.5rem', borderRadius: '12px', maxWidth: '500px', margin: '0 auto', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ color: '#dc3545', marginBottom: '1rem', fontSize: '1.2rem' }}>⛔ Acceso Restringido</h3>
          <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: '1.5' }}>
            No tienes permisos para crear o modificar sorteos. Esta función solo puede ser habilitada por el <strong>Administrador Principal</strong>.
          </p>
        </div>
      </div>
    );
  }

  const toggle = (id: string) => {
    store.toggleMasterLottery(id);
  };

  const remove = (id: string) => {
    if (window.confirm("¿Estás seguro de eliminar este sorteo?")) {
      store.deleteMasterLottery(id);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newTime) {
      alert('Nombre y hora son obligatorios');
      return;
    }
    
    const [h, m] = newTime.split(':').map(Number);
    const newDays = selectedDays.length > 0 && selectedDays.length < 7 ? selectedDays : undefined;

    if (editingId) {
      const success = await store.editMasterLottery(editingId, {
        name: newName,
        hour: h,
        minute: m,
        days: newDays,
        closeMinutes: closeMinutes
      });
      if (success) {
        setNewName('');
        setNewTime('');
        setSelectedDays([]);
        setCloseMinutes(10);
        setEditingId(null);
        alert('Sorteo actualizado exitosamente');
      }
      return;
    }
    const newId = `${h}${m}-${newName.toLowerCase().replace(/\s+/g, '')}`;

    if (lotteries.some(l => l.id === newId)) {
      alert('Ya existe un sorteo con este nombre y hora.');
      return;
    }

    const success = await store.addMasterLottery({
      id: newId,
      name: newName,
      hour: h,
      minute: m,
      isActive: true,
      days: newDays,
      closeMinutes: closeMinutes
    });

    if (success) {
      setNewName('');
      setNewTime('');
      setSelectedDays([]);
      setCloseMinutes(10);
      alert('Sorteo creado exitosamente');
    }
  };

  const toggleDay = (day: LotteryDay) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter(d => d !== day));
    } else {
      setSelectedDays([...selectedDays, day]);
    }
  };

  const handleEdit = (lottery: any) => {
    setEditingId(lottery.id);
    setNewName(lottery.name);
    setNewTime(`${lottery.hour.toString().padStart(2, '0')}:${lottery.minute.toString().padStart(2, '0')}`);
    setSelectedDays(lottery.days || []);
    setCloseMinutes(lottery.closeMinutes ?? 10);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setNewName('');
    setNewTime('');
    setSelectedDays([]);
    setCloseMinutes(10);
  };

  return (
    <div className="container" style={{ padding: 'var(--spacing-md)' }}>
      <h2>Gestor de Sorteos (Loterías)</h2>
      <p className="text-secondary" style={{ marginBottom: 'var(--spacing-md)' }}>
        Crea, habilita o elimina sorteos. El cierre se configura por sorteo.
      </p>

      {/* Nuevo/Editar Sorteo Form */}
      <div className="surface" style={{ padding: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>{editingId ? 'Editar Sorteo' : 'Agregar Nuevo Sorteo'}</h3>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="text-secondary hover:text-white" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={20} />
            </button>
          )}
        </div>
        <form onSubmit={handleAdd} className="flex-col" style={{ gap: '1rem' }}>
          <div className="flex" style={{ gap: '1rem', flexWrap: 'wrap' }}>
            <div className="flex-col" style={{ flex: 1, minWidth: '200px' }}>
              <label className="text-secondary" style={{ fontSize: '0.85rem', marginBottom: '0.3rem' }}>Nombre del Sorteo</label>
              <input 
                type="text" 
                value={newName} 
                onChange={e => setNewName(e.target.value)}
                placeholder="Ej. Sorteo Extra"
                style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #334155', background: '#1e293b', color: 'white' }}
              />
            </div>
            <div className="flex-col" style={{ width: '120px' }}>
              <label className="text-secondary" style={{ fontSize: '0.85rem', marginBottom: '0.3rem' }}>Hora (24h)</label>
              <input 
                type="time" 
                value={newTime} 
                onChange={e => setNewTime(e.target.value)}
                style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #334155', background: '#1e293b', color: 'white' }}
              />
            </div>
            <div className="flex-col" style={{ width: '120px' }}>
              <label className="text-secondary" style={{ fontSize: '0.85rem', marginBottom: '0.3rem' }}>Cierre (min)</label>
              <input 
                type="number" 
                value={closeMinutes} 
                onChange={e => setCloseMinutes(parseInt(e.target.value) || 0)}
                min={0}
                max={60}
                style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #334155', background: '#1e293b', color: 'white' }}
              />
            </div>
          </div>
          
          <div className="flex-col">
             <label className="text-secondary" style={{ fontSize: '0.85rem', marginBottom: '0.3rem' }}>Días que juega (Dejar vacío para TODOS LOS DÍAS)</label>
             <div className="flex" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
               {ALL_DAYS.map(day => (
                 <button 
                   key={day}
                   type="button"
                   onClick={() => toggleDay(day)}
                   className={`btn ${selectedDays.includes(day) ? 'btn-primary' : ''}`}
                   style={{ 
                     padding: '0.3rem 0.6rem', 
                     fontSize: '0.8rem',
                     background: selectedDays.includes(day) ? '' : '#1e293b',
                     border: selectedDays.includes(day) ? 'none' : '1px solid #334155',
                     color: selectedDays.includes(day) ? 'white' : '#94a3b8'
                   }}
                 >
                   {day.substring(0,3)}
                 </button>
               ))}
             </div>
          </div>

          <button type="submit" className={`btn flex justify-center items-center ${editingId ? 'bg-amber-600 hover:bg-amber-500' : 'btn-primary'}`} style={{ gap: '0.5rem', marginTop: '0.5rem', color: 'white' }}>
             {editingId ? <><Save size={16} /> Guardar Cambios</> : <><Plus size={16} /> Crear Sorteo</>}
          </button>
        </form>
      </div>

      {/* Lista de Sorteos */}
      <div className="surface" style={{ padding: 'var(--spacing-md)' }}>
        {lotteries.map(l => (
          <div key={l.id} className="flex justify-between items-center" style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex-col">
               <span className="text-active">{l.name}</span>
               <span className="text-secondary" style={{ fontSize: '0.85rem' }}>{formatLotteryTime(l.hour, l.minute)} {l.days ? `- Solo ${l.days.join(', ')}` : ''} — Cierra {l.closeMinutes ?? 10} min antes</span>
            </div>
            
            <div className="flex" style={{ gap: '0.5rem', alignItems: 'center' }}>
              <button 
                onClick={() => toggle(l.id)}
                className={`btn ${l.isActive ? 'btn-primary' : 'btn-danger'}`}
                style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', minWidth: '100px' }}
              >
                {l.isActive ? 'Activa' : 'Deshabilitada'}
              </button>
              
              <button
                onClick={() => handleEdit(l)}
                className="btn"
                style={{ padding: '0.4rem', background: '#3b82f6', color: '#fff' }}
                title="Editar Sorteo"
              >
                <Edit2 size={16} />
              </button>

              <button
                onClick={() => remove(l.id)}
                className="btn btn-danger"
                style={{ padding: '0.4rem', background: '#450a0a', color: '#f87171' }}
                title="Eliminar Sorteo"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {lotteries.length === 0 && (
          <p className="text-secondary text-center">No hay sorteos configurados.</p>
        )}
      </div>
    </div>
  );
}
