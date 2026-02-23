import { fUSDT, inject } from './utils.js';

// Module state
let dailyProfitBase = 0;
let dailyVolBase = 0;
let projections = {};
let confidenceBase = 0;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function toSafeNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function parseYmdToUtc(dateYmd) {
    const text = String(dateYmd || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const [y, m, d] = text.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(Date.UTC(y, m - 1, d));
}

function getRangeDays(range = {}) {
    const from = parseYmdToUtc(range?.from);
    const to = parseYmdToUtc(range?.to);
    if (!from || !to) return 0;
    const diff = Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;
    return diff > 0 ? diff : 0;
}

function computeBaseConfidence(operations, rangeDays) {
    const buyCount = toSafeNumber(operations?.buys?.count);
    const sellCount = toSafeNumber(operations?.sells?.count);
    const p2pOps = buyCount + sellCount;

    // Sample quality: 40+ p2p ops gets full score
    const sampleScore = clamp(p2pOps / 40, 0, 1);
    // Coverage quality: 14+ days gets full score
    const coverageScore = clamp(rangeDays / 14, 0, 1);
    // Balance quality: balanced buy/sell distribution increases confidence
    const balanceScore = p2pOps > 0
        ? (1 - clamp(Math.abs(buyCount - sellCount) / p2pOps, 0, 1))
        : 0;

    const raw = 45 + (sampleScore * 30) + (coverageScore * 15) + (balanceScore * 10);
    return clamp(raw, 35, 98);
}

function confidenceByHorizon(days) {
    const penaltyMap = { 1: 0, 7: 4, 15: 8, 30: 12 };
    const penalty = penaltyMap[days] ?? clamp(Math.round(days / 3), 0, 16);
    return clamp(confidenceBase - penalty, 25, 98);
}

function renderConfidence(value) {
    const el = document.getElementById('proj-confidence');
    if (!el) return;
    el.textContent = `${toSafeNumber(value).toFixed(1)}%`;
}

export function updateProyeccionesUI(kpis = {}, range = {}) {
    const proj = kpis.projections || {};
    const audit = kpis.audit || {};
    const operations = kpis.operations || {};
    const critical = kpis.critical || {};
    const metrics = kpis.metrics || {};

    projections = {
        7: proj.weeklyProjection,
        15: proj.biweeklyProjection,
        30: proj.monthlyProjection
    };

    // Daily volume base must respect current selected range
    const rangeDays = getRangeDays(range);
    const auditDays = toSafeNumber(audit.periodDays);
    const daysKey = rangeDays > 0 ? rangeDays : (auditDays > 0 ? auditDays : 1);

    // Profit base should match real net profit shown in critical KPIs.
    // This keeps "Proyeccion de Escenarios" aligned with "Profit generado real".
    const rangeNetProfit = toSafeNumber(
        critical.profitTotalUSDT ?? metrics.totalProfit ?? proj.dailyProfit ?? 0
    );
    dailyProfitBase = daysKey > 0 ? (rangeNetProfit / daysKey) : rangeNetProfit;

    const totalVolFromOps = toSafeNumber(operations.totalVolumeUSDT);
    const totalVolFromAudit = toSafeNumber(audit.totalVolume);
    const totalVolKey = totalVolFromOps > 0 ? totalVolFromOps : totalVolFromAudit;

    if (totalVolKey > 0) {
        dailyVolBase = totalVolKey / daysKey;
    } else {
        // Fallback: if projectedVolume comes totalized, normalize by daysKey
        dailyVolBase = toSafeNumber(proj.projectedVolume) / daysKey;
    }

    confidenceBase = computeBaseConfidence(operations, daysKey);

    calculateScenario(1);

    const buttons = document.querySelectorAll('.proj-time-btn');
    buttons.forEach((btn) => {
        btn.onclick = null;

        btn.onclick = () => {
            buttons.forEach((b) => b.classList.remove('active', 'bg-blue-500', 'text-black'));
            buttons.forEach((b) => b.classList.add('bg-white/5', 'text-gray-400'));

            btn.classList.add('active', 'bg-blue-500', 'text-black');
            btn.classList.remove('bg-white/5', 'text-gray-400');

            const days = parseInt(btn.getAttribute('data-days'), 10);
            calculateScenario(days);
        };
    });
}

function calculateScenario(days) {
    // Always project from net daily profit base for consistency with KPI profit cards.
    const totalProfit = dailyProfitBase * days;
    const totalVol = dailyVolBase * days;

    inject('projected-profit-value', fUSDT(totalProfit));

    const volEl = document.getElementById('proj-vol-detail');
    if (volEl) {
        volEl.textContent = fUSDT(totalVol);
    }

    const label = document.getElementById('projection-label');
    if (label) {
        let periodText = '1 dia';
        if (days === 7) periodText = '7 dias';
        if (days === 15) periodText = '15 dias';
        if (days === 30) periodText = '1 mes';
        label.textContent = `Estimado ${periodText}`;
    }

    renderConfidence(confidenceByHorizon(days));
}
