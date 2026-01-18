import { inject } from './utils.js';

export function updateTasaUI(kpis = {}) {
    /** * MANTENEMOS TU LÓGICA DE CÁLCULO ORIGINAL:
     * Tasa Mínima = Precio Venta - Comisiones
     */
    
    // 1. Extraemos los datos igual que en tu código original
    const summary = kpis.metrics || kpis.summary || {};
    const globalBreakeven = summary.minBuyRate || 0;

    // Inyectamos el valor global sin alterar el cálculo
    inject('global-breakeven', globalBreakeven.toFixed(2));

    // 2. Lista de Bancos (Usamos bankInsights tal cual viene del backend)
    const bankInsights = kpis.bankInsights || [];

    // Colores originales
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
        // Renderizamos usando map sobre bankInsights (tu misma fuente de datos)
        listContainer.innerHTML = bankInsights.map(bank => {
            const name = bank.bank || bank.name || 'Desconocido';
            const color = bankColors[name] || '#F3BA2F';
            
            // USAMOS TU MISMA VARIABLE DE TASA REAL
            const rate = bank.buyRate || 0;

            // ÚNICO CAMBIO: Estructura visual de "banquito" (Grid de 2 columnas)
            return `
            <div class="bg-black/40 p-2 rounded-lg border border-white/5 flex flex-col items-center justify-center transition-all hover:border-orange-500/30">
                <div class="flex items-center gap-1.5 w-full justify-center mb-1">
                    <span class="w-1 h-2.5 rounded-full" style="background-color: ${color}"></span>
                    <span class="text-[9px] font-bold text-gray-400 uppercase truncate">${name}</span>
                </div>
                <div class="flex items-baseline gap-0.5">
                    <span class="text-[13px] font-mono font-black text-orange-400">
                        ${rate.toFixed(2)}
                    </span>
                    <span class="text-[7px] text-gray-600 font-bold uppercase italic tracking-tighter">v</span>
                </div>
            </div>
            `;
        }).join('');
    }
}