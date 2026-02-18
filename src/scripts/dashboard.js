// 1. IMPORTACIONES (Preservadas todas tus rutas originales + Sidebar)
import flatpickr from "flatpickr";
import { Spanish } from "flatpickr/dist/l10n/es.js";
import { fUSDT, fVES, inject } from './dashboard/utils.js';
import { updateRedSection } from './dashboard/red.js';
import { updatePaySection } from './dashboard/pay.js';
import { updateSwitchSection } from './dashboard/switch.js';
import { updateP2PSection } from './dashboard/p2p.js';
import { updateFiatSection } from './dashboard/fiat.js';
import { updateCiclosUI } from './dashboard/ciclos.js';
import { updateProfitUI } from './dashboard/profit.js';
import { updateComisionOperadorUI } from './dashboard/comisionOp.js';
import { initPayrollWithdrawalsUI, refreshPayrollSummary, refreshPayrollWithdrawalHistory, setPayrollRange } from './dashboard/payrollWithdrawals.js';
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

    const API_BASE = localStorage.getItem('api_base') || import.meta.env.PUBLIC_API_URL || window.location.origin;
    const token = localStorage.getItem('auth_token') || localStorage.getItem('session_token');

    // Recuperar alias con soporte Multi-Rol
    let alias = 'Operador';
    try {
        const userInfoStr = localStorage.getItem('user_info');
        if (userInfoStr) {
            const user = JSON.parse(userInfoStr);
            alias = user.alias || localStorage.getItem('operator_alias') || 'Usuario';
        } else {
            alias = localStorage.getItem('operator_alias') || 'Operador';
        }
    } catch (e) {
        alias = localStorage.getItem('operator_alias') || 'Operador';
    }

    if (!token) {
        console.warn("No se encontró token, redirigiendo...");
        window.location.href = '/login';
        return;
    }

    const logoutBtn = document.getElementById('logout-btn');
    logoutBtn?.addEventListener('click', () => {
        localStorage.clear();
        // Limpieza de cookie también si es posible, aunque suele ser HttpOnly o gestionada por servidor.
        // Forzamos expiración de cookie cliente
        document.cookie = "session_token=; Path=/; Max-Age=0; SameSite=Lax";
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

    // Inicializar Flatpickr
    setupDatePickers();

    await updateDashboard(API_BASE, token, alias, currentRange);
    initPayrollWithdrawalsUI(API_BASE, token);

    // --- FAVORITES HANDLER (Global connection for Astro onClick) ---
    window.handleToggleFavorite = async (bankName) => {
        console.log(`Toggling favorite for: ${bankName}`);

        // Helper para normalizar ID (mismo que en bancos.js)
        const getBankId = (name) => {
            const lower = name.toLowerCase().trim();
            if (lower.includes('pago') || lower.includes('movil') || lower === 'pm') return 'pagomovil';
            if (lower.includes('bbva') || lower.includes('provincial')) return 'provincial';
            if (lower.includes('bnc')) return 'bnc';
            if (lower.includes('banesco')) return 'banesco';
            if (lower.includes('mercantil')) return 'mercantil';
            if (lower.includes('bancamiga')) return 'bancamiga';
            if (lower.includes('fintech') || lower === 'bank') return 'bank';
            return lower.split(' ')[0].replace(/\s+/g, '');
        };

        const id = getBankId(bankName);
        const starBtn = document.getElementById(`fav-${id}`);
        let wasFavorite = false;

        // 1. Optimistic Update (Visual Instantánea)
        if (starBtn) {
            wasFavorite = starBtn.classList.contains('text-yellow-400');
            // Toggle visual state immediately
            if (wasFavorite) {
                starBtn.classList.remove('text-yellow-400');
                starBtn.classList.add('text-gray-600');
            } else {
                starBtn.classList.remove('text-gray-600');
                starBtn.classList.add('text-yellow-400');
            }
        }

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
                console.log("Favorite toggled successfully.");

                // HYBRID FIX: Save returned favorites to LocalStorage backup
                if (data.favorites && Array.isArray(data.favorites)) {
                    localStorage.setItem('sentinel_favorites', JSON.stringify(data.favorites));
                }

                // Recargamos datos para ver el cambio de orden
                // NOTA: Como ya actualizamos la estrella, el usuario ve respuesta inmediata.
                // La recarga reordenará las tarjetas (si hay lógica de ordenamiento).
                await updateDashboard(API_BASE, token, alias, currentRange);
            } else {
                console.error("Error toggling favorite:", data);
                // Revert optimistic update
                if (starBtn) {
                    if (wasFavorite) {
                        starBtn.classList.add('text-yellow-400');
                        starBtn.classList.remove('text-gray-600');
                    } else {
                        starBtn.classList.add('text-gray-600');
                        starBtn.classList.remove('text-yellow-400');
                    }
                }
            }
        } catch (err) {
            console.error("Network error toggling favorite:", err);
            // Revert optimistic update
            if (starBtn) {
                if (wasFavorite) {
                    starBtn.classList.add('text-yellow-400');
                    starBtn.classList.remove('text-gray-600');
                } else {
                    starBtn.classList.add('text-gray-600');
                    starBtn.classList.remove('text-yellow-400');
                }
            }
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
        setPayrollRange(range || {});

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

        // Payroll summary follows the active KPI range (Hoy/semana/mes/etc).
        // Attach it to root so updateComisionOperadorUI uses this instead of critical.payroll.
        try {
            const payroll = await refreshPayrollSummary(API_BASE, token);
            if (payroll) kpis.payroll = payroll;
            await refreshPayrollWithdrawalHistory(API_BASE, token);
        } catch (e) {
            // Non-fatal: keep the rest of the dashboard working.
        }

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
                // FIX: Check against global favorites list from API (case-insensitive)
                const globalFavorites = kpis.favorites || [];
                const isFav = globalFavorites.some(f => f.toLowerCase().trim() === dbParams.toLowerCase().trim());

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
                    isFavorite: isFav
                });
            }
        });

        // ---------------------------------------------------------
        // PROFIT TOTAL = SUMA DE PROFITS POR BANCO (Fuente: bankInsights)
        // ---------------------------------------------------------
        // El backend puede calcular profit por ciclos (Judge) y eso puede no coincidir
        // con lo que el usuario espera como "profit" diario/por periodo.
        // Para la UI, forzamos el Profit Total a ser la suma de los profits por banco.
        const bankProfitSum = bankData.reduce((sum, b) => sum + Number(b.profit || 0), 0);
        if (!kpis.critical) kpis.critical = {};
        kpis.critical.profitTotalUSDT = bankProfitSum;
        if (!kpis.metrics) kpis.metrics = metrics;
        kpis.metrics.totalProfit = bankProfitSum;

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
        if (range.from) updateDateInput(fromEl, range.from);
        if (range.to) updateDateInput(toEl, range.to);
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

    // El backend envía el PROFIT NETO directamente, no hacer cálculos aquí.
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

function setupDatePickers() {
    const config = {
        locale: Spanish,
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d F, Y",
        disableMobile: "true",
        allowInput: true
    };

    flatpickr("#kpi-date-from", config);
    flatpickr("#kpi-date-to", config);
}

function updateDateInput(el, value) {
    if (!el) return;
    if (el._flatpickr) {
        el._flatpickr.setDate(value);
    } else {
        el.value = value;
    }
}
