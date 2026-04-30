import React, { useMemo } from 'react';
import { X, TrendingUp, TrendingDown, Activity, Calendar, Award, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// Componente Dashboard - recibe la lista de pacientes y una función para cerrar
export default function Dashboard({ patients, onClose }) {

  // ═══════════════════════════════════════════════════════════
  // CÁLCULOS DE MÉTRICAS
  // ═══════════════════════════════════════════════════════════
  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    // Cirugías este mes y mes anterior
    let cirugiasEsteMes = 0;
    let cirugiasMesAnterior = 0;

    patients.forEach(p => {
      if (!p.fechaOperacion) return;
      const fecha = new Date(p.fechaOperacion);
      if (isNaN(fecha)) return;

      const mesDiff = (thisYear - fecha.getFullYear()) * 12 + (thisMonth - fecha.getMonth());
      if (mesDiff === 0) cirugiasEsteMes++;
      else if (mesDiff === 1) cirugiasMesAnterior++;
    });

    // Variación porcentual
    let variacion = 0;
    if (cirugiasMesAnterior > 0) {
      variacion = Math.round(((cirugiasEsteMes - cirugiasMesAnterior) / cirugiasMesAnterior) * 100);
    } else if (cirugiasEsteMes > 0) {
      variacion = 100;
    }

    // Promedio mensual (sobre meses con actividad)
    const mesesUnicos = new Set();
    patients.forEach(p => {
      if (p.fechaOperacion) {
        const f = new Date(p.fechaOperacion);
        if (!isNaN(f)) mesesUnicos.add(`${f.getFullYear()}-${f.getMonth()}`);
      }
    });
    const promedioMensual = mesesUnicos.size > 0
      ? Math.round(patients.length / mesesUnicos.size)
      : 0;

    return {
      cirugiasEsteMes,
      cirugiasMesAnterior,
      variacion,
      totalHistorico: patients.length,
      promedioMensual,
    };
  }, [patients]);

  // ═══════════════════════════════════════════════════════════
  // DATOS PARA GRÁFICO DE BARRAS (últimos 6 meses)
  // ═══════════════════════════════════════════════════════════
  const monthlyData = useMemo(() => {
    const meses = [];
    const now = new Date();
    const nombresMeses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    for (let i = 5; i >= 0; i--) {
      const fecha = new Date(now.getFullYear(), now.getMonth() - i, 1);
      meses.push({
        mes: nombresMeses[fecha.getMonth()],
        año: fecha.getFullYear(),
        key: `${fecha.getFullYear()}-${fecha.getMonth()}`,
        cirugias: 0,
      });
    }

    patients.forEach(p => {
      if (!p.fechaOperacion) return;
      const f = new Date(p.fechaOperacion);
      if (isNaN(f)) return;
      const k = `${f.getFullYear()}-${f.getMonth()}`;
      const target = meses.find(m => m.key === k);
      if (target) target.cirugias++;
    });

    return meses;
  }, [patients]);

  // ═══════════════════════════════════════════════════════════
  // TOP PROCEDIMIENTOS
  // ═══════════════════════════════════════════════════════════
  const topProcedimientos = useMemo(() => {
    const conteo = {};
    patients.forEach(p => {
      const proc = (p.procedimiento || '').trim();
      if (!proc) return;
      conteo[proc] = (conteo[proc] || 0) + 1;
    });
    return Object.entries(conteo)
      .map(([nombre, count]) => ({ nombre, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [patients]);

  // ═══════════════════════════════════════════════════════════
  // ACTIVIDAD POR CIRUJANO
  // ═══════════════════════════════════════════════════════════
  const porCirujano = useMemo(() => {
    const conteo = {};
    patients.forEach(p => {
      const cir = (p.cirujano || '').trim();
      if (!cir) return;
      conteo[cir] = (conteo[cir] || 0) + 1;
    });
    return Object.entries(conteo)
      .map(([nombre, count]) => ({ nombre, count }))
      .sort((a, b) => b.count - a.count);
  }, [patients]);

  const maxProc = topProcedimientos[0]?.count || 1;

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="fixed inset-0 bg-slate-100 z-50 flex justify-center">
      <div className="w-full sm:max-w-md bg-slate-50 h-full flex flex-col shadow-2xl overflow-hidden">

        {/* HEADER */}
        <header className="bg-white px-4 py-4 flex justify-between items-center border-b border-slate-200 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <div className="bg-teal-600 w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
              <Activity size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 leading-tight">Dashboard</h1>
              <span className="text-[11px] text-slate-500">Estadísticas del registro</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600">
            <X size={22} />
          </button>
        </header>

        {/* CONTENIDO SCROLLEABLE */}
        <main className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* ─── KPIs PRINCIPALES (grid 2x2) ─── */}
          <div className="grid grid-cols-2 gap-3">

            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <Calendar size={16} className="text-teal-600" />
                {stats.variacion !== 0 && (
                  <div className={`flex items-center gap-0.5 text-[11px] font-bold ${stats.variacion > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {stats.variacion > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {Math.abs(stats.variacion)}%
                  </div>
                )}
              </div>
              <div className="text-3xl font-bold text-slate-800">{stats.cirugiasEsteMes}</div>
              <div className="text-xs text-slate-500 mt-1">Cirugías este mes</div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <Calendar size={16} className="text-slate-400 mb-2" />
              <div className="text-3xl font-bold text-slate-800">{stats.cirugiasMesAnterior}</div>
              <div className="text-xs text-slate-500 mt-1">Mes anterior</div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <Activity size={16} className="text-teal-600 mb-2" />
              <div className="text-3xl font-bold text-slate-800">{stats.totalHistorico}</div>
              <div className="text-xs text-slate-500 mt-1">Total histórico</div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <TrendingUp size={16} className="text-teal-600 mb-2" />
              <div className="text-3xl font-bold text-slate-800">{stats.promedioMensual}</div>
              <div className="text-xs text-slate-500 mt-1">Promedio / mes</div>
            </div>
          </div>

          {/* ─── GRÁFICO DE BARRAS ─── */}
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 mb-1">Últimos 6 meses</h3>
            <p className="text-xs text-slate-500 mb-3">Cirugías por mes</p>
            <div style={{ width: '100%', height: 180 }}>
              <ResponsiveContainer>
                <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: '#f1f5f9' }}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                    labelFormatter={(label, payload) => {
                      const item = payload?.[0]?.payload;
                      return item ? `${label} ${item.año}` : label;
                    }}
                  />
                  <Bar dataKey="cirugias" radius={[6, 6, 0, 0]}>
                    {monthlyData.map((entry, idx) => (
                      <Cell key={idx} fill={idx === monthlyData.length - 1 ? '#0d9488' : '#5eead4'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ─── TOP PROCEDIMIENTOS ─── */}
          {topProcedimientos.length > 0 && (
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Award size={16} className="text-teal-600" />
                <h3 className="text-sm font-bold text-slate-800">Top Procedimientos</h3>
              </div>
              <div className="space-y-2">
                {topProcedimientos.map((p, idx) => (
                  <div key={idx}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-700 font-medium truncate pr-2">{p.nombre}</span>
                      <span className="text-slate-500 font-bold shrink-0">{p.count}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-teal-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${(p.count / maxProc) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── POR CIRUJANO ─── */}
          {porCirujano.length > 0 && (
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Users size={16} className="text-teal-600" />
                <h3 className="text-sm font-bold text-slate-800">Por Cirujano</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {porCirujano.map((c, idx) => (
                  <div key={idx} className="flex justify-between items-center py-2 text-sm">
                    <span className="text-slate-700">Dr. {c.nombre}</span>
                    <span className="bg-teal-50 text-teal-700 font-bold text-xs px-2 py-1 rounded-md">
                      {c.count} {c.count === 1 ? 'cirugía' : 'cirugías'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {patients.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-sm">
              Aún no hay datos para mostrar.<br />Registra tu primera cirugía.
            </div>
          )}

          <div className="h-4" />
        </main>
      </div>
    </div>
  );
}
