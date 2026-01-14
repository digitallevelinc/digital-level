// src/scripts/dashboard/tasa.js
import { inject } from './utils.js';

export function updateTasaUI(kpis = {}) {
    /**
     * LÓGICA DE CÁLCULO:
     * Tasa Mínima = Precio Venta - Comisiones
     * (Si compras por ARRIBA de este resultado, pierdes dinero)
     */

    // 1. Tasa Mínima Global (Min Buy Rate del Backend)
    const summary = kpis.metrics || kpis.summary || {};
    // La tasa minima de compra es aquella que el backend calcula. Si compras mas caro que esto, pierdes.
    const globalBreakeven = summary.minBuyRate || 0;

    inject('global-breakeven', globalBreakeven.toFixed(2));

    // 2. Lista de Bancos (Usamos bankInsights)
    // bankInsights ya trae "buyRate" que es el promedio ponderado de compra
    const bankInsights = kpis.bankInsights || [];

    // Colores para bancos
    const bankColors = {
        'Banesco': '#00aa44',
        'Mercantil': '#1d4ed8',
        'Provincial': '#004481',
        'Bancamiga': '#00b386',
        'PagoMovil': '#facc15',
        'BANK': '#6b7280'
    };

    const listContainer = document.getElementById('bank-rates-list');
    if (listContainer) {
        listContainer.innerHTML = bankInsights.map(bank => {
            const name = bank.bank || bank.name || 'Desconocido';
            const color = bankColors[name] || '#F3BA2F';
            // Mostramos la tasa de compra real del banco
            const rate = bank.buyRate || 0;

            return `
            <div class="flex justify-between items-center leading-tight py-1">
                <div class="flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full" style="background-color: ${color}"></span>
                    <span class="text-[9px] font-bold text-gray-400">${name}</span>
                </div>
                <div class="flex items-baseline gap-1">
                    <span class="text-[10px] font-mono font-bold text-orange-400">${rate.toFixed(2)}</span>
                    <span class="text-[7px] text-gray-600 font-bold uppercase">ves</span>
                </div>
            </div>
            `;
        }).join('');
    }
}