import { fUSDT, fVES } from './utils.js';

export function updateBancosUI(insights = []) {
    if (!insights || insights.length === 0) return;

    insights.forEach(b => {
        const id = b.id || b.bank?.toLowerCase().replace(/\s+/g, '-') || 'unknown';

        const ui = {
            fiat: document.getElementById(`bank-fiat-${id}`),
            usdt: document.getElementById(`bank-usdt-${id}`),
            breakeven: document.getElementById(`bank-breakeven-${id}`),
            ideal: document.getElementById(`bank-ideal-${id}`),
            beInfo: document.getElementById(`bank-be-info-${id}`),
            sell: document.getElementById(`bank-sell-${id}`),
            buy: document.getElementById(`bank-buy-${id}`),
            volSell: document.getElementById(`bank-vol-sell-${id}`),
            volBuy: document.getElementById(`bank-vol-buy-${id}`),
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

        // --- EXTRACCIÓN DE TASAS PONDERADAS ---
        const sellRate = Number(b.sellRate || 0); 
        const buyRate = Number(b.buyRate || 0); // Costo real ponderado
        const fiatBalance = Number(b.fiatBalance || 0);
        const usdtBalance = Number(b.usdtBalance || 0);
        const nVentas = Number(b.countSell || b.sellCount || 0);
        const nCompras = Number(b.countBuy || b.buyCount || 0);

        // --- LÓGICA DE RANGO DE ARBITRAJE ---
        const tasaTecho = sellRate * 0.995; // Techo Crítico (-0.5%)
        const tasaIdeal = sellRate * 0.990; // Zona de Profit (-1.0%)

        if (ui.breakeven) {
            ui.breakeven.textContent = tasaTecho.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        if (ui.ideal) {
            ui.ideal.textContent = tasaIdeal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        // --- SEMÁFORO DE ESTADO ---
        if (ui.beInfo) {
            if (buyRate > tasaTecho && buyRate > 0) {
                ui.beInfo.textContent = "⚠️ PERDIDA";
                ui.beInfo.className = "text-[7px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-500 font-bold animate-pulse";
                if (ui.breakeven) ui.breakeven.className = "text-[17px] font-black text-rose-500";
            } 
            else if (buyRate <= tasaTecho && buyRate > tasaIdeal) {
                ui.beInfo.textContent = "⚖️ LIMITE";
                ui.beInfo.className = "text-[7px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-500 font-bold";
                if (ui.breakeven) ui.breakeven.className = "text-[17px] font-black text-white";
                if (ui.ideal) ui.ideal.className = "text-[17px] font-black text-white";
            }
            else if (buyRate <= tasaIdeal && buyRate > 0) {
                ui.beInfo.textContent = "💎 OPTIMO";
                ui.beInfo.className = "text-[7px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 font-bold";
                if (ui.ideal) ui.ideal.className = "text-[17px] font-black text-emerald-400";
            }
        }

        // --- BALANCES ---
        if (ui.fiat) ui.fiat.textContent = fVES(fiatBalance);
        if (ui.usdt) ui.usdt.textContent = fUSDT(usdtBalance).replace('USDT', '');

        // --- TASAS Y VOLÚMENES ---
        if (ui.sell) ui.sell.textContent = sellRate.toFixed(2);
        if (ui.buy) ui.buy.textContent = buyRate.toFixed(2);
        const vSellFiat = Number(b.volumeSellFiat || (nVentas > 0 ? (b.volumeSell * sellRate) : 0));
        const vBuyFiat = Number(b.volumeBuyFiat || (nCompras > 0 ? (b.volumeBuy * buyRate) : 0));
        if (ui.volSell) ui.volSell.textContent = fVES(vSellFiat);
        if (ui.volBuy) ui.volBuy.textContent = fVES(vBuyFiat);

        // --- PROFIT NETO ---
        const totalFees = Number(b.feeBuy || 0) + Number(b.feeSell || 0);
        const netProfit = Number(b.profit || 0) - totalFees;
        if (ui.profit) {
            ui.profit.textContent = `${fUSDT(netProfit)} ≈ Profit`;
            ui.profit.className = `font-mono text-[14px] font-bold italic ${netProfit >= 0 ? 'text-[#F3BA2F]' : 'text-rose-500'}`;
        }

        // --- BARRA DE CICLO ---
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
                    const isClosed = fiatBalance < 50 && nVentas > 0;
                    ui.cycleText.textContent = isClosed ? "Completado" : `${progress}%`;
                }
            }
        }

        // --- OPERACIONES Y PODER RECOMPRA ---
        if (ui.margin) ui.margin.textContent = `${Number(b.margin || 0).toFixed(2)}%`;
        if (ui.opsCount) {
            const totalOps = nVentas + nCompras;
            ui.opsCount.textContent = `${totalOps} / 1k`;
            ui.opsCount.className = `font-mono text-[12px] font-bold ${totalOps >= 800 ? 'text-rose-500 animate-pulse' : totalOps >= 500 ? 'text-orange-400' : 'text-emerald-400'}`;
        }
        if (ui.buyingPower) {
            const power = buyRate > 0 ? (fiatBalance / buyRate) : 0;
            ui.buyingPower.textContent = `≈ ${fUSDT(power)}`;
        }
        if (ui.ctot) ui.ctot.textContent = nVentas;
    });
}