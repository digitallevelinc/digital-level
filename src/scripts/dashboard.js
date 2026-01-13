// src/scripts/dashboard.js

// 1. IMPORTACIONES UNIFICADAS
import { fUSDT, fVES, inject } from './dashboard/utils.js';
import { updateRedSection } from './dashboard/red.js';
import { updatePaySection } from './dashboard/pay.js';
import { updateSwitchSection } from './dashboard/switch.js';
import { updateP2PSection } from './dashboard/p2p.js';
import { updateFiatSection } from './dashboard/fiat.js';
import { updateCiclosUI } from './dashboard/ciclos.js';
import { updateTasaUI } from './dashboard/tasa.js';
import { updateProfitUI } from './dashboard/profit.js';
import { updateComisionOperadorUI } from './dashboard/comisionOp.js';
import { updateProyeccionesUI } from './dashboard/proyecciones.js'; // <-- NUEVA IMPORTACIÓN

// Módulos refactorizados
import { updateComisionesUI } from './dashboard/comisiones.js';
import { updateOperacionesUI } from './dashboard/operaciones.js';
import { updateBancosUI } from './dashboard/bancos.js';

/**
 * 2. FUNCIÓN DE INICIALIZACIÓN
 */
export async function initDashboard() {
    console.log("Sentinel Dashboard: Sincronizando módulos...");

    const API_BASE = localStorage.getItem('api_base') || 'http://144.91.110.204:3003';
    const token = localStorage.getItem('auth_token') || localStorage.getItem('session_token');
    const alias = localStorage.getItem('operator_alias') || 'Operador';

    if (!token) {
        console.warn("No se encontró token, redirigiendo...");
        window.location.href = '/login';
        return;
    }

    const logoutBtn = document.getElementById('logout-btn');
    logoutBtn?.addEventListener('click', () => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('session_token');
        localStorage.removeItem('operator_alias');
        localStorage.removeItem('api_base');
        window.location.href = '/login';
    });

    let currentRange = getPresetRange('today');
    updateKpiFilterLabel(currentRange.label);
    highlightPreset('today');

    setupKpiFilters((range) => {
        currentRange = range;
        updateKpiFilterLabel(range.label);
        updateDashboard(API_BASE, token, alias, range);
    });

    await updateDashboard(API_BASE, token, alias, currentRange);
    setInterval(() => updateDashboard(API_BASE, token, alias, currentRange), 30000);
}

/**
 * 3. FUNCIÓN DE ACTUALIZACIÓN GLOBAL
 */
export async function updateDashboard(API_BASE, token, alias, range = {}) {
    if (!token) return;

    try {
        const params = new URLSearchParams();
        if (range?.from) params.set('from', range.from);
        if (range?.to) params.set('to', range.to);
        const url = `${API_BASE}/api/kpis${params.toString() ? `?${params.toString()}` : ''}`;

        const kpiRes = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!kpiRes.ok) throw new Error('Fallo en la respuesta de la API');
        const kpis = await kpiRes.json();

        // --- ACTUALIZACIÓN DE MÉTRICAS BASE ---
        updateMainKpis(kpis);
        updateRatesCard(kpis);

        updateComisionesUI(kpis.operations);
        updateOperacionesUI(kpis);

        // --- PANEL DE BANCOS E INSIGHTS ---
        if (kpis.bankInsights) {
            updateBancosUI(kpis.bankInsights);
            updateCiclosUI(kpis);
        }

        // --- MÓDULOS DE ANÁLISIS AVANZADO ---
        updateTasaUI(kpis);             // Tasa mínima de compra
        updateProfitUI(kpis);           // Auditoría de Balances y GAP
        updateComisionOperadorUI(kpis); // Profit neto del usuario (%)
        updateProyeccionesUI(kpis);    // Escenarios 1D, 7D, 15D, 1M

        // --- SECCIONES DE CARTERAS (LOGÍSTICA) ---
        updateRedSection(kpis);
        updatePaySection(kpis);
        updateSwitchSection(kpis);
        updateP2PSection(kpis);
        updateFiatSection(kpis);

        // --- UI ESTADO ---
        const aliasEl = document.getElementById('operator-alias');
        if (aliasEl) aliasEl.textContent = alias;

        const updateEl = document.getElementById('last-update');
        if (updateEl) updateEl.textContent = `Sincronizado: ${new Date().toLocaleTimeString()}`;

    } catch (err) {
        console.error("Error en sincronización de Sentinel:", err);
        const updateEl = document.getElementById('last-update');
        if (updateEl) updateEl.textContent = "Error de conexión con Sentinel";
    }
}

