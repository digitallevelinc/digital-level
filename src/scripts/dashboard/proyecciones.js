import { fUSDT, inject } from './utils.js';

let dailyProfitBase = 0;
let dailyVolBase = 0;

export function updateProyeccionesUI(kpis = {}) {
    const proj = kpis.projections || {};
    const audit = kpis.audit || {};
    const operations = kpis.operations || {};

    // Guardamos la base diaria que viene de la API
    dailyProfitBase = proj.dailyProfit || 0;

    // Si no viene projectedVolume, usamos dailyVelocity, o calculamos el promedio histórico
    let dailyVol = proj.projectedVolume || proj.dailyVelocity || 0;

    if (!dailyVol && audit.periodDays > 0) {
        // Fallback: Total Volumen / Días Operativos
        dailyVol = (operations.totalVolumeUSDT || 0) / audit.periodDays;
    }

    dailyVolBase = dailyVol;

    // Inicializamos con 1 día
    calculateScenario(1);

    // Event listeners para los botones de tiempo
    const buttons = document.querySelectorAll('.proj-time-btn');
    buttons.forEach(btn => {
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
    const totalProfit = dailyProfitBase * days;
    const totalVol = dailyVolBase * days;

    inject('project-profit-value', fUSDT(totalProfit));
    inject('proj-vol-detail', fUSDT(totalVol));

    const label = document.getElementById('projection-label');
    if (label) {
        const text = days === 30 ? '1 mes' : (days === 1 ? '1 día' : `${days} días`);
        label.textContent = `Estimado ${text}`;
    }
}