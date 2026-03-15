// src/scripts/investor-logic.js

/**
 * Formateador de moneda USDT
 */
const fUSDT = (val) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
}).format(val);

const fSignedUSDT = (val) => `${val >= 0 ? '+' : '-'}${fUSDT(Math.abs(val))}`;

const fPercent = (val) => new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2
}).format(val / 100);

const parseDateSafe = (value) => {
    if (!value) return null;

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
    }

    if (typeof value === 'string') {
        const raw = value.trim();
        if (!raw) return null;

        const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (ymd) {
            const [, y, m, d] = ymd;
            return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
        }

        const ym = raw.match(/^(\d{4})-(\d{2})$/);
        if (ym) {
            const [, y, m] = ym;
            return new Date(Date.UTC(Number(y), Number(m) - 1, 1));
        }
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const fStartDate = (value) => {
    const parsed = parseDateSafe(value);
    if (!parsed) return 'SIN FECHA';

    return new Intl.DateTimeFormat('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC'
    }).format(parsed).replace('.', '').toUpperCase();
};

const resolveInvestorStartDate = (hub = {}) => {
    const explicitDate = hub.startDate || hub.start_date || hub.investorSince || hub.fechaInicio;
    if (explicitDate) return explicitDate;

    const historyDates = (hub.history || [])
        .map((point) => parseDateSafe(point?.date))
        .filter(Boolean)
        .sort((a, b) => a.getTime() - b.getTime());

    if (historyDates.length > 0) return historyDates[0];

    const monthlyDates = (hub.monthlyPerformance || [])
        .map((point) => parseDateSafe(point?.month))
        .filter(Boolean)
        .sort((a, b) => a.getTime() - b.getTime());

    return monthlyDates.length > 0 ? monthlyDates[0] : null;
};

/**
 * Inyector de texto seguro en el DOM
 */
const inject = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
};

const sessionStore = window.sessionStorage;

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
        let commissionPercentage = 0;
        let history = [];
        let monthlyPerformance = [];
        let investorStartDate = null;

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
            commissionPercentage = Number(hub.commissionPercentage || 0);

            history = (hub.history || []).map((point) => {
                const equity = Number(point.equity || 0);
                const profit = Number(point.profit || 0);
                const gross = Number(point.grossProfit || 0);
                const capitalPoint = Number(point.capital ?? (equity - profit) ?? capitalBaseInversor);

                return {
                    date: point.date,
                    equity,
                    profit,
                    grossProfit: gross,
                    cycles: Number(point.cycles || 0),
                    fees: Number((point.platformFee ?? (gross - profit)).toFixed(2)),
                    capital: Number(capitalPoint.toFixed(2))
                };
            });

            // Mapear monthlyPerformance para que coincida con lo que espera la tabla (netProfit, fee)
            monthlyPerformance = (hub.monthlyPerformance || []).map(m => ({
                month: m.month,
                grossProfit: m.grossProfit,
                fee: m.platformFee,     // JSON usa platformFee, Componente usa fee
                netProfit: m.profit,    // JSON usa profit, Componente usa netProfit
                roi: m.roi
            }));

            investorStartDate = resolveInvestorStartDate(hub);
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
            const userInfo = JSON.parse(sessionStore.getItem('user_info') || '{}');
            const name = userInfo.name || userInfo.alias || 'Inversionista';
            inject('inv-name', name);
        } catch (e) { }
        inject('inv-start-date', fStartDate(investorStartDate));

        // --- KPIs Principales ---
        inject('inv-base-deposit', fUSDT(capitalBaseInversor));
        inject('inv-capital-total', fUSDT(equityTotal));
        inject('inv-profit-neto', fSignedUSDT(gananciaNetaInversor));
        inject('inv-roi', fPercent(totalRoi));

        // --- Transparencia ---
        inject('inv-pool-total', fUSDT(poolTotal));
        inject('inv-pool-total-text', fUSDT(poolTotal)); // Text version in paragraph
        inject('inv-participation-ratio', fPercent(participationRatio * 100)); // Ring text
        inject('inv-participation-percent', fPercent(participationRatio * 100)); // Paragraph text
        inject('inv-gross-profit', fUSDT(grossProfit));
        inject('inv-platform-fee', `-${fUSDT(platformFee)}`);
        inject('inv-commission-rate', fPercent(commissionPercentage));
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