// --- FUNCIONES AUXILIARES DE CÁLCULO ---
function pad(n) { return String(n).padStart(2, '0'); }
function toYmd(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }

function getWeekRange(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diffToMonday = (day === 0 ? -6 : 1 - day);
    const start = new Date(d);
    start.setDate(d.getDate() + diffToMonday);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: toYmd(start), to: toYmd(end) };
}

function getPresetRange(preset) {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    switch (preset) {
        case 'today': return { label: 'Hoy', from: toYmd(today), to: toYmd(today) };
        case 'this_week': { const r = getWeekRange(today); return { label: 'Esta semana', ...r }; }
        case 'last_7': {
            const from = new Date(today);
            from.setDate(today.getDate() - 6);
            return { label: 'Últimos 7 días', from: toYmd(from), to: toYmd(today) };
        }
        case 'this_month': return { label: 'Mes actual', from: toYmd(startOfMonth), to: toYmd(today) };
        case 'last_30': {
            const from = new Date(today);
            from.setDate(today.getDate() - 29);
            return { label: 'Últimos 30 días', from: toYmd(from), to: toYmd(today) };
        }
        case 'ytd': return { label: 'YTD', from: toYmd(startOfYear), to: toYmd(today) };
        case 'all': return { label: 'Todo', from: undefined, to: undefined };
        default: return { label: 'Personalizado' };
    }
}

function setupKpiFilters(onApply) {
    const presetGroup = document.getElementById('kpi-preset-group');
    const fromEl = document.getElementById('kpi-date-from');
    const toEl = document.getElementById('kpi-date-to');
    const applyBtn = document.getElementById('kpi-apply-range');

    presetGroup?.addEventListener('click', (e) => {
        const btn = e.target.closest('.kpi-preset-btn');
        if (!btn) return;
        const preset = btn.getAttribute('data-preset');
        const range = getPresetRange(preset);
        if (range.from) fromEl && (fromEl.value = range.from);
        if (range.to) toEl && (toEl.value = range.to);
        highlightPreset(preset);
        onApply(range);
    });

    applyBtn?.addEventListener('click', () => {
        const from = fromEl?.value || undefined;
        const to = toEl?.value || undefined;
        highlightPreset('custom');
        onApply({ label: 'Personalizado', from, to });
    });
}

function updateKpiFilterLabel(label) {
    const el = document.getElementById('kpi-filter-label');
    if (el) el.textContent = `Rango activo: ${label || 'Hoy'}`;
}

function highlightPreset(preset) {
    const group = document.getElementById('kpi-preset-group');
    if (!group) return;
    group.querySelectorAll('.kpi-preset-btn').forEach(btn => {
        const isActive = btn.getAttribute('data-preset') === preset;
        btn.classList.toggle('border-[#F3BA2F]', isActive);
        btn.classList.toggle('bg-[#F3BA2F]/10', isActive);
    });
}

function pct(value) {
    const num = Number(value ?? 0);
    return `${num.toFixed(2)}%`;
}

function updateMainKpis(kpis = {}) {
    const summary = kpis.metrics || kpis.kpis || kpis.summary || {};
    inject('kpi-balance', fUSDT(summary.totalBalance ?? summary.balance ?? 0));
    inject('kpi-breakeven', summary.minBuyRate ? pct(summary.minBuyRate) : (summary.breakEven ? pct(summary.breakEven) : '---'));
    inject('kpi-margin', summary.globalMarginPct !== undefined ? pct(summary.globalMarginPct) : '---', true);
    inject('kpi-profit', fUSDT(summary.totalProfit ?? summary.profit ?? 0), true);
    inject('kpi-cycle', fUSDT(summary.cycleProfit ?? summary.cycleGain ?? 0), true);
}

function updateRatesCard(kpis = {}) {
    const rates = kpis.rates || kpis.market || {};
    const buy = rates.buyRate ?? rates.buy ?? null;
    const sell = rates.sellRate ?? rates.sell ?? null;
    const label = (buy || sell) ? `${buy ?? '---'} / ${sell ?? '---'}` : '---';
    inject('ops-rates', label);
}