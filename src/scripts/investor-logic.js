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

        if (res.status === 401 || res.status === 403) {
            throw new Error('SESIÓN EXPIRADA');
        }

        if (res.status >= 500) {
            throw new Error('ERROR DE SERVIDOR');
        }

        if (!res.ok) throw new Error(`ERROR ${res.status}`);

        const data = await res.json();

        let equityTotal = 0;
        let capitalBaseInversor = 0;
        let gananciaNetaInversor = 0;

        // --- NUEVA LÓGICA (Rol Investor) ---
        if (data.role === 'investor' && data.investorHub) {
            const hub = data.investorHub;
            equityTotal = Number(hub.equity || 0);
            capitalBaseInversor = Number(hub.capital || 0);
            gananciaNetaInversor = Number(hub.profit || 0);
            // El ROI ya viene calculado o lo recalculamos si preferimos consistencia
        }
        // --- FALLBACK LEGACY (Por si acaso) ---
        else {
            const summary = data.metrics || data.summary || data || {};
            capitalBaseInversor = (summary.totalBalance || 0) * participationFactor;
            const profitBrutoProporcional = (summary.totalProfit || 0) * participationFactor;
            gananciaNetaInversor = profitBrutoProporcional * 0.90;
            equityTotal = capitalBaseInversor + gananciaNetaInversor;
        }

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
            statusEl.classList.remove('animate-pulse', 'text-red-500', 'text-gray-500');
            statusEl.classList.add('text-emerald-500');
        }

        // Actualización del Gráfico (si existe la función global)
        if (window.updateInvestorChart) {
            window.updateInvestorChart(equityTotal);
        }

    } catch (err) {
        console.error("Error en Portal Inversionista:", err);
        const statusEl = document.getElementById('inv-status');
        if (statusEl) {
            // Mostrar mensaje específico si es conocido, sino "ERROR DE CONEXIÓN"
            const knownErrors = ['SESIÓN EXPIRADA', 'ERROR DE SERVIDOR'];
            const msg = knownErrors.includes(err.message) ? err.message : "ERROR DE CONEXIÓN";

            statusEl.textContent = msg;
            statusEl.classList.remove('animate-pulse', 'text-emerald-500');
            statusEl.classList.add('text-red-500');
        }
    }
}