// src/scripts/investor-logic.js

/**
 * Formateador de moneda USDT
 */
const fUSDT = (val) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
}).format(val);

const fPercent = (val) => new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2
}).format(val / 100);

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
 */
export async function updateInvestorDashboard(API_BASE, token) {
    try {
        const res = await fetch(`${API_BASE}/api/kpis`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401 || res.status === 403) throw new Error('SESIÓN EXPIRADA');
        if (res.status >= 500) throw new Error('ERROR DE SERVIDOR');
        if (!res.ok) throw new Error(`ERROR ${res.status}`);

        const data = await res.json();

        // Inicializar variables con valores por defecto
        let equityTotal = 0;
        let capitalBaseInversor = 0;
        let gananciaNetaInversor = 0;
        let totalRoi = 0;

        // Nuevos campos
        let participationRatio = 0;
        let poolTotal = 0;
        let grossProfit = 0;
        let platformFee = 0;
        let history = [];
        let monthlyPerformance = [];

        // --- LÓGICA ROL INVESTOR ---
        if (data.role === 'investor' && data.investorHub) {
            const hub = data.investorHub;

            equityTotal = Number(hub.equity || 0);
            capitalBaseInversor = Number(hub.capital || 0);
            gananciaNetaInversor = Number(hub.profit || 0);

            // Mapeo exacto basado en JSON real
            poolTotal = Number(hub.totalPoolCapital || hub.poolTotal || 0);
            participationRatio = Number(hub.participationRatio || 0);

            grossProfit = Number(hub.grossProfit || 0);
            platformFee = Number(hub.platformFee || 0);

            history = hub.history || [];

            // Mapear monthlyPerformance para que coincida con lo que espera la tabla (netProfit, fee)
            monthlyPerformance = (hub.monthlyPerformance || []).map(m => ({
                month: m.month,
                grossProfit: m.grossProfit,
                fee: m.platformFee,     // JSON usa platformFee, Componente usa fee
                netProfit: m.profit,    // JSON usa profit, Componente usa netProfit
                roi: m.roi
            }));
        }
        // --- FALLBACK LEGACY ---
        else {
            const summary = data.metrics || data.summary || {};
            // Valores por defecto para evitar NaN visuales
            poolTotal = 0;
            participationRatio = 0;
        }

        // Cálculo de ROI (Si viene del backend usamos ese, si no lo calculamos)
        // El JSON indica que 'roi' viene en el objeto root del hub, usémoslo si existe
        if (data.investorHub && data.investorHub.roi !== undefined) {
            totalRoi = Number(data.investorHub.roi);
        } else {
            totalRoi = capitalBaseInversor > 0
                ? ((gananciaNetaInversor / capitalBaseInversor) * 100)
                : 0;
        }


        // --- 2. INYECCIÓN EN EL DOM ---

        // Nombre
        try {
            const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
            const name = userInfo.name || userInfo.alias || 'Inversionista';
            inject('inv-name', name);
        } catch (e) { }

        // --- KPIs Principales ---
        inject('inv-base-deposit', fUSDT(capitalBaseInversor));
        inject('inv-capital-total', fUSDT(equityTotal));
        inject('inv-profit-neto', `+${fUSDT(gananciaNetaInversor)}`);
        inject('inv-roi', fPercent(totalRoi));

        // --- Transparencia ---
        inject('inv-pool-total', fUSDT(poolTotal));
        inject('inv-pool-total-text', fUSDT(poolTotal)); // Text version in paragraph
        inject('inv-participation-ratio', fPercent(participationRatio * 100)); // Ring text
        inject('inv-participation-percent', fPercent(participationRatio * 100)); // Paragraph text
        inject('inv-gross-profit', fUSDT(grossProfit));
        inject('inv-platform-fee', `-${fUSDT(platformFee)}`);
        inject('inv-net-profit-breakdown', fUSDT(gananciaNetaInversor));

        // Actualizar visuales complejas (Ring y Barra)
        const ringStroke = document.getElementById('inv-ring-stroke');
        if (ringStroke) {
            // Circumference r=40 is ~251.2
            const circumference = 251.2;
            // stroke-dasharray: [length of dash, length of gap]
            // We want the dash to represent the percentage.
            const dashLength = circumference * participationRatio;

            ringStroke.classList.remove('opacity-0');
            ringStroke.setAttribute('stroke-dasharray', `${dashLength} ${circumference}`);
        }

        const barWidth = document.getElementById('inv-bar-width');
        if (barWidth) {
            barWidth.style.width = `${participationRatio * 100}%`;
        }

        // --- Gráficos y Tablas ---
        if (window.updateInvestorChartData) {
            window.updateInvestorChartData(history);
        }

        if (window.updateInvestorTable) {
            window.updateInvestorTable(monthlyPerformance);
        }

        // --- Estado ---
        const statusEl = document.getElementById('inv-status');
        if (statusEl) {
            statusEl.textContent = "CONECTADO A BINANCE";
            statusEl.classList.remove('animate-pulse', 'text-red-500', 'text-gray-500');
            statusEl.classList.add('text-emerald-500');
        }

    } catch (err) {
        console.error("Error en Portal Inversionista:", err);
        const statusEl = document.getElementById('inv-status');
        if (statusEl) {
            const msg = (err.message === 'SESIÓN EXPIRADA' || err.message === 'ERROR DE SERVIDOR')
                ? err.message
                : "ERROR DE CONEXIÓN";
            statusEl.textContent = msg;
            statusEl.classList.remove('animate-pulse', 'text-emerald-500');
            statusEl.classList.add('text-red-500');
        }
    }
}