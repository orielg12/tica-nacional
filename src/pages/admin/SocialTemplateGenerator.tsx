import { useRef, useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { supabase } from '../../utils/supabase';
import { formatLotteryTime } from '../../utils/lotteryRules';
import { getPanamaLocalISODate } from '../../utils/dateUtils';
import { Download, Film, Sparkles, Share2, Eye } from 'lucide-react';

interface TemplateConfig {
  key: string;
  name: string;
  image: string;
  header: {
    xDraw?: number; // X para hora (default: centrado 819/2)
    yDraw: number;  // Y para nombre de sorteo y hora
    xDate?: number; // X para fecha (default: centrado 819/2)
    yDate: number;  // Y para fecha
    fontSizeDraw: number;
    fontSizeDate: number;
    color: string;
    drawTextTransform?: 'uppercase' | 'none';
  };
  boxes: Array<{
    centerX: number;
    centerY: number;
  }>;
}

const TEMPLATES: Record<string, TemplateConfig> = {
  nica: {
    key: 'nica',
    name: 'Nicaragua',
    image: '/templates/nica.png',
    header: {
      yDraw: 320,
      yDate: 368,
      fontSizeDraw: 40,
      fontSizeDate: 30,
      color: '#000000'
    },
    boxes: [
      { centerX: 413, centerY: 473 },
      { centerX: 413, centerY: 636 },
      { centerX: 413, centerY: 799 }
    ]
  },
  monazo: {
    key: 'monazo',
    name: 'Monazo',
    image: '/templates/monazo.png',
    header: {
      yDraw: 290,
      yDate: 342,
      fontSizeDraw: 40,
      fontSizeDate: 30,
      color: '#000000',
      drawTextTransform: 'uppercase'
    },
    boxes: [
      { centerX: 426, centerY: 515 },
      { centerX: 426, centerY: 681 },
      { centerX: 426, centerY: 830 }
    ]
  },
  florida: {
    key: 'florida',
    name: 'Florida',
    image: '/templates/florida.png',
    header: {
      yDraw: 290,
      yDate: 342,
      fontSizeDraw: 40,
      fontSizeDate: 30,
      color: '#000000',
      drawTextTransform: 'uppercase'
    },
    boxes: [
      { centerX: 427, centerY: 515 },
      { centerX: 427, centerY: 681 },
      { centerX: 427, centerY: 835 }
    ]
  },
  newyork: {
    key: 'newyork',
    name: 'New York',
    image: '/templates/newyork.png',
    header: {
      yDraw: 326,
      yDate: 368,
      fontSizeDraw: 38,
      fontSizeDate: 30,
      color: '#000000'
    },
    boxes: [
      { centerX: 413, centerY: 460 },
      { centerX: 413, centerY: 636 },
      { centerX: 413, centerY: 799 }
    ]
  },
  primera: {
    key: 'primera',
    name: 'La Primera',
    image: '/templates/primera.png',
    header: {
      xDraw: 665,
      yDraw: 235,
      fontSizeDraw: 42,
      xDate: 410,
      yDate: 335,
      fontSizeDate: 34,
      color: '#000000'
    },
    boxes: [
      { centerX: 410, centerY: 494 },
      { centerX: 410, centerY: 641 },
      { centerX: 410, centerY: 789 }
    ]
  },
  tica: {
    key: 'tica',
    name: 'Costa Rica / Tica',
    image: '/templates/tica.png',
    header: {
      yDraw: 290,
      yDate: 342,
      fontSizeDraw: 40,
      fontSizeDate: 30,
      color: '#000000',
      drawTextTransform: 'uppercase'
    },
    boxes: [
      { centerX: 427, centerY: 515 },
      { centerX: 427, centerY: 681 },
      { centerX: 427, centerY: 835 }
    ]
  },
  honduras: {
    key: 'honduras',
    name: 'Honduras',
    image: '/templates/honduras.png',
    header: {
      yDraw: 330,
      yDate: 374,
      fontSizeDraw: 38,
      fontSizeDate: 30,
      color: '#000000'
    },
    boxes: [
      { centerX: 414, centerY: 473 },
      { centerX: 414, centerY: 636 },
      { centerX: 414, centerY: 799 }
    ]
  },
  anguilla: {
    key: 'anguilla',
    name: 'Anguilla',
    image: '/templates/anguilla.png',
    header: {
      yDraw: 330,
      yDate: 380,
      fontSizeDraw: 40,
      fontSizeDate: 30,
      color: '#000000',
      drawTextTransform: 'uppercase'
    },
    boxes: [
      { centerX: 411, centerY: 494 },
      { centerX: 411, centerY: 646 },
      { centerX: 411, centerY: 799 }
    ]
  }
};

export default function SocialTemplateGenerator() {
  const store = useStore();
  const [selectedLotteryId, setSelectedLotteryId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(() => getPanamaLocalISODate());
  const [firstNum, setFirstNum] = useState('');
  const [secondNum, setSecondNum] = useState('');
  const [thirdNum, setThirdNum] = useState('');
  const [updateHeader, setUpdateHeader] = useState(true);
  const [customDrawTitle, setCustomDrawTitle] = useState('');
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);

  // Detección reactiva de modo oscuro para VendorLayout y AdminLayout
  const [isDark, setIsDark] = useState(() => {
    if (typeof document !== 'undefined') {
      const themeAttr = document.documentElement.getAttribute('data-theme');
      if (themeAttr) return themeAttr === 'dark';
      if (document.body.classList.contains('dark')) return true;
    }
    const saved = localStorage.getItem('go-theme');
    if (saved) return saved === 'dark';
    return false;
  });

  useEffect(() => {
    const checkTheme = () => {
      const isDarkNow = document.documentElement.getAttribute('data-theme') === 'dark' || document.body.classList.contains('dark');
      setIsDark(isDarkNow);
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Filtrar loterías relevantes que tienen plantilla
  const supportedLotteries = store.lotteriesMaster.filter(l => {
    const id = l.id.toLowerCase();
    const name = l.name.toLowerCase();
    return id.includes('tica') || id.includes('costa') || name.includes('tica') ||
           id.includes('nica') || id.includes('monazo') || id.includes('honduras') ||
           id.includes('newyork') || id.includes('florida') || id.includes('anguilla') ||
           id.includes('primera') || name.includes('primera');
  });

  // Auto-seleccionar la primera al cargar
  useEffect(() => {
    if (!selectedLotteryId && supportedLotteries.length > 0) {
      setSelectedLotteryId(supportedLotteries[0].id);
    }
  }, [supportedLotteries, selectedLotteryId]);

  // Cargar números ganadores automáticamente desde Supabase y Store
  useEffect(() => {
    if (!selectedLotteryId) return;
    let isMounted = true;

    // 1. Revisar memoria local primero
    const local = store.results.find(
      r => (r.lotteryId === selectedLotteryId || (r as any).draw_id === selectedLotteryId) && r.date === selectedDate
    );
    if (local && local.winning_number) {
      const parts = local.winning_number.split('-');
      setFirstNum(parts[0] || '');
      setSecondNum(parts[1] || '');
      setThirdNum(parts[2] || '');
      return;
    }

    // 2. Si no está en memoria, consultar a Supabase en la nube
    async function fetchFromSupabase() {
      try {
        const { data } = await supabase
          .from('results')
          .select('winning_number')
          .eq('draw_id', selectedLotteryId)
          .eq('date', selectedDate)
          .maybeSingle();

        if (isMounted) {
          if (data && data.winning_number) {
            const parts = data.winning_number.split('-');
            setFirstNum(parts[0] || '');
            setSecondNum(parts[1] || '');
            setThirdNum(parts[2] || '');
          } else {
            setFirstNum('');
            setSecondNum('');
            setThirdNum('');
          }
        }
      } catch (err) {
        console.error('Error fetching result from Supabase:', err);
      }
    }

    fetchFromSupabase();
    return () => { isMounted = false; };
  }, [selectedLotteryId, selectedDate, store.results]);

  // Detectar la plantilla correspondiente según el id del sorteo
  const getTemplateKey = (drawId: string): string => {
    const id = drawId.toLowerCase();
    if (id.includes('tica') || id.includes('costa')) return 'tica';
    if (id.includes('monazo')) return 'monazo';
    if (id.includes('nica')) return 'nica';
    if (id.includes('honduras')) return 'honduras';
    if (id.includes('newyork')) return 'newyork';
    if (id.includes('florida')) return 'florida';
    if (id.includes('anguilla')) return 'anguilla';
    if (id.includes('primera')) return 'primera';
    return 'nica';
  };

  const currentTemplate = TEMPLATES[getTemplateKey(selectedLotteryId)] || TEMPLATES.nica;
  const currentLottery = store.lotteriesMaster.find(l => l.id === selectedLotteryId);

  // Formato de fecha larga en español: "15 de octubre de 2026"
  const formatLongDate = (isoDate: string): string => {
    try {
      const [y, m, d] = isoDate.split('-').map(Number);
      const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      return `${d} de ${meses[m - 1]} de ${y}`;
    } catch {
      return isoDate;
    }
  };

  // Texto de título del sorteo + hora (ej: "TICA 8:30PM", "Nica 12:00 pm", "MONAZO 2:00PM")
  const getDrawTitleText = (): string => {
    if (!currentLottery) return '';
    const timeStr = formatLotteryTime(currentLottery.hour, currentLottery.minute);
    const key = getTemplateKey(selectedLotteryId);

    if (key === 'tica') return `TICA ${timeStr.replace(' ', '')}`;
    if (key === 'nica') return `Nica ${timeStr.toLowerCase()}`;
    if (key === 'monazo') return `MONAZO ${timeStr.replace(' ', '')}`;
    if (key === 'honduras') return `HONDURAS ${timeStr.toLowerCase()}`;
    if (key === 'newyork') return `NEW YORK  ${timeStr.toLowerCase()}`;
    if (key === 'florida') return `FLORIDA ${timeStr.replace(' ', '')}`;
    if (key === 'anguilla') return `ANGUILLA ${timeStr.toUpperCase()}`;
    if (key === 'primera') {
      const h = currentLottery.hour % 12 || 12;
      const ampm = currentLottery.hour >= 12 ? 'PM' : 'AM';
      return currentLottery.minute === 0 ? `${h} ${ampm}` : timeStr;
    }
    return `${currentLottery.name} ${timeStr}`;
  };

  // Dibujar Canvas sobre la plantilla nítida de Canva
  const drawCanvas = (revealStep: number = 3) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.src = currentTemplate.image;
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      canvas.width = 819;
      canvas.height = 1024;

      // 1. Dibujar plantilla original limpia exportada de Canva
      ctx.drawImage(img, 0, 0, 819, 1024);

      // 2. Dibujar título del sorteo con hora (ej. Nica 12:00 pm, FLORIDA 12:30PM)
      if (updateHeader) {
        const drawTitle = (customDrawTitle.trim() || getDrawTitleText());
        const xDraw = currentTemplate.header.xDraw ?? (819 / 2);
        const xDate = currentTemplate.header.xDate ?? (819 / 2);

        ctx.font = `900 ${currentTemplate.header.fontSizeDraw}px "Arial Black", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = currentTemplate.header.color;
        ctx.fillText(
          currentTemplate.header.drawTextTransform === 'uppercase' ? drawTitle.toUpperCase() : drawTitle,
          xDraw,
          currentTemplate.header.yDraw
        );

        // 3. Dibujar fecha larga (ej. 16 de octubre de 2026)
        ctx.font = `700 ${currentTemplate.header.fontSizeDate}px Arial, sans-serif`;
        ctx.fillStyle = currentTemplate.header.color;
        ctx.fillText(formatLongDate(selectedDate), xDate, currentTemplate.header.yDate);
      }

      // 4. Dibujar números ganadores perfectamente centrados dentro de las cajas
      const nums = [firstNum, secondNum, thirdNum];

      currentTemplate.boxes.forEach((box, idx) => {
        if (idx < revealStep && nums[idx]) {
          const val = nums[idx];
          ctx.font = '900 86px "Arial Black", Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          // Sombra suave en el texto para máxima profundidad
          ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
          ctx.fillText(val, box.centerX + 2, box.centerY + 4);

          // Texto negro nítido
          ctx.fillStyle = '#000000';
          ctx.fillText(val, box.centerX, box.centerY);
        }
      });
    };
  };

  useEffect(() => {
    drawCanvas(3);
  }, [selectedLotteryId, selectedDate, firstNum, secondNum, thirdNum, updateHeader, customDrawTitle]);

  // Descargar Imagen en HD (PNG)
  const handleDownloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    const lotName = currentLottery ? currentLottery.name.toLowerCase().replace(/\s+/g, '-') : 'sorteo';
    link.download = `resultado-${lotName}-${selectedDate}.png`;
    link.href = canvas.toDataURL('image/png', 1.0);
    link.click();
  };

  // Compartir Imagen nativa en móvil (WhatsApp / Redes)
  const handleShareNative = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], `resultado-${selectedDate}.png`, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `Resultados ${currentLottery?.name || ''}`,
            text: `Resultados oficiales de ${currentLottery?.name || ''} - ${selectedDate}`,
            files: [file]
          });
        } else {
          handleDownloadImage();
        }
      }, 'image/png');
    } catch (e) {
      handleDownloadImage();
    }
  };

  // Generar Video Reel (MP4 / WebM de 5 segundos con animación de revelación)
  const handleGenerateReel = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (typeof MediaRecorder === 'undefined') {
      alert('Tu navegador no soporta MediaRecorder para grabar video directamente. Te sugerimos descargar la imagen.');
      return;
    }

    setIsGeneratingVideo(true);
    setVideoProgress(10);

    const stream = canvas.captureStream(30);
    const mime = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mime });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const lotName = currentLottery ? currentLottery.name.toLowerCase().replace(/\s+/g, '-') : 'sorteo';
      link.download = `reel-${lotName}-${selectedDate}.${mime === 'video/mp4' ? 'mp4' : 'webm'}`;
      link.href = url;
      link.click();
      setIsGeneratingVideo(false);
      setVideoProgress(0);
      drawCanvas(3); // restaurar completo
    };

    recorder.start();

    // Animación de 5 segundos:
    // Seg 0.0 - 1.2: Aparece 1er premio
    // Seg 1.2 - 2.4: Aparece 2do premio
    // Seg 2.4 - 5.0: Aparece 3er premio completo (pausa final)
    drawCanvas(1);
    setVideoProgress(30);

    setTimeout(() => {
      drawCanvas(2);
      setVideoProgress(60);
    }, 1200);

    setTimeout(() => {
      drawCanvas(3);
      setVideoProgress(90);
    }, 2400);

    setTimeout(() => {
      recorder.stop();
    }, 5000);
  };

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        padding: '1.25rem',
        paddingBottom: '6rem',
        maxWidth: '1200px',
        margin: '0 auto',
        boxSizing: 'border-box'
      }}
    >
      {/* Título y Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem', color: isDark ? '#f8fafc' : '#0f172a', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Sparkles size={26} color="#eab308" /> Generador de Plantillas y Reels
          </h1>
          <p style={{ margin: '0.2rem 0 0', color: isDark ? '#94a3b8' : '#64748b', fontSize: '0.9rem' }}>
            Genera imágenes y videos de 5 segundos listos para Instagram Reels y Canales de WhatsApp en 1 clic.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* PANEL DE CONTROL / AJUSTES */}
        <div style={{
          background: isDark ? '#1e293b' : '#ffffff',
          padding: '1.5rem',
          borderRadius: '14px',
          border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
          boxShadow: isDark ? '0 10px 25px -5px rgba(0,0,0,0.5)' : '0 4px 6px rgba(0,0,0,0.03)'
        }}>
          <h3 style={{ margin: '0 0 1.2rem', color: isDark ? '#f1f5f9' : '#0f172a', fontSize: '1.1rem', fontWeight: 800 }}>
            ⚙️ Datos del Sorteo
          </h3>

          {/* Sorteo */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: isDark ? '#cbd5e1' : '#475569', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Selecciona el Sorteo
            </label>
            <select
              value={selectedLotteryId}
              onChange={(e) => setSelectedLotteryId(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: isDark ? '1.5px solid #475569' : '1.5px solid #cbd5e1',
                outline: 'none',
                background: isDark ? '#0f172a' : '#f8fafc',
                color: isDark ? '#f8fafc' : '#0f172a',
                fontWeight: 'bold',
                fontSize: '0.95rem'
              }}
            >
              {supportedLotteries.map(l => (
                <option key={l.id} value={l.id} style={{ background: isDark ? '#0f172a' : '#ffffff', color: isDark ? '#f8fafc' : '#0f172a' }}>
                  {l.name} - {formatLotteryTime(l.hour, l.minute)}
                </option>
              ))}
            </select>
          </div>

          {/* Fecha */}
          <div style={{ marginBottom: '1.2rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: isDark ? '#cbd5e1' : '#475569', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Fecha del Resultado
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: isDark ? '1.5px solid #475569' : '1.5px solid #cbd5e1',
                outline: 'none',
                background: isDark ? '#0f172a' : '#f8fafc',
                color: isDark ? '#f8fafc' : '#0f172a',
                colorScheme: isDark ? 'dark' : 'light',
                fontWeight: 'bold'
              }}
            />
          </div>

          {/* 3 Números Ganadores */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: isDark ? '#cbd5e1' : '#475569', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Números Ganadores (1er, 2do y 3er Premio)
            </label>
            <div style={{ display: 'flex', gap: '0.6rem', width: '100%', boxSizing: 'border-box' }}>
              <input
                type="text"
                maxLength={2}
                value={firstNum}
                onChange={(e) => setFirstNum(e.target.value.replace(/\D/g, ''))}
                placeholder="1er"
                style={{
                  flex: 1,
                  minWidth: 0,
                  boxSizing: 'border-box',
                  padding: '0.8rem 0.2rem',
                  fontSize: '1.4rem',
                  fontWeight: '900',
                  textAlign: 'center',
                  borderRadius: '8px',
                  border: '2px solid #eab308',
                  background: isDark ? '#291b00' : '#fefce8',
                  color: isDark ? '#fef08a' : '#000000',
                  outline: 'none'
                }}
              />
              <input
                type="text"
                maxLength={2}
                value={secondNum}
                onChange={(e) => setSecondNum(e.target.value.replace(/\D/g, ''))}
                placeholder="2do"
                style={{
                  flex: 1,
                  minWidth: 0,
                  boxSizing: 'border-box',
                  padding: '0.8rem 0.2rem',
                  fontSize: '1.4rem',
                  fontWeight: '900',
                  textAlign: 'center',
                  borderRadius: '8px',
                  border: '2px solid #eab308',
                  background: isDark ? '#291b00' : '#fefce8',
                  color: isDark ? '#fef08a' : '#000000',
                  outline: 'none'
                }}
              />
              <input
                type="text"
                maxLength={2}
                value={thirdNum}
                onChange={(e) => setThirdNum(e.target.value.replace(/\D/g, ''))}
                placeholder="3er"
                style={{
                  flex: 1,
                  minWidth: 0,
                  boxSizing: 'border-box',
                  padding: '0.8rem 0.2rem',
                  fontSize: '1.4rem',
                  fontWeight: '900',
                  textAlign: 'center',
                  borderRadius: '8px',
                  border: '2px solid #eab308',
                  background: isDark ? '#291b00' : '#fefce8',
                  color: isDark ? '#fef08a' : '#000000',
                  outline: 'none'
                }}
              />
            </div>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: isDark ? '#94a3b8' : '#64748b' }}>
              * Si el sorteo ya se guardó en el sistema, los números se colocan automáticamente.
            </p>
          </div>

          {/* Opción de actualizar Fecha y Hora en la imagen */}
          <div style={{
            marginBottom: '1.4rem',
            background: isDark ? '#0f172a' : '#f8fafc',
            padding: '0.9rem',
            borderRadius: '10px',
            border: isDark ? '1px solid #334155' : '1px solid #e2e8f0'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', color: isDark ? '#f8fafc' : '#1e293b' }}>
              <input
                type="checkbox"
                checked={updateHeader}
                onChange={(e) => setUpdateHeader(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: '#0f766e', cursor: 'pointer' }}
              />
              Actualizar Fecha y Hora en la imagen
            </label>
            {updateHeader && (
              <div style={{ marginTop: '0.7rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <input
                  type="text"
                  placeholder={`Título/Hora: ej. ${getDrawTitleText()}`}
                  value={customDrawTitle}
                  onChange={(e) => setCustomDrawTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: isDark ? '1px solid #475569' : '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    background: isDark ? '#1e293b' : '#ffffff',
                    color: isDark ? '#ffffff' : '#0f172a'
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                  Fecha calculada: <strong style={{ color: isDark ? '#38bdf8' : '#0284c7' }}>{formatLongDate(selectedDate)}</strong>
                </span>
              </div>
            )}
          </div>

          {/* BOTONES DE ACCIÓN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <button
              onClick={handleDownloadImage}
              style={{
                width: '100%',
                padding: '0.9rem',
                background: '#0f766e',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 'bold',
                fontSize: '0.95rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.6rem',
                boxShadow: '0 4px 6px rgba(15,118,110,0.2)'
              }}
            >
              <Download size={18} /> Descargar Imagen HD (1080×1350)
            </button>

            <button
              onClick={handleGenerateReel}
              disabled={isGeneratingVideo}
              style={{
                width: '100%',
                padding: '0.9rem',
                background: isGeneratingVideo ? '#64748b' : '#e11d48',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 'bold',
                fontSize: '0.95rem',
                cursor: isGeneratingVideo ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.6rem',
                boxShadow: '0 4px 6px rgba(225,29,72,0.2)'
              }}
            >
              <Film size={18} /> {isGeneratingVideo ? `Grabando Reel (${videoProgress}%)...` : '🎬 Descargar Reel MP4 (Video 5s)'}
            </button>

            <button
              onClick={handleShareNative}
              style={{
                width: '100%',
                padding: '0.85rem',
                background: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 'bold',
                fontSize: '0.95rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.6rem'
              }}
            >
              <Share2 size={18} /> Compartir en WhatsApp / Redes
            </button>
          </div>
        </div>

        {/* VISTA PREVIA DEL LIENZO */}
        <div style={{
          background: isDark ? '#1e293b' : '#ffffff',
          padding: '1.5rem',
          borderRadius: '14px',
          border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
          boxShadow: isDark ? '0 10px 25px -5px rgba(0,0,0,0.5)' : '0 4px 6px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '1rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: isDark ? '#cbd5e1' : '#475569', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Eye size={16} /> Vista Previa en Vivo:
            </span>
            <span style={{
              fontSize: '0.75rem',
              color: isDark ? '#6ee7b7' : '#10b981',
              fontWeight: 'bold',
              background: isDark ? '#064e3b' : '#ecfdf5',
              padding: '0.2rem 0.5rem',
              borderRadius: '4px'
            }}>
              819 × 1024 px
            </span>
          </div>

          <div style={{
            width: '100%',
            maxWidth: '380px',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: isDark ? '0 10px 25px -5px rgba(0,0,0,0.6)' : '0 10px 25px -5px rgba(0,0,0,0.15)',
            border: isDark ? '1px solid #475569' : '1px solid #cbd5e1'
          }}>
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
