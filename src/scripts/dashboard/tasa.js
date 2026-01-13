// src/scripts/dashboard/tasa.js
import { inject } from './utils.js';

export function updateTasaUI(kpis = {}) {
    /**
     * LÓGICA DE CÁLCULO:
     * Tasa Mínima = Precio Venta - Comisiones
     * (Si compras por ARRIBA de este resultado, pierdes dinero)
     */

    // 1. Precio al que se está vendiendo en el mercado P2P actualmente
    const rates = kpis.rates || {};
    const precioVentaP2P = rates.sellRate || 0;

    // 2. Definición de bancos con sus comisiones (Binance + Banco)
    // Ejemplo: 0.01 es 1% de comisión total
    const configuracionBancos = [
        { name: 'Banesco', comision: 0.009, color: '#00aa44' },    // 0.9% total
        { name: 'Mercantil', comision: 0.012, color: '#1d4ed8' },  // 1.2% total
        { name: 'Provincial', comision: 0.015, color: '#004481' }   // 1.5% total
    ];

    // 3. Calculamos la tasa de equilibrio para cada banco
    const calculatedRates = configuracionBancos.map(banco => {
        const montoComision = precioVentaP2P * banco.comision;
        const tasaMinima = precioVentaP2P - montoComision;

        return {
            name: banco.name,
            rate: tasaMinima,
            color: banco.color
        };
    });

    // 4. Inyectamos el promedio global en la tarjeta
    const promedioGlobal = calculatedRates.reduce((acc, b) => acc + b.rate, 0) / calculatedRates.length;
    inject('global-breakeven', promedioGlobal.toFixed(2));

    // 5. Renderizamos la lista en el HTML
    const listContainer = document.getElementById('bank-rates-list');
    if (listContainer) {
        listContainer.innerHTML = calculatedRates.map(bank => `
            <div class="flex justify-between items-center leading-tight py-1">
                <div class="flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full" style="background-color: ${bank.color}"></span>
                    <span class="text-[9px] font-bold text-gray-400">${bank.name}</span>
                </div>
                <div class="flex items-baseline gap-1">
                    <span class="text-[10px] font-mono font-bold text-orange-400">${bank.rate.toFixed(2)}</span>
                    <span class="text-[7px] text-gray-600 font-bold uppercase">ves</span>
                </div>
            </div>
        `).join('');
    }
}