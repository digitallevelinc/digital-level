// src/scripts/dashboard/bancos.js
import { fUSDT, fVES } from './utils.js';

export function updateBancosUI(insights = []) {
    if (!insights) return;

    insights.forEach(b => {
        const id = b.bank.toLowerCase().split(' ')[0].replace(/\s+/g, '');

        const ui = {
            fiat: document.getElementById(`bank-fiat-${id}`),
            usdt: document.getElementById(`bank-usdt-${id}`),
            buy: document.getElementById(`bank-buy-${id}`),
            sell: document.getElementById(`bank-sell-${id}`),
            // Nuevos campos de volumen
            volBuy: document.getElementById(`bank-vol-buy-${id}`),
            volSell: document.getElementById(`bank-vol-sell-${id}`),
            // Fees
            feeBuy: document.getElementById(`bank-fee-buy-${id}`),
            feeSell: document.getElementById(`bank-fee-sell-${id}`),
            profit: document.getElementById(`bank-profit-${id}`),
            margin: document.getElementById(`bank-margin-${id}`)
        };

        if (ui.fiat) ui.fiat.textContent = fVES(b.fiatBalance);
        if (ui.usdt) ui.usdt.textContent = fUSDT(b.usdtBalance || 0);
        if (ui.buy) ui.buy.textContent = b.buyRate || '0.00';
        if (ui.sell) ui.sell.textContent = b.sellRate || '0.00';
        
        // Volumen transaccionado por banco
        if (ui.volBuy) ui.volBuy.textContent = fUSDT(b.volumeBuy || 0);
        if (ui.volSell) ui.volSell.textContent = fUSDT(b.volumeSell || 0);

        if (ui.feeBuy) ui.feeBuy.textContent = fUSDT(b.feeBuy || 0);
        if (ui.feeSell) ui.feeSell.textContent = fUSDT(b.feeSell || 0);
        if (ui.profit) ui.profit.textContent = `${fUSDT(b.profit)} ≈ Profit`;
        
        if (ui.margin) {
            ui.margin.textContent = `${b.margin || 0}%`;
            // Cambiamos el color al padre (el span que contiene "Margen")
            const container = ui.margin.parentElement;
            if (b.margin >= 0) {
                container.className = 'text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400';
            } else {
                container.className = 'text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-400';
            }
        }
    });
}