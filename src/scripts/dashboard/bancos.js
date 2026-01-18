import { fUSDT, fVES } from './utils.js';

export function updateBancosUI(insights = []) {
    if (!insights || insights.length === 0) return;

    insights.forEach(b => {
        // Normalización segura del ID para conectar con el DOM
        const id = b.bank?.toLowerCase().split(' ')[0].replace(/\s+/g, '') || 'unknown';

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
            cycleText: document.getElementById(`bank-cycle-text-${id}`),
            opsCount: document.getElementById(`bank-ops-count-${id}`),
            buyingPower: document.getElementById(`bank-buying-power-${id}`),
            ctot: document.getElementById(`bank-ctot-${id}`),
            ctotContainer: document.getElementById(`bank-ctot-container-${id}`)
        };

        // --- NORMALIZACIÓN DE DATOS (API FALLBACKS) ---
        // Buscamos todas las variantes posibles de nombres de campos que envía el backend
        const nVentas = Number(b.countSell || b.sellCount || b.operationsSell || 0);
        const nCompras = Number(b.countBuy || b.buyCount || b.operationsBuy || 0);
        const fiatBalance = Number(b.fiatBalance || 0);
        const usdtBalance = Number(b.usdtBalance || 0);
        const totalFees = Number(b.feeBuy || 0) + Number(b.feeSell || 0);
        const netProfit = Number(b.profit || 0) - totalFees;
        const sellRate = Number(b.sellRate || 0);
        const buyRate = Number(b.buyRate || 0);

        // 1. ACTUALIZACIÓN DE BALANCES Y TASAS
        if (ui.fiat) ui.fiat.textContent = fVES(fiatBalance);
        if (ui.usdt) ui.usdt.textContent = fUSDT(usdtBalance);
        if (ui.sell) ui.sell.textContent = sellRate.toFixed(2);
        if (ui.buy) ui.buy.textContent = buyRate.toFixed(2);

        // 2. VOLÚMENES Y FEES
        const vSellFiat = b.volumeSellFiat || (nVentas > 0 ? (b.volumeSell * sellRate) : 0);
        const vBuyFiat = b.volumeBuyFiat || (nCompras > 0 ? (b.volumeBuy * buyRate) : 0);

        if (ui.volSell) ui.volSell.textContent = fVES(vSellFiat);
        if (ui.volBuy) ui.volBuy.textContent = fVES(vBuyFiat);
        if (ui.feeSell) ui.feeSell.textContent = fUSDT(b.feeSell || 0);
        if (ui.feeBuy) ui.feeBuy.textContent = fUSDT(b.feeBuy || 0);

        // 3. HEADER PROFIT
        if (ui.profit) {
            ui.profit.textContent = `${fUSDT(netProfit)} ≈ Profit`;
            ui.profit.className = `font-mono text-[12px] font-bold ${netProfit >= 0 ? 'text-[#F3BA2F]' : 'text-rose-500'}`;
        }

        // 4. LÓGICA DE CICLO Y BARRA
        const isClosed = fiatBalance < 50 && nVentas > 0;

        if (ui.barRecompra && ui.barComprado && ui.barProfit) {
            const fiatInUsdt = sellRate > 0 ? (fiatBalance / sellRate) : 0;
            const profitActual = netProfit > 0 ? netProfit : 0; 
            const totalCycle = fiatInUsdt + usdtBalance + profitActual;

            if (totalCycle > 0) {
                ui.barRecompra.style.width = `${(fiatInUsdt / totalCycle) * 100}%`;
                ui.barComprado.style.width = `${(usdtBalance / totalCycle) * 100}%`;
                ui.barProfit.style.width = `${(profitActual / totalCycle) * 100}%`;

                if (ui.cycleText) {
                    const progress = Math.round(((usdtBalance + profitActual) / totalCycle) * 100);
                    ui.cycleText.textContent = isClosed ? "Completado" : `${progress}%`;
                    ui.cycleText.className = isClosed ? "text-emerald-400 font-bold italic" : "text-[#F3BA2F]";
                }
            }
        }

        // --- 5. CORRECCIÓN C-TOT (Vueltas P2P) ---
        if (ui.ctot) {
            ui.ctot.textContent = nVentas; // Cada venta P2P es un ciclo iniciado
            
            if (ui.ctotContainer) {
                if (isClosed && nVentas > 0) {
                    ui.ctotContainer.className = "flex items-center gap-1.5 bg-emerald-500/20 px-2 py-1 rounded-lg border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)] animate-pulse";
                } else {
                    ui.ctotContainer.className = "flex items-center gap-1.5 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20 shadow-lg";
                }
            }
        }

        // 6. MARGEN
        if (ui.margin) {
            const marginVal = Number(b.margin || 0);
            ui.margin.textContent = `${marginVal.toFixed(2)}%`;
            ui.margin.className = `px-4 py-1.5 rounded-full border text-[11px] font-black ${
                marginVal >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`;
        }

        // --- 7. CORRECCIÓN OPERACIONES (Semáforo 1k) ---
        if (ui.opsCount) {
            const totalOps = nVentas + nCompras;
            ui.opsCount.textContent = `${totalOps} / 1k`;
            
            ui.opsCount.className = "font-mono text-[10px] font-bold";
            if (totalOps >= 800) ui.opsCount.classList.add('text-rose-500', 'animate-pulse');
            else if (totalOps >= 500) ui.opsCount.classList.add('text-orange-400');
            else ui.opsCount.classList.add('text-emerald-400');
        }

        // 8. PODER DE RECOMPRA
        if (ui.buyingPower) {
            const power = buyRate > 0 ? (fiatBalance / buyRate) : 0;
            ui.buyingPower.textContent = `≈ ${fUSDT(power)}`;
        }
    });
}