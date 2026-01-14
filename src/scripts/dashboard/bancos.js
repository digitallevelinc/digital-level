import { fUSDT, fVES } from './utils.js';

export function updateBancosUI(insights = []) {
    if (!insights) return;

    insights.forEach(b => {
        const id = b.bank.toLowerCase().split(' ')[0].replace(/\s+/g, '');

        const ui = {
            fiat: document.getElementById(`bank-fiat-${id}`),
            usdt: document.getElementById(`bank-usdt-${id}`),
            sell: document.getElementById(`bank-sell-${id}`),
            buy: document.getElementById(`bank-buy-${id}`),
            volSell: document.getElementById(`bank-vol-sell-${id}`),
            volBuy: document.getElementById(`bank-vol-buy-${id}`),
            feeSell: document.getElementById(`bank-fee-sell-${id}`),
            feeBuy: document.getElementById(`bank-fee-buy-${id}`),
            profit: document.getElementById(`bank-profit-${id}`),
            margin: document.getElementById(`bank-margin-${id}`),
            barRecompra: document.getElementById(`bank-bar-recompra-${id}`),
            barComprado: document.getElementById(`bank-bar-comprado-${id}`),
            barProfit: document.getElementById(`bank-bar-profit-${id}`),
            cycleText: document.getElementById(`bank-cycle-text-${id}`)
        };

        // 1. Cálculos de Fees y Profit Neto
        const totalFees = (b.feeBuy || 0) + (b.feeSell || 0);
        const netProfit = (b.profit || 0) - totalFees;

        // 2. Datos Básicos y Balances
        if (ui.fiat) ui.fiat.textContent = fVES(b.fiatBalance);
        if (ui.usdt) ui.usdt.textContent = fUSDT(b.usdtBalance || 0);
        
        // Tasas (Promedio Ponderado)
        if (ui.sell) ui.sell.textContent = b.sellRate || '0.00';
        if (ui.buy) ui.buy.textContent = b.buyRate || '0.00';
        
        // --- CORRECCIÓN DE VOLÚMENES FIAT ---
        // Si el backend no envía 'volumeSellFiat', lo calculamos: Vol USDT * Tasa
        const volSellFiat = b.volumeSellFiat || (b.volumeSell * b.sellRate) || 0;
        const volBuyFiat = b.volumeBuyFiat || (b.volumeBuy * b.buyRate) || 0;

        if (ui.volSell) ui.volSell.textContent = fVES(volSellFiat);
        if (ui.volBuy) ui.volBuy.textContent = fVES(volBuyFiat);
        
        // Los Fees sí se mantienen en USDT usualmente para el cálculo del profit
        if (ui.feeSell) ui.feeSell.textContent = fUSDT(b.feeSell || 0);
        if (ui.feeBuy) ui.feeBuy.textContent = fUSDT(b.feeBuy || 0);
        
        if (ui.profit) ui.profit.textContent = `${fUSDT(netProfit)} ≈ Profit`;

        // 3. Lógica de la Barra de Ciclo (Mejorada para reflejar el progreso real)
        if (ui.barRecompra && ui.barComprado && ui.barProfit) {
            const fiatInUsdt = b.sellRate > 0 ? (b.fiatBalance / b.sellRate) : 0;
            const usdtActual = b.usdtBalance || 0;
            const profitActual = netProfit > 0 ? netProfit : 0; 

            // El total del ciclo es lo que tengo para comprar + lo que ya compré + mi ganancia
            const totalCycle = fiatInUsdt + usdtActual + profitActual;

            if (totalCycle > 0) {
                const pRecompra = (fiatInUsdt / totalCycle) * 100;
                const pComprado = (usdtActual / totalCycle) * 100;
                const pProfit = (profitActual / totalCycle) * 100;

                ui.barRecompra.style.width = `${pRecompra}%`;
                ui.barComprado.style.width = `${pComprado}%`;
                ui.barProfit.style.width = `${pProfit}%`;

                if (ui.cycleText) {
                    // Si el balance fiat es casi cero, mostramos que el ciclo está completado
                    const progress = pComprado + pProfit;
                    ui.cycleText.textContent = progress >= 99.5 ? "Completado" : `${Math.round(progress)}%`;
                }
            }
        }
        
        // 4. Margen
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