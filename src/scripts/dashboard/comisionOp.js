// src/scripts/dashboard/comisionOp.js
import { fUSDT } from './utils.js';

export function updateComisionOperadorUI(kpis = {}, bankInsights = []) {
    const ui = {
        pct: document.getElementById('op-config-pct'),
        netProfit: document.getElementById('op-net-profit'),
        bar: document.getElementById('op-profit-bar')
    };

    const configPct = kpis.config?.commissionPercentage ?? 0;
    
    // 1. Sumarización Manual desde los bancos (donde sí hay fees)
    let sumaProfitBruto = 0;
    let sumaTotalFees = 0;

    // Usamos bankInsights si existe, sino intentamos sacarlo de kpis
    const bancos = bankInsights.length > 0 ? bankInsights : (kpis.bankInsights || []);

    if (bancos.length > 0) {
        bancos.forEach(b => {
            sumaProfitBruto += (b.profit || 0);
            sumaTotalFees += (b.feeBuy || 0) + (b.feeSell || 0);
        });
    } else {
        // Si no hay bancos, usamos el fallback global pero el log ya nos dijo que es 0
        sumaProfitBruto = kpis.summary?.totalProfit || 0;
    }

    // 2. CÁLCULO REAL
    // Ejemplo Mercantil: 17.04 (Bruto) - 4.70 (Fees) = 12.34 (Neto Mesa)
    const netoRealMesa = sumaProfitBruto - sumaTotalFees;
    
    // 3. Tu tajada (60% de 12.34 = 7.40 aprox)
    const operatorEarnings = (netoRealMesa * configPct) / 100;

    // 4. Inyectar en UI
    if (ui.pct) ui.pct.textContent = `${configPct}%`;
    
    if (ui.netProfit) {
        ui.netProfit.textContent = fUSDT(operatorEarnings);
        ui.netProfit.className = operatorEarnings >= 0 
            ? "text-xl font-mono font-bold tracking-tight text-white leading-none"
            : "text-xl font-mono font-bold tracking-tight text-rose-500 leading-none";
    }

    // 5. Barra
    if (ui.bar) {
        const goal = 50; 
        const progress = Math.max(0, Math.min((operatorEarnings / goal) * 100, 100));
        ui.bar.style.width = `${progress}%`;
    }

    // LOG DE VERIFICACIÓN
    console.log("--- AJUSTE POR BANCOS ---");
    console.log("Suma Bruta Bancos:", sumaProfitBruto);
    console.log("Suma Fees Bancos:", sumaTotalFees);
    console.log("Neto Real Mesa:", netoRealMesa);
    console.log("Tu Comisión:", operatorEarnings);
}