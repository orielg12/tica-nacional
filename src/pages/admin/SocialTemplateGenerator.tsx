import { useRef, useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { formatLotteryTime } from '../../utils/lotteryRules';
import { getPanamaLocalISODate } from '../../utils/dateUtils';
import { Download, Film, Sparkles, Share2, Eye } from 'lucide-react';

interface TemplateConfig {
  key: string;
  name: string;
  image: string;
  boxColor: string; // color de fondo de las 3 cajas
  boxBorder: 'dashed' | 'solid' | 'none';
  boxBorderColor: string;
  // Posiciones relativas en base a 819 x 1024
  header: {
    yDraw: number; // Y para nombre de sorteo y hora
    yDate: number; // Y para fecha
    fontSizeDraw: number;
    fontSizeDate: number;
    color: string;
    drawTextTransform?: 'uppercase' | 'none';
  };
  headerCover?: {
    x: number;
    y: number;
    w: number;
    h: number;
    mode: 'sampleX' | 'sampleY' | 'solid';
    samplePos?: number;
    solidColor?: string;
  };
  boxes: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    radius?: number;
  }>;
}

const TEMPLATES: Record<string, TemplateConfig> = {
  tica: {
    key: 'tica',
    name: 'Costa Rica / Tica',
    image: '/templates/tica.png',
    boxColor: '#88cf6e',
    boxBorder: 'dashed',
    boxBorderColor: '#1e3a12',
    header: {
      yDraw: 254,
      yDate: 326,
      fontSizeDraw: 42,
      fontSizeDate: 26,
      color: '#000000',
      drawTextTransform: 'uppercase'
    },
    headerCover: {
      x: 160,
      y: 220,
      w: 500,
      h: 130,
      mode: 'sampleX',
      samplePos: 700
    },
    boxes: [
      { x: 308, y: 445, w: 238, h: 114, radius: 4 },
      { x: 308, y: 606, w: 238, h: 114, radius: 4 },
      { x: 308, y: 751, w: 238, h: 114, radius: 4 }
    ]
  },
  nica: {
    key: 'nica',
    name: 'Nicaragua',
    image: '/templates/nica.png',
    boxColor: '#ffe500',
    boxBorder: 'dashed',
    boxBorderColor: '#000000',
    header: {
      yDraw: 298,
      yDate: 360,
      fontSizeDraw: 44,
      fontSizeDate: 26,
      color: '#000000'
    },
    headerCover: {
      x: 150,
      y: 265,
      w: 520,
      h: 125,
      mode: 'sampleX',
      samplePos: 700
    },
    boxes: [
      { x: 292, y: 405, w: 246, h: 120, radius: 4 },
      { x: 292, y: 562, w: 246, h: 120, radius: 4 },
      { x: 292, y: 720, w: 246, h: 120, radius: 4 }
    ]
  },
  monazo: {
    key: 'monazo',
    name: 'Monazo',
    image: '/templates/monazo.png',
    boxColor: '#88cf6e',
    boxBorder: 'dashed',
    boxBorderColor: '#1e3a12',
    header: {
      yDraw: 254,
      yDate: 326,
      fontSizeDraw: 42,
      fontSizeDate: 26,
      color: '#000000',
      drawTextTransform: 'uppercase'
    },
    headerCover: {
      x: 160,
      y: 220,
      w: 500,
      h: 130,
      mode: 'sampleX',
      samplePos: 700
    },
    boxes: [
      { x: 308, y: 445, w: 238, h: 114, radius: 4 },
      { x: 308, y: 606, w: 238, h: 114, radius: 4 },
      { x: 308, y: 751, w: 238, h: 114, radius: 4 }
    ]
  },
  honduras: {
    key: 'honduras',
    name: 'Honduras',
    image: '/templates/honduras.png',
    boxColor: '#ffeb3b',
    boxBorder: 'dashed',
    boxBorderColor: '#000000',
    header: {
      yDraw: 305,
      yDate: 356,
      fontSizeDraw: 42,
      fontSizeDate: 26,
      color: '#000000'
    },
    headerCover: {
      x: 140,
      y: 265,
      w: 540,
      h: 125,
      mode: 'sampleX',
      samplePos: 700
    },
    boxes: [
      { x: 292, y: 401, w: 245, h: 122, radius: 4 },
      { x: 292, y: 560, w: 245, h: 122, radius: 4 },
      { x: 292, y: 720, w: 245, h: 122, radius: 4 }
    ]
  },
  newyork: {
    key: 'newyork',
    name: 'New York',
    image: '/templates/newyork.png',
    boxColor: '#e0f2fe',
    boxBorder: 'dashed',
    boxBorderColor: '#0369a1',
    header: {
      yDraw: 302,
      yDate: 355,
      fontSizeDraw: 42,
      fontSizeDate: 26,
      color: '#000000'
    },
    headerCover: {
      x: 140,
      y: 265,
      w: 540,
      h: 125,
      mode: 'sampleY',
      samplePos: 245
    },
    boxes: [
      { x: 292, y: 388, w: 245, h: 120, radius: 4 },
      { x: 292, y: 558, w: 245, h: 120, radius: 4 },
      { x: 292, y: 718, w: 245, h: 120, radius: 4 }
    ]
  },
  florida: {
    key: 'florida',
    name: 'Florida',
    image: '/templates/florida.png',
    boxColor: '#7dd3fc',
    boxBorder: 'dashed',
    boxBorderColor: '#075985',
    header: {
      yDraw: 254,
      yDate: 318,
      fontSizeDraw: 42,
      fontSizeDate: 26,
      color: '#000000',
      drawTextTransform: 'uppercase'
    },
    headerCover: {
      x: 160,
      y: 220,
      w: 500,
      h: 125,
      mode: 'sampleX',
      samplePos: 700
    },
    boxes: [
      { x: 308, y: 444, w: 236, h: 114, radius: 4 },
      { x: 308, y: 606, w: 236, h: 114, radius: 4 },
      { x: 308, y: 756, w: 236, h: 114, radius: 4 }
    ]
  },
  anguilla: {
    key: 'anguilla',
    name: 'Anguilla',
    image: '/templates/anguilla.png',
    boxColor: '#facc15',
    boxBorder: 'none',
    boxBorderColor: 'transparent',
    header: {
      yDraw: 294,
      yDate: 369,
      fontSizeDraw: 42,
      fontSizeDate: 26,
      color: '#000000',
      drawTextTransform: 'uppercase'
    },
    headerCover: {
      x: 140,
      y: 255,
      w: 540,
      h: 140,
      mode: 'sampleX',
      samplePos: 700
    },
    boxes: [
      { x: 287, y: 422, w: 246, h: 120, radius: 4 },
      { x: 287, y: 570, w: 246, h: 120, radius: 4 },
      { x: 287, y: 718, w: 246, h: 120, radius: 4 }
    ]
  },
  primera: {
    key: 'primera',
    name: 'La Primera',
    image: '/templates/primera.png',
    boxColor: '#fcd34d',
    boxBorder: 'dashed',
    boxBorderColor: '#78350f',
    header: {
      yDraw: 235,
      yDate: 315,
      fontSizeDraw: 42,
      fontSizeDate: 26,
      color: '#000000'
    },
    headerCover: {
      x: 160,
      y: 280,
      w: 500,
      h: 55,
      mode: 'sampleX',
      samplePos: 700
    },
    boxes: [
      { x: 287, y: 420, w: 246, h: 120, radius: 4 },
      { x: 287, y: 566, w: 246, h: 120, radius: 4 },
      { x: 287, y: 708, w: 246, h: 120, radius: 4 }
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

  // Cargar números ganadores registrados para la lotería y fecha seleccionadas
  useEffect(() => {
    if (!selectedLotteryId) return;
    const res = store.results.find(r => r.lotteryId === selectedLotteryId && r.date === selectedDate);
    if (res && res.winning_number) {
      const parts = res.winning_number.split('-');
      setFirstNum(parts[0] || '');
      setSecondNum(parts[1] || '');
      setThirdNum(parts[2] || '');
    } else {
      setFirstNum('');
      setSecondNum('');
      setThirdNum('');
    }
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
    return 'tica';
  };

  const currentTemplate = TEMPLATES[getTemplateKey(selectedLotteryId)] || TEMPLATES.tica;
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
    if (key === 'primera') return `11 AM`;
    return `${currentLottery.name} ${timeStr}`;
  };

  // Dibujar Canvas
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

      // 1. Dibujar imagen de fondo base
      ctx.drawImage(img, 0, 0, 819, 1024);

      // 2. Si está activo actualizar texto de fecha y hora:
      if (updateHeader && currentTemplate.headerCover) {
        const hc = currentTemplate.headerCover;
        if (hc.mode === 'sampleX' && hc.samplePos) {
          ctx.drawImage(img, hc.samplePos, hc.y, 4, hc.h, hc.x, hc.y, hc.w, hc.h);
        } else if (hc.mode === 'sampleY' && hc.samplePos) {
          ctx.drawImage(img, hc.x, hc.samplePos, hc.w, 4, hc.x, hc.y, hc.w, hc.h);
        } else if (hc.mode === 'solid' && hc.solidColor) {
          ctx.fillStyle = hc.solidColor;
          ctx.fillRect(hc.x, hc.y, hc.w, hc.h);
        }

        // Título del sorteo con hora
        const drawTitle = (customDrawTitle.trim() || getDrawTitleText());
        ctx.font = `900 ${currentTemplate.header.fontSizeDraw}px "Arial Black", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = currentTemplate.header.color;
        ctx.fillText(
          currentTemplate.header.drawTextTransform === 'uppercase' ? drawTitle.toUpperCase() : drawTitle,
          819 / 2,
          currentTemplate.header.yDraw
        );

        // Fecha larga
        ctx.font = `700 ${currentTemplate.header.fontSizeDate}px Arial, sans-serif`;
        ctx.fillStyle = currentTemplate.header.color;
        ctx.fillText(formatLongDate(selectedDate), 819 / 2, currentTemplate.header.yDate);
      }

      // 3. Dibujar cajas de números ganadores tapando el número anterior
      const nums = [firstNum || '--', secondNum || '--', thirdNum || '--'];

      currentTemplate.boxes.forEach((box, idx) => {
        // Rellenar caja con color base para tapar el número original
        ctx.fillStyle = currentTemplate.boxColor;
        ctx.fillRect(box.x, box.y, box.w, box.h);

        // Borde
        if (currentTemplate.boxBorder === 'dashed') {
          ctx.strokeStyle = currentTemplate.boxBorderColor;
          ctx.lineWidth = 1.8;
          ctx.setLineDash([6, 6]);
          ctx.strokeRect(box.x, box.y, box.w, box.h);
          ctx.setLineDash([]);
        } else if (currentTemplate.boxBorder === 'solid') {
          ctx.strokeStyle = currentTemplate.boxBorderColor;
          ctx.lineWidth = 2;
          ctx.strokeRect(box.x, box.y, box.w, box.h);
        }

        // Si este número debe revelarse (en animación de Reel o completo en imagen estática)
        if (idx < revealStep) {
          const val = nums[idx];
          ctx.font = '900 86px "Arial Black", Impact, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          // Sombra suave en el texto
          ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
          ctx.fillText(val, box.x + box.w / 2 + 3, box.y + box.h / 2 + 5);

          // Texto negro nítido
          ctx.fillStyle = '#000000';
          ctx.fillText(val, box.x + box.w / 2, box.y + box.h / 2);
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
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Título y Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem', color: '#0f172a', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Sparkles size={26} color="#eab308" /> Generador de Plantillas y Reels
          </h1>
          <p style={{ margin: '0.2rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            Genera imágenes y videos de 5 segundos listos para Instagram Reels y Canales de WhatsApp en 1 clic.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* PANEL DE CONTROL / AJUSTES */}
        <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.03)' }}>
          <h3 style={{ margin: '0 0 1.2rem', color: '#0f172a', fontSize: '1.1rem', fontWeight: 800 }}>
            ⚙️ Datos del Sorteo
          </h3>

          {/* Sorteo */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Selecciona el Sorteo
            </label>
            <select
              value={selectedLotteryId}
              onChange={(e) => setSelectedLotteryId(e.target.value)}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid #cbd5e1', outline: 'none', background: '#f8fafc', fontWeight: 'bold', fontSize: '0.95rem' }}
            >
              {supportedLotteries.map(l => (
                <option key={l.id} value={l.id}>
                  {l.name} - {formatLotteryTime(l.hour, l.minute)}
                </option>
              ))}
            </select>
          </div>

          {/* Fecha */}
          <div style={{ marginBottom: '1.2rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Fecha del Resultado
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid #cbd5e1', outline: 'none', background: '#f8fafc', fontWeight: 'bold' }}
            />
          </div>

          {/* 3 Números Ganadores */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Números Ganadores (1er, 2do y 3er Premio)
            </label>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <input
                type="text"
                maxLength={2}
                value={firstNum}
                onChange={(e) => setFirstNum(e.target.value.replace(/\D/g, ''))}
                placeholder="1er"
                style={{ flex: 1, padding: '0.8rem', fontSize: '1.4rem', fontWeight: '900', textAlign: 'center', borderRadius: '8px', border: '2px solid #eab308', background: '#fefce8', outline: 'none' }}
              />
              <input
                type="text"
                maxLength={2}
                value={secondNum}
                onChange={(e) => setSecondNum(e.target.value.replace(/\D/g, ''))}
                placeholder="2do"
                style={{ flex: 1, padding: '0.8rem', fontSize: '1.4rem', fontWeight: '900', textAlign: 'center', borderRadius: '8px', border: '2px solid #eab308', background: '#fefce8', outline: 'none' }}
              />
              <input
                type="text"
                maxLength={2}
                value={thirdNum}
                onChange={(e) => setThirdNum(e.target.value.replace(/\D/g, ''))}
                placeholder="3er"
                style={{ flex: 1, padding: '0.8rem', fontSize: '1.4rem', fontWeight: '900', textAlign: 'center', borderRadius: '8px', border: '2px solid #eab308', background: '#fefce8', outline: 'none' }}
              />
            </div>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
              * Si el sorteo ya se guardó en el sistema, los números se colocan automáticamente.
            </p>
          </div>

          {/* Opción de actualizar Fecha y Hora en la imagen */}
          <div style={{ marginBottom: '1.4rem', background: '#f8fafc', padding: '0.9rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>
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
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', background: '#ffffff' }}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Fecha calculada: <strong>{formatLongDate(selectedDate)}</strong>
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
                background: isGeneratingVideo ? '#94a3b8' : '#e11d48',
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
        <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '1rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#475569', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Eye size={16} /> Vista Previa en Vivo:
            </span>
            <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 'bold', background: '#ecfdf5', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
              819 × 1024 px
            </span>
          </div>

          <div style={{ width: '100%', maxWidth: '380px', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)', border: '1px solid #cbd5e1' }}>
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
