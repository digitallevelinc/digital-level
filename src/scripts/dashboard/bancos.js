// src/scripts/dashboard/bancos.js
import { fUSDT, fVES } from './utils.js';

export function updateBancosUI(insights = []) {
    if (!insights) return;

    insights.forEach(b => {
        // Normalización del ID para coincidir con el .astro
        const id = b.bank.toLowerCase().split(' ')[0].replace(/\s+/g, '');

        const ui = {
            fiat: document.getElementById(`bank-fiat-${id}`),
            usdt: document.getElementById(`bank-usdt-${id}`),
            buy: document.getElementById(`bank-buy-${id}`),
            sell: document.getElementById(`bank-sell-${id}`),
            volBuy: document.getElementById(`bank-vol-buy-${id}`),
            volSell: document.getElementById(`bank-vol-sell-${id}`),
            feeBuy: document.getElementById(`bank-fee-buy-${id}`),
            feeSell: document.getElementById(`bank-fee-sell-${id}`),
            profit: document.getElementById(`bank-profit-${id}`),
            margin: document.getElementById(`bank-margin-${id}`),
            // Elementos de la nueva barra triple
            barRecompra: document.getElementById(`bank-bar-recompra-${id}`),
            barComprado: document.getElementById(`bank-bar-comprado-${id}`),
            barProfit: document.getElementById(`bank-bar-profit-${id}`),
            cycleText: document.getElementById(`bank-cycle-text-${id}`)
        };

        // 1. Datos Básicos
        // 1. Datos Básicos
        const fiatBal = b.fiatBalance ?? b.currentCycleFiatRemaining ?? 0;
        const usdtBal = b.usdtBalance ?? b.currentCycleRecoveredUSDT ?? 0;
        const bankProfit = b.profit ?? b.currentCycleProfitUSDT ?? 0;

        if (ui.fiat) ui.fiat.textContent = fVES(fiatBal);
        if (ui.usdt) ui.usdt.textContent = fUSDT(usdtBal);
        if (ui.buy) ui.buy.textContent = b.buyRate || '0.00';
        if (ui.sell) ui.sell.textContent = b.sellRate || '0.00';

        // CORRECCIÓN: Usamos los campos explícitos de Fiat y Fees del backend
        if (ui.volBuy) ui.volBuy.textContent = fVES(b.buyFiat || 0);
        if (ui.volSell) ui.volSell.textContent = fVES(b.sellFiat || 0);

        // Fees
        if (ui.feeBuy) ui.feeBuy.textContent = fUSDT(b.feeBuy || 0);
        if (ui.feeSell) ui.feeSell.textContent = fUSDT(b.feeSell || 0);

        if (ui.profit) ui.profit.textContent = `${fUSDT(bankProfit)} ≈ Profit`;

        // 2. Lógica de la Barra de Ciclo (Tricolor)
        if (ui.barRecompra && ui.barComprado && ui.barProfit) {
            let pRecompra = 0;
            let pComprado = 0;
            let pProfit = 0;
            let pctComprado = 0;

            // CASO A: Datos nuevos (bankBreakdown)
            if (b.currentCycleTotalFiat !== undefined) {
                // Usamos weightedBreakEvenRate para convertir el remanente FIAT a USDT y tener escala común
                // Si no hay tasa, fallback a 1 (no ideal pero evita NaN)
                const rate = b.weightedBreakEvenRate || b.sellRate || 1;

                const fiatRemainingUSD = (b.currentCycleFiatRemaining || 0) / rate;
                const recoveredUSD = b.currentCycleRecoveredUSDT || 0;
                const profitUSD = b.currentCycleProfitUSDT || 0;

                const totalCycleUSD = fiatRemainingUSD + recoveredUSD + profitUSD;

                if (totalCycleUSD > 0) {
                    pRecompra = (fiatRemainingUSD / totalCycleUSD) * 100;
                    pComprado = (recoveredUSD / totalCycleUSD) * 100;
                    pProfit = (profitUSD / totalCycleUSD) * 100;
                }

                // El porcentaje de "progreso" o "comprado" puede venir directo
                pctComprado = b.currentCycleProgress || pComprado;

            } else {
                // CASO B: Datos antiguos (Legacy / insights)
                const fiatInUsdt = b.sellRate > 0 ? (b.fiatBalance / b.sellRate) : 0;
                const usdtActual = b.usdtBalance || 0;
                const profitActual = b.profit || 0;
                const totalCycle = fiatInUsdt + usdtActual + profitActual;

                if (totalCycle > 0) {
                    pRecompra = Math.max(0, (fiatInUsdt / totalCycle) * 100);
                    pComprado = Math.max(0, (usdtActual / totalCycle) * 100);
                    pProfit = Math.max(0, (profitActual / totalCycle) * 100);
                }
                pctComprado = pComprado;
            }

            ui.barRecompra.style.width = `${Math.max(0, pRecompra)}%`;
            ui.barComprado.style.width = `${Math.max(0, pComprado)}%`;
            ui.barProfit.style.width = `${Math.max(0, pProfit)}%`;

            if (ui.cycleText) {
                ui.cycleText.textContent = `${Math.round(pctComprado)}% Comprado`;
            }
        }

        // 3. Margen y Colores
        if (ui.margin) {
            ui.margin.textContent = `${b.margin || 0}%`;
            const container = ui.margin.parentElement;
            if (b.margin >= 0) {
                container.className = 'text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400';
            } else {
                container.className = 'text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-400';
            }
        }
    });
}