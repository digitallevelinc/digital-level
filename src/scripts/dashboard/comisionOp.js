import { fUSDT, inject } from './utils.js';

export function updateComisionOperadorUI(kpis = {}) {
    // 1. Obtenemos el profit total del dashboard
    const summary = kpis.metrics || kpis.summary || {};
    const totalProfit = summary.totalProfit || 0;

    // 2. Obtenemos el % configurado (Viene del modulo admin a través de la API)
    // Si la API no lo trae, usamos 60 por defecto como indica tu index
    const configPct = kpis.operatorConfig?.commissionPct || 60; 

    // 3. Calculamos la tajada del operador
    const netProfit = (totalProfit * configPct) / 100;

    // 4. Inyectamos los valores
    inject('op-config-pct', `${configPct}%`);
    inject('op-net-profit', fUSDT(netProfit));

    // 5. Animamos la barra (opcional: basado en una meta diaria de 100 USDT)
    const progressBar = document.getElementById('op-profit-bar');
    if (progressBar) {
        const goal = 100; 
        const progress = Math.min((netProfit / goal) * 100, 100);
        progressBar.style.width = `${progress}%`;
    }
}