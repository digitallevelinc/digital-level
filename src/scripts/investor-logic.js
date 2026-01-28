// src/scripts/investor-logic.js

/**
 * Formateador de moneda USDT
 */
const fUSDT = (val) => new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: 2 
}).format(val);

/**
 * Inyector de texto seguro en el DOM
 */
const inject = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
};

/**
 * Orquestador de datos para el Portal del Inversionista
 * @param {string} API_BASE - URL de la API
 * @param {string} token - JWT de autenticación
 * @param {number} participationFactor - Porcentaje del pool total (ej: 0.2 para 20%)
 */
export async function updateInvestorDashboard(API_BASE, token, participationFactor = 1.0) {
    try {
        const res = await fetch(`${API_BASE}/api/kpis`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) throw new Error('Error en la respuesta de API');
        
        const data = await res.json();
        
        // Normalización de la estructura de datos según tu API
        const summary = data.metrics || data.summary || data || {};

        // --- 1. CÁLCULO DE PARTICIPACIÓN ---
        // Capital bruto proporcional al pool total
        const capitalBaseInversor = (summary.totalBalance || 0) * participationFactor;
        
        // Profit bruto proporcional
        const profitBrutoProporcional = (summary.totalProfit || 0) * participationFactor;
        
        // Profit Neto Inversor: Se descuenta el 10% de fondo operativo
        const gananciaNetaInversor = profitBrutoProporcional * 0.90; 

        // Equity Total: Lo que el inversor tiene realmente (Capital + Ganancia)
        const equityTotal = capitalBaseInversor + gananciaNetaInversor;

        // --- 2. INYECCIÓN EN EL DOM ---
        
        // Card Principal: Equity (Grande) y Capital Base (Pequeño)
        inject('inv-capital-total', fUSDT(equityTotal));      
        inject('inv-base-deposit', fUSDT(capitalBaseInversor)); 

        // Card de Ganancias: El 90% del profit que le corresponde
        inject('inv-profit-neto', fUSDT(gananciaNetaInversor));
        
        // Cálculo de ROI: Basado en el capital base invertido
        const roi = capitalBaseInversor > 0 
            ? ((gananciaNetaInversor / capitalBaseInversor) * 100).toFixed(2) 
            : "0.00";
        inject('inv-roi', `${roi}%`);

        // --- 3. ESTADO DEL SISTEMA ---
        const statusEl = document.getElementById('inv-status');
        if (statusEl) {
            statusEl.textContent = "CONECTADO A BINANCE";
            statusEl.classList.replace('text-gray-500', 'text-emerald-500');
        }

        // Actualización del Gráfico (si existe la función global)
        if (window.updateInvestorChart) {
            window.updateInvestorChart(equityTotal);
        }

    } catch (err) {
        console.error("Error en Portal Inversionista:", err);
        const statusEl = document.getElementById('inv-status');
        if (statusEl) {
            statusEl.textContent = "ERROR DE SINCRONIZACIÓN";
            statusEl.classList.replace('text-emerald-500', 'text-red-500');
        }
    }
}