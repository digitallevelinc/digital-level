// 1. IMPORTACIONES (Preservadas todas tus rutas originales + Sidebar)
import { fUSDT, fVES, inject } from './dashboard/utils.js';
import { updateRedSection } from './dashboard/red.js';
import { updatePaySection } from './dashboard/pay.js';
import { updateSwitchSection } from './dashboard/switch.js';
import { updateP2PSection } from './dashboard/p2p.js';
import { updateFiatSection } from './dashboard/fiat.js';
import { updateCiclosUI } from './dashboard/ciclos.js';
import { updateProfitUI } from './dashboard/profit.js';
import { updateComisionOperadorUI } from './dashboard/comisionOp.js';
import { updateProyeccionesUI } from './dashboard/proyecciones.js';
import { updateComisionesUI } from './dashboard/comisiones.js';
import { updateOperacionesUI } from './dashboard/operaciones.js';
import { updateBancosUI } from './dashboard/bancos.js';
import { updateSidebarMonitor } from './dashboard/SidebarMonitor.js';

/**
 * 2. FUNCIÓN DE INICIALIZACIÓN
 */
export async function initDashboard() {
    console.log("Sentinel Dashboard: Sincronizando módulos...");

    const API_BASE = localStorage.getItem('api_base') || import.meta.env.PUBLIC_API_URL || 'http://localhost:3003';
    const token = localStorage.getItem('auth_token') || localStorage.getItem('session_token');
    const alias = localStorage.getItem('operator_alias') || 'Operador';

    if (!token) {
        console.warn("No se encontró token, redirigiendo...");
        window.location.href = '/login';
        return;
    }

    const logoutBtn = document.getElementById('logout-btn');
    logoutBtn?.addEventListener('click', () => {
        localStorage.clear();
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

    // --- FAVORITES HANDLER (Global connection for Astro onClick) ---
    window.handleToggleFavorite = async (bankName) => {
        console.log(`Toggling favorite for: ${bankName}`);

        // 1. Optimistic Update (Visual Instantánea)
        // Buscamos el ID normalizado para encontrar el botón
        // (Replicamos la lógica de normalización de bancos.js para hallar el botón)
        // NOTA: Para simplificar, haremos un refetch rápido o toggle manual si queremos optimismo puro.
        // Por consistencia, haremos la llamada API y luego updateDashboard.
        // Si queremos optimismo, necesitaríamos acceso al estado 'bankData' global actual.

        try {
            const toggleUrl = `${API_BASE}/api/user/favorites/toggle`;
            const payload = { bankId: bankName }; // El backend espera el nombre o ID

            const res = await fetch(toggleUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (data.success || res.ok) {
                console.log("Favorite toggled successfully. Refreshing...");

                // HYBRID FIX: Save returned favorites to LocalStorage backup
                if (data.favorites && Array.isArray(data.favorites)) {
                    console.log("Saving new favorites to storage:", data.favorites);
                    localStorage.setItem('sentinel_favorites', JSON.stringify(data.favorites));
                }

                // Recargamos datos para ver el cambio de orden y estrella
                await updateDashboard(API_BASE, token, alias, currentRange);
            } else {
                console.error("Error toggling favorite:", data);
            }
        } catch (err) {
            console.error("Network error toggling favorite:", err);
        }
    };

    setInterval(() => updateDashboard(API_BASE, token, alias, currentRange), 30000);
}

/**
 * 3. FUNCIÓN DE ACTUALIZACIÓN GLOBAL (Auditoría de integridad)
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

        if (!kpiRes.ok) {
            console.error(`API Error: ${kpiRes.status} ${kpiRes.statusText}`);
            throw new Error('Fallo en la respuesta de la API');
        }
        const kpis = await kpiRes.json();

        // --- PREPARACIÓN DE DATOS (API V2 - Source of Truth) ---
        const metrics = kpis.metrics || {};

        // La API ya devuelve bankInsights con campos unificados.
        // Mapeamos asegurando que existan los campos raíz o fallback a las sumas si es necesario (aunque el back debería mandarlos).
        const bankData = (kpis.bankInsights || []).map(i => {
            const trf = i.trf || {};
            const pm = i.pm || {};

            return {
                ...i,
                // Balances y Profit (Source of Truth del Root)
                fiatBalance: Number(i.fiatBalance || 0),
                usdtBalance: Number(i.usdtBalance || 0),
                profit: Number(i.profit || 0),

                // Volúmenes Totales Real (USDT) - Preferimos el campo Root calculado por backend
                buyVolUSDT: Number(i.buyVolUSDT || 0),
                sellVolUSDT: Number(i.sellVolUSDT || 0),

                // Fees Totales
                feeBuy: Number(trf.buyFee || 0) + Number(pm.buyFee || 0),
                feeSell: Number(trf.sellFee || 0) + Number(pm.sellFee || 0),

                // Preservamos sub-objetos para detalles
                trf: trf,
                pm: pm
            };
        });

        // --- FALLBACK VISUAL: Asegurar que todos los bancos del DOM tengan datos (aunque sean ceros) ---
        // Lista hardcodeada que debe coincidir con bancos.astro (BBVABank eliminado)
        const defaultBanks = ['Mercantil', 'Banesco', 'BNC', 'BBVA/Provincial', 'Bancamiga', 'BANK'];

        defaultBanks.forEach(dbParams => {
            // Buscamos si ya existe en bankData (normalizando nombres)
            const exists = bankData.find(b => {
                const bId = (b.bank || '').toLowerCase().trim();
                const dbId = dbParams.toLowerCase().trim();
                if (bId === dbId) return true;
                if (dbId.includes('provincial') && bId.includes('provincial')) return true;
                return false;
            });

            if (!exists) {
                bankData.push({
                    bank: dbParams,
                    bankName: dbParams,
                    // Campos Source of Truth (Inicializados en 0)
                    fiatBalance: 0,
                    profit: 0,
                    weightedAvgBuyRate: 0,
                    weightedAvgSellRate: 0,
                    margin: 0,
                    buyVolUSDT: 0,
                    sellVolUSDT: 0,
                    trf: { buyCount: 0, sellCount: 0, buyVol: 0, sellVol: 0, buyFee: 0, sellFee: 0 },
                    pm: { buyCount: 0, sellCount: 0, buyVol: 0, sellVol: 0, buyFee: 0, sellFee: 0, avgBuyRate: 0, avgSellRate: 0 },
                    isFavorite: false
                });
            }
        });

        // --- ACTUALIZACIÓN DE MÉTRICAS BASE ---
        updateMainKpis(kpis);
        updateRatesCard(kpis);

        const kpisWithNormalizedBanks = { ...kpis, bankInsights: bankData };
        updateComisionesUI(kpisWithNormalizedBanks);
        updateOperacionesUI(kpis);

        // --- MONITOR LATERAL ---
        if (kpis) {
            if (!kpis.metrics) kpis.metrics = metrics;
            updateSidebarMonitor(kpis, bankData);
        }

        // --- PANEL DE BANCOS E INSIGHTS ---
        if (bankData.length > 0) {
            updateBancosUI(bankData);
            updateCiclosUI(kpis, bankData);
        }

        // Sincronizamos el Profit UI (usando datos críticos del backend)
        updateProfitUI(kpis, bankData);

        // Sincronizamos la comisión
        updateComisionOperadorUI(kpis, bankData);

        updateProyeccionesUI(kpis);

        // --- SECCIONES DE CARTERAS (LOGÍSTICA) ---
        updateRedSection(kpis);
        updatePaySection(kpis);
        updateSwitchSection(kpis);
        updateP2PSection(kpis);
        updateFiatSection(kpis, bankData);

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

/**
 * 4. FUNCIONES AUXILIARES
 */
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

function updateMainKpis(kpis = {}, manualProfit = null) {
    const critical = kpis.critical || {};
    // Fallback legacy
    const summary = kpis.metrics || kpis.kpis || kpis.summary || {};

    inject('kpi-balance', fUSDT(critical.balanceTotal ?? summary.totalBalance ?? summary.balance ?? 0));

    const beValue = critical.breakEvenRate ?? summary.minBuyRate ?? summary.breakEven;
    inject('kpi-breakeven', beValue ? (typeof beValue === 'number' ? beValue.toFixed(2) : beValue) : '---');

    inject('kpi-margin', pct(critical.globalMarginPercent ?? summary.globalMarginPct), true);

    const profitToDisplay = critical.profitTotalUSDT ?? (manualProfit !== null ? manualProfit : (summary.totalProfit ?? summary.profit ?? 0));
    inject('kpi-profit', fUSDT(profitToDisplay), true);

    inject('kpi-cycle', fUSDT(critical.currentCycleProfit ?? summary.cycleProfit ?? summary.cycleGain ?? 0), true);
}

function updateRatesCard(kpis = {}) {
    const ops = kpis.operations || {};
    const rates = kpis.rates || kpis.market || {};

    // Prioridad: weightedAvg desde operations > rates object
    const buy = ops.weightedAvgBuyRate ?? rates.buyRate ?? rates.buy ?? null;
    const sell = ops.weightedAvgSellRate ?? rates.sellRate ?? rates.sell ?? null;

    const label = (buy || sell) ? `${buy ? buy.toFixed(2) : '---'} / ${sell ? sell.toFixed(2) : '---'}` : '---';
    inject('ops-rates', label);
}