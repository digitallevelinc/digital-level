import { fUSDT, inject } from './utils.js';

// Variables de módulo para mantener estado
let dailyProfitBase = 0;
let dailyVolBase = 0;
let projections = {};

export function updateProyeccionesUI(kpis = {}) {
    const proj = kpis.projections || {};
    const audit = kpis.audit || {};
    const operations = kpis.operations || {};

    // Guardamos las proyecciones explícitas
    projections = {
        7: proj.weeklyProjection,
        15: proj.biweeklyProjection,
        30: proj.monthlyProjection
    };

    // Base diaria
    dailyProfitBase = proj.dailyProfit || 0;

    // CÁLCULO DE VOLUMEN PROYECTADO
    // El "dailyVelocity" muchas veces es un índice, no volumen USD.
    // Lo más preciso es usar el Promedio Histórico Diario Real.
    const totalVolKey = operations.totalVolumeUSDT > 0 ? operations.totalVolumeUSDT : (audit.totalVolume || 0);
    const daysKey = audit.periodDays || 1; // Evitar división por cero

    if (totalVolKey > 0 && daysKey > 0) {
        dailyVolBase = totalVolKey / daysKey;
    } else {
        // Fallback si no hay historia
        dailyVolBase = proj.projectedVolume || 0;
    }

    // Inicializamos con 1 día
    calculateScenario(1);

    // Event listeners para los botones de tiempo
    const buttons = document.querySelectorAll('.proj-time-btn');
    buttons.forEach(btn => {
        // Limpiamos listeners previos para evitar duplicados
        btn.onclick = null;

        btn.onclick = () => {
            // UI Update
            buttons.forEach(b => b.classList.remove('active', 'bg-blue-500', 'text-black'));
            buttons.forEach(b => b.classList.add('bg-white/5', 'text-gray-400'));

            btn.classList.add('active', 'bg-blue-500', 'text-black');
            btn.classList.remove('bg-white/5', 'text-gray-400');

            const days = parseInt(btn.getAttribute('data-days'));
            calculateScenario(days);
        };
    });
}

function calculateScenario(days) {
    // PROFIT: Usamos la proyección explícita si existe para ese periodo, sino extrapolamos
    const explicitProfit = projections[days];
    const totalProfit = explicitProfit !== undefined ? explicitProfit : (dailyProfitBase * days);

    // VOLUMEN: Extrapolamos volumetría histórica
    const totalVol = dailyVolBase * days;

    inject('projected-profit-value', fUSDT(totalProfit));

    // Inyectamos el volumen con etiqueta
    const volEl = document.getElementById('proj-vol-detail');
    if (volEl) {
        volEl.textContent = fUSDT(totalVol);
    }

    const label = document.getElementById('projection-label');
    if (label) {
        let periodText = '1 día';
        if (days === 7) periodText = '7 días';
        if (days === 15) periodText = '15 días';
        if (days === 30) periodText = '1 mes';

        label.textContent = `Estimado ${periodText}`;
    }
}