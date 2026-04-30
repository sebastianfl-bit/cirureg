import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Camera, Image as ImageIcon, Activity, Share, Search, Calendar, FileText, Loader2, Cloud, Save, FilePlus, Edit, Trash2, UploadCloud, DollarSign, CheckCircle, BarChart3 } from 'lucide-react';
import Dashboard from './Dashboard';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY ?? "";
const googleScriptUrl = "https://script.google.com/macros/s/AKfycbxzPCromrW1PC0B-56LNZ238gRl6MXmfLiyhHt48l6i1DBzRwYBXX_ZCh-zoM_HyeUWCA/exec";

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Normaliza fecha a YYYY-MM-DD sin importar si viene con T00:00:00Z
const formatFecha = (fecha) => fecha ? String(fecha).split('T')[0] : '';

export default function App() {
  const [patients, setPatients] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusText, setStatusText] = useState('');
  const [isLoadingDB, setIsLoadingDB] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [scannedData, setScannedData] = useState(null);
  const [paymentMatches, setPaymentMatches] = useState(null);

  // Filtro por mes: "todos" o "YYYY-MM"
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const pdfInputRef = useRef(null);

  useEffect(() => {
    if (!googleScriptUrl || googleScriptUrl === "TU_URL_DE_GOOGLE_DRIVE_AQUI") return;
    const fetchFromDrive = async () => {
      setIsLoadingDB(true);
      try {
        const response = await fetch(googleScriptUrl);
        const data = await response.json();
        if (Array.isArray(data)) setPatients(data.reverse());
      } catch (error) {
        console.error("Error cargando de Google Drive:", error);
      } finally {
        setIsLoadingDB(false);
      }
    };
    fetchFromDrive();
  }, []);

  // Genera opciones del dropdown a partir de los meses con datos + mes actual
  const monthOptions = useMemo(() => {
    const mesesConDatos = new Set();
    mesesConDatos.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    patients.forEach(p => {
      const fecha = formatFecha(p.fechaOperacion);
      if (fecha) mesesConDatos.add(fecha.substring(0, 7));
    });
    return ['todos', ...Array.from(mesesConDatos).sort().reverse()];
  }, [patients]);

  const fetchWithRetry = async (url, options, retries = 5) => {
    const delays = [1000, 2000, 4000, 8000, 16000];
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, delays[i]));
      }
    }
  };

  const processImage = async (file) => {
    if (!file) return;
    if (apiKey === "TU_CLAVE_GEMINI_AQUI" || apiKey.trim() === "") {
      alert("Por favor, configura tu API Key de Gemini en el código."); return;
    }
    setIsProcessing(true);
    setStatusText('Analizando documento con IA...');
    try {
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
      });
      const promptText = `
        Eres un asistente médico experto. Analiza el siguiente documento operatorio.
        Extrae la siguiente información. Si no encuentras un dato específico, déjalo vacío. No devuelvas tus pensamientos o procesos. solo el dato "".
        Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura:
        {
          "nombre": "Nombre completo del paciente",
          "fechaOperacion": "YYYY-MM-DD",
          "procedimiento": "Nombre de la cirugía",
          "cirujano": "Cirujano principal",
          "ayudante": "Ayudante",
          "notas": "Hallazgos"
        }
      `;
      const payload = {
        contents: [{ role: "user", parts: [{ text: promptText }, { inlineData: { mimeType: file.type, data: base64Data } }] }],
        systemInstruction: { parts: [{ text: "Debes responder estrictamente con JSON. No incluyas etiquetas markdown." }] },
        generationConfig: { responseMimeType: "application/json" }
      };
      const result = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      );
      const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
      const extractedData = JSON.parse(textResponse.replace(/```json/gi, '').replace(/```/g, '').trim());
      setScannedData({
        nombre: extractedData.nombre || '',
        fechaOperacion: extractedData.fechaOperacion || new Date().toISOString().split('T')[0],
        procedimiento: extractedData.procedimiento || '',
        cirujano: extractedData.cirujano || '',
        ayudante: extractedData.ayudante || '',
        notas: extractedData.notas || '',
        pagosStr: '',
        isEditing: false
      });
    } catch (error) {
      alert("Hubo un problema al procesar la imagen.");
    } finally {
      setIsProcessing(false);
      setStatusText('');
    }
  };

  const processPdf = async (file) => {
    if (!file) return;
    if (apiKey === "TU_CLAVE_GEMINI_AQUI" || apiKey.trim() === "") {
      alert("Falta API Key de Gemini."); return;
    }
    setIsProcessing(true);
    setStatusText('Extrayendo pagos del PDF...');
    try {
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
      });
      const promptText = `
        Analiza este documento de liquidación de pagos.
        Extrae una lista de todos los pacientes y el monto total pagado por cada uno.
        Devuelve ÚNICAMENTE un arreglo (array) JSON válido con esta estructura exacta:
        [{ "nombrePaciente": "Nombre del paciente", "monto": "Monto pagado (ej: $150.000 o 150000)" }]
        Si no hay pagos, devuelve []. No incluyas markdown.
      `;
      const payload = {
        contents: [{ role: "user", parts: [{ text: promptText }, { inlineData: { mimeType: "application/pdf", data: base64Data } }] }],
        systemInstruction: { parts: [{ text: "Debes responder estrictamente con un ARRAY JSON." }] },
        generationConfig: { responseMimeType: "application/json" }
      };
      const result = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      );
      const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
      const extractedPayments = JSON.parse(textResponse.replace(/```json/gi, '').replace(/```/g, '').trim());
      setStatusText('Cruzando datos con el registro...');
      const normalize = (str) => str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : "";
      const matchedResults = extractedPayments.map(pago => {
        const payNameNorm = normalize(pago.nombrePaciente);
        const payWords = payNameNorm.split(' ').filter(w => w.length > 2);
        let bestMatch = null;
        let maxScore = 0;
        patients.forEach(pat => {
          const patNameNorm = normalize(pat.nombre);
          const patWords = patNameNorm.split(' ');
          let score = 0;
          payWords.forEach(pw => { if (patWords.includes(pw)) score++; });
          if (score > maxScore) { maxScore = score; bestMatch = pat; }
        });
        return { nombrePDF: pago.nombrePaciente, montoPDF: pago.monto, pacienteMatch: maxScore >= 2 ? bestMatch : null };
      });
      setPaymentMatches(matchedResults);
    } catch (error) {
      console.error(error);
      alert("Error procesando el PDF. Asegúrate de que sea un PDF legible.");
    } finally {
      setIsProcessing(false);
      setStatusText('');
    }
  };

  const applyPayments = async () => {
    const validMatches = paymentMatches.filter(p => p.pacienteMatch);
    if (validMatches.length === 0) {
      alert("No se encontraron coincidencias válidas para aplicar.");
      setPaymentMatches(null); return;
    }
    setIsProcessing(true);
    setStatusText('Aplicando pagos en Drive...');
    const updatedPatients = [];
    for (const match of validMatches) {
      const pagosExistentes = match.pacienteMatch.pagos || [];
      const nuevosPagos = [...pagosExistentes, match.montoPDF];
      const updatedPatient = { ...match.pacienteMatch, pagos: nuevosPagos, action: 'save' };
      if (googleScriptUrl && googleScriptUrl !== "TU_URL_DE_GOOGLE_DRIVE_AQUI") {
        try {
          await fetchWithRetry(googleScriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(updatedPatient)
          });
          updatedPatients.push(updatedPatient);
        } catch (dbError) {
          console.error("Error guardando pago:", dbError);
        }
      }
    }
    setPatients(prev => prev.map(p => {
      const upd = updatedPatients.find(u => u.id === p.id);
      return upd ? upd : p;
    }));
    setPaymentMatches(null);
    setIsProcessing(false);
    setStatusText('');
    alert(`Se agregaron ${updatedPatients.length} pagos correctamente.`);
  };

  const handleManualEntry = () => {
    setScannedData({
      nombre: "", fechaOperacion: new Date().toISOString().split('T')[0],
      procedimiento: "", cirujano: "", ayudante: "", notas: "", pagosStr: "", isEditing: false
    });
  };

  const handleEditClick = (patient) => {
    const pagosStr = patient.pagos && patient.pagos.length > 0 ? patient.pagos.join(', ') : '';
    setScannedData({
      id: patient.id, nombre: patient.nombre, fechaOperacion: formatFecha(patient.fechaOperacion),
      procedimiento: patient.procedimiento, cirujano: patient.cirujano, ayudante: patient.ayudante,
      notas: patient.notas, pagosStr, isEditing: true
    });
  };

  const handleDeleteClick = async (id) => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar este registro permanentemente?")) return;
    setStatusText('Eliminando...'); setIsProcessing(true);
    if (googleScriptUrl && googleScriptUrl !== "TU_URL_DE_GOOGLE_DRIVE_AQUI") {
      await fetch(googleScriptUrl, { method: 'POST', body: JSON.stringify({ action: 'delete', id }) });
    }
    setPatients(prev => prev.filter(p => p.id !== id));
    setIsProcessing(false); setStatusText('');
  };

  const handleFormSave = async (e) => {
    e.preventDefault();
    if (!scannedData.nombre) return;
    setStatusText('Guardando...'); setIsProcessing(true);
    const isEditing = !!scannedData.isEditing;
    const pagosArray = scannedData.pagosStr
      ? scannedData.pagosStr.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const patientToSave = {
      action: 'save',
      id: isEditing ? scannedData.id : Math.random().toString(36).substring(7),
      nombre: scannedData.nombre.trim(),
      fechaOperacion: scannedData.fechaOperacion,
      procedimiento: scannedData.procedimiento.trim(),
      cirujano: scannedData.cirujano.trim(),
      ayudante: scannedData.ayudante.trim(),
      notas: scannedData.notas.trim(),
      pagos: pagosArray
    };
    if (googleScriptUrl && googleScriptUrl !== "TU_URL_DE_GOOGLE_DRIVE_AQUI") {
      await fetch(googleScriptUrl, { method: 'POST', body: JSON.stringify(patientToSave) });
    }
    if (isEditing) setPatients(prev => prev.map(p => p.id === patientToSave.id ? patientToSave : p));
    else setPatients(prev => [patientToSave, ...prev]);
    setScannedData(null); setIsProcessing(false); setStatusText('');
  };

  const handleInputChange = (e) => setScannedData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  const handleCameraCapture = (e) => { const f = e.target.files?.[0]; if (f) processImage(f); if (cameraInputRef.current) cameraInputRef.current.value = ''; };
  const handleGallerySelect = (e) => { const f = e.target.files?.[0]; if (f) processImage(f); if (galleryInputRef.current) galleryInputRef.current.value = ''; };
  const handlePdfSelect = (e) => { const f = e.target.files?.[0]; if (f) processPdf(f); if (pdfInputRef.current) pdfInputRef.current.value = ''; };

  const exportToCSVAndShare = () => {
    if (patients.length === 0) return;
    const headers = ['Nombre', 'Fecha Operación', 'Procedimiento', 'Cirujano', 'Ayudante', 'Historial Pagos', 'Notas'];
    const escapeCsv = (c) => c == null ? '""' : `"${String(c).replace(/"/g, '""')}"`;
    const rows = patients.map(p => {
      const historialPagos = p.pagos ? p.pagos.join(' | ') : '';
      return [escapeCsv(p.nombre), escapeCsv(formatFecha(p.fechaOperacion)), escapeCsv(p.procedimiento), escapeCsv(p.cirujano), escapeCsv(p.ayudante), escapeCsv(historialPagos), escapeCsv(p.notas)].join(',');
    });
    const blob = new Blob(["\uFEFF" + headers.join(',') + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const file = new File([blob], `Cirugias_${new Date().toISOString().split('T')[0]}.csv`, { type: 'text/csv' });
    if (navigator.share && navigator.canShare) navigator.share({ files: [file] }).catch(console.error);
    else { const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = file.name; link.click(); }
  };

  const formatMonthLabel = (ym) => {
    if (ym === 'todos') return 'Todos los meses';
    const [year, month] = ym.split('-');
    return `${MESES[parseInt(month) - 1]} ${year}`;
  };

  // Filtro combinado: mes + búsqueda
  const filteredPatients = useMemo(() => {
    return patients.filter(p => {
      const fecha = formatFecha(p.fechaOperacion);
      const pasaMes = selectedMonth === 'todos' || fecha.startsWith(selectedMonth);
      const pasaBusqueda =
        p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.procedimiento.toLowerCase().includes(searchTerm.toLowerCase()) ||
        fecha.includes(searchTerm);
      return pasaMes && pasaBusqueda;
    });
  }, [patients, searchTerm, selectedMonth]);

  return (
    <div className="fixed inset-0 bg-slate-100 flex justify-center font-sans">
      <div className="w-full sm:max-w-md bg-slate-50 h-full flex flex-col relative shadow-2xl overflow-hidden">

        {/* HEADER */}
        <header className="bg-white px-4 py-4 flex justify-between items-center border-b border-slate-200 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <div className="bg-teal-600 w-11 h-11 rounded-lg flex items-center justify-center relative overflow-hidden shadow-sm shrink-0 border border-teal-500">
              <img
                src="/logo.jpg"
                alt="Logo CiruReg"
                className="w-full h-full object-cover relative z-10"
                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }}
              />
              <Activity size={22} className="text-white hidden absolute z-0" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-lg font-bold text-slate-800 leading-tight">Registro Quirúrgico AI</h1>
              <span className="text-[10px] text-teal-600 flex items-center gap-1 font-bold mt-0.5">
                <Cloud size={10} /> Sincronizado
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowDashboard(true)} className="bg-teal-600 hover:bg-teal-700 p-2 rounded-lg text-white" title="Dashboard">
              <BarChart3 size={18} />
            </button>
            <button onClick={exportToCSVAndShare} className="bg-slate-800 hover:bg-slate-700 p-2 rounded-lg text-white" title="Exportar CSV">
              <Share size={18} />
            </button>
          </div>
        </header>

        {/* MAIN */}
        <main className="flex-1 overflow-y-auto pb-6 relative z-0">

          {/* BOTONES DE ACCIÓN */}
          <div className="p-4 flex flex-col gap-3 shrink-0">
            <div className="flex gap-3">
              <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} onChange={handleCameraCapture} className="hidden" />
              <button onClick={() => cameraInputRef.current?.click()} disabled={isProcessing || scannedData || paymentMatches} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white py-3.5 rounded-xl flex items-center justify-center gap-2 font-semibold shadow-sm disabled:opacity-60">
                <Camera size={20} /> Tomar Foto
              </button>
              <input type="file" accept="image/*" ref={galleryInputRef} onChange={handleGallerySelect} className="hidden" />
              <button onClick={() => galleryInputRef.current?.click()} disabled={isProcessing || scannedData || paymentMatches} className="flex-1 bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-800 py-3.5 rounded-xl flex items-center justify-center gap-2 font-semibold disabled:opacity-60">
                <ImageIcon size={20} /> Galería
              </button>
            </div>
            <div className="flex gap-3">
              <button onClick={handleManualEntry} disabled={isProcessing || scannedData || paymentMatches} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl flex items-center justify-center gap-2 font-semibold shadow-sm disabled:opacity-60">
                <FilePlus size={18} /> Manual
              </button>
              <input type="file" accept="application/pdf" ref={pdfInputRef} onChange={handlePdfSelect} className="hidden" />
              <button onClick={() => pdfInputRef.current?.click()} disabled={isProcessing || scannedData || paymentMatches} className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white py-3 rounded-xl flex items-center justify-center gap-2 font-semibold shadow-sm disabled:opacity-60">
                <UploadCloud size={18} /> Cargar PDF
              </button>
            </div>
          </div>

          {isProcessing && !scannedData && !paymentMatches && (
            <div className="flex flex-col items-center justify-center gap-2 pb-4 text-teal-700 font-medium shrink-0">
              <Loader2 size={24} className="animate-spin mb-1" />
              <span className="text-sm">{statusText}</span>
            </div>
          )}

          {/* CONFIRMACIÓN DE PAGOS */}
          {paymentMatches && (
            <div className="bg-yellow-50 border border-yellow-200 m-4 p-4 rounded-xl shadow-md shrink-0">
              <h3 className="text-yellow-800 font-bold mb-3 flex items-center gap-2">
                <DollarSign size={18} /> Pagos Encontrados
              </h3>
              <p className="text-xs text-yellow-700 mb-3">Revisa las coincidencias entre la liquidación PDF y tus pacientes registrados.</p>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-2 mb-4">
                {paymentMatches.map((match, i) => (
                  <div key={i} className={`p-3 rounded-lg border text-sm ${match.pacienteMatch ? 'bg-white border-green-200' : 'bg-white/50 border-red-100 opacity-60'}`}>
                    <div className="flex justify-between font-bold text-slate-800 mb-1">
                      <span>{match.nombrePDF}</span>
                      <span className="text-emerald-600">{match.montoPDF}</span>
                    </div>
                    {match.pacienteMatch ? (
                      <div className="text-xs text-green-600 flex items-center gap-1 font-medium">
                        <CheckCircle size={12} /> Se agregará como Pago {match.pacienteMatch.pagos ? match.pacienteMatch.pagos.length + 1 : 1} a: {match.pacienteMatch.nombre}
                      </div>
                    ) : (
                      <div className="text-xs text-red-400 font-medium">No se encontró paciente en el registro.</div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setPaymentMatches(null)} className="flex-1 bg-white border border-slate-300 text-slate-700 py-2.5 rounded-lg font-medium">Cancelar</button>
                <button onClick={applyPayments} disabled={isProcessing || !paymentMatches.some(p => p.pacienteMatch)} className="flex-[2] bg-yellow-500 text-white py-2.5 rounded-lg font-bold flex justify-center items-center gap-2 hover:bg-yellow-600 disabled:opacity-50">
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Aplicar Pagos Válidos
                </button>
              </div>
            </div>
          )}

          {/* FORMULARIO CIRUGÍA */}
          {scannedData && (
            <form onSubmit={handleFormSave} className="bg-teal-50 border border-teal-200 m-4 p-4 rounded-xl shadow-md shrink-0">
              <h3 className="text-teal-800 font-bold mb-3 flex items-center gap-2">
                <FileText size={18} /> {scannedData.isEditing ? "Editar Registro" : "Revisa los datos"}
              </h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Paciente</label>
                    <input type="text" name="nombre" value={scannedData.nombre} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-md bg-white text-slate-900 font-medium" required />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase">Fecha</label>
                    <input type="date" name="fechaOperacion" value={scannedData.fechaOperacion} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-md bg-white text-slate-900 font-medium" required />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-emerald-600 uppercase">Pagos (separar por coma)</label>
                    <input type="text" name="pagosStr" placeholder="Ej: $150.000, $50.000" value={scannedData.pagosStr} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 border border-emerald-300 rounded-md bg-emerald-50 text-emerald-800 font-bold" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Procedimiento</label>
                    <input type="text" name="procedimiento" value={scannedData.procedimiento} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-md bg-white text-slate-900 font-medium" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase">Cirujano</label>
                    <input type="text" name="cirujano" value={scannedData.cirujano} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-md bg-white text-slate-900 font-medium" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase">Ayudante</label>
                    <input type="text" name="ayudante" value={scannedData.ayudante} onChange={handleInputChange} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-md bg-white text-slate-900 font-medium" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-teal-600 uppercase">Notas adicionales</label>
                    <textarea name="notas" value={scannedData.notas} onChange={handleInputChange} rows="2" className="w-full mt-1 px-3 py-2 border border-teal-300 rounded-md bg-white text-slate-900 font-medium"></textarea>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button type="button" onClick={() => setScannedData(null)} className="flex-1 bg-white border border-slate-300 text-slate-700 py-2.5 rounded-lg font-medium">Cancelar</button>
                  <button type="submit" disabled={isProcessing} className="flex-1 bg-teal-600 text-white py-2.5 rounded-lg font-medium flex justify-center items-center gap-2">
                    {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {scannedData.isEditing ? "Actualizar" : "Guardar"}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* FILTRO POR MES + BUSCADOR */}
          <div className="px-4 mb-3 flex flex-col gap-2 shrink-0">

            {/* Dropdown de mes */}
            <div className="relative">
              <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-600 pointer-events-none" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full pl-9 pr-8 py-2.5 bg-white border border-teal-200 rounded-xl text-slate-800 font-semibold text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-teal-400 shadow-sm"
              >
                {monthOptions.map(opt => (
                  <option key={opt} value={opt}>{formatMonthLabel(opt)}</option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">▼</div>
            </div>

            {/* Buscador */}
            <div className="relative flex items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
              <Search size={20} className="text-slate-400" />
              <input
                type="text"
                placeholder="Buscar paciente, cirugía..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full py-2 px-3 focus:outline-none text-slate-900 bg-transparent text-base"
              />
            </div>

            {/* Contador */}
            <p className="text-xs text-slate-400 pl-1">
              {filteredPatients.length} {filteredPatients.length === 1 ? 'registro' : 'registros'}
              {selectedMonth !== 'todos' ? ` en ${formatMonthLabel(selectedMonth)}` : ' en total'}
            </p>
          </div>

          {/* LISTA DE PACIENTES */}
          <div className="px-4 space-y-4">
            {filteredPatients.length === 0 && (
              <div className="text-center py-12 text-slate-400 text-sm">
                No hay cirugías registradas<br />
                {selectedMonth !== 'todos' ? `en ${formatMonthLabel(selectedMonth)}` : ''}
              </div>
            )}
            {filteredPatients.map((patient) => (
              <div key={patient.id} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm relative group">
                <div className="absolute top-3 right-3 flex gap-1">
                  <button onClick={() => handleEditClick(patient)} className="p-2 text-teal-500 hover:text-teal-700 hover:bg-teal-50 rounded-full transition-colors"><Edit size={16} /></button>
                  <button onClick={() => handleDeleteClick(patient.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"><Trash2 size={16} /></button>
                </div>
                <div className="flex items-center mb-3 pr-16">
                  <div className="w-11 h-11 rounded-full bg-teal-50 flex items-center justify-center text-teal-700 font-bold text-lg mr-3 border border-teal-100 shrink-0">
                    {patient.nombre.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-bold text-slate-800 truncate">{patient.nombre}</h2>
                    <div className="flex items-center text-xs text-slate-500 mt-0.5 gap-1.5">
                      <Calendar size={12} /> {formatFecha(patient.fechaOperacion)}
                    </div>
                  </div>
                </div>
                <div className="h-px bg-slate-100 mb-3" />
                <div className="space-y-2.5 text-sm pr-2">
                  <div className="flex"><span className="w-24 text-slate-500 font-medium shrink-0">Proc:</span><span className="text-slate-800">{patient.procedimiento}</span></div>
                  <div className="flex"><span className="w-24 text-slate-500 font-medium shrink-0">Equipo:</span><span className="text-slate-800">Dr. {patient.cirujano} <span className="text-slate-500 text-xs ml-1">(Ayud: {patient.ayudante})</span></span></div>
                  {patient.pagos && patient.pagos.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {patient.pagos.map((pago, idx) => (
                        <div key={idx} className="flex items-center bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
                          <DollarSign size={13} className="text-emerald-600 mr-1" />
                          <span className="text-emerald-700 font-bold text-[11px]">Pago {idx + 1}: {pago}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {patient.notas && (
                  <div className="mt-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <p className="text-sm text-slate-600 italic">"{patient.notas}"</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </main>

        {/* DASHBOARD MODAL */}
        {showDashboard && (
          <Dashboard patients={patients} onClose={() => setShowDashboard(false)} />
        )}

      </div>
    </div>
  );
}
