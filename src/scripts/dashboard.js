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
import { refreshActiveAds } from './dashboard/activeAds.js';
import { initCardHelpTooltips } from './dashboard/cardHelp.js';
const KPI_REQUEST_TIMEOUT_MS = 12000;
const KPI_APPLY_BUTTON_TEXT = "Actualizar Reporte";
const LOCAL_API_FALLBACK = "http://localhost:3003";
const CARACAS_TZ = "America/Caracas";
let dashboardIntervalId = null;
let dashboardAbortController = null;
let dashboardRequestSeq = 0;
let kpiLoadingRequestSeq = 0;
let authRedirecting = false;

function normalizeApiBase(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.replace(/\/+$/, '');
}

function isLocalHostName(host) {
    const normalized = String(host || '').toLowerCase();
    return normalized === 'localhost' || normalized === '127.0.0.1';
}

function isLocalApiBase(url) {
    try {
        const parsed = new URL(url);
        return isLocalHostName(parsed.hostname);
    } catch {
        return false;
    }
}

function uniqueNonEmpty(values = []) {
    const out = [];
    const seen = new Set();
    values.forEach((value) => {
        const normalized = normalizeApiBase(value);
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        out.push(normalized);
    });
    return out;
}

function resolveApiBase() {
    const stored = normalizeApiBase(localStorage.getItem('api_base'));
    const fromEnv = normalizeApiBase(import.meta.env.PUBLIC_API_URL);
    const sameOrigin = normalizeApiBase(window.location.origin);
    const isLocalHost = isLocalHostName(window.location.hostname);
    const safeStored = isLocalHost
        ? (stored && isLocalApiBase(stored) ? stored : '')
        : (stored && !isLocalApiBase(stored) ? stored : '');

    const candidates = isLocalHost
        ? uniqueNonEmpty([
            safeStored,
            fromEnv,
            LOCAL_API_FALLBACK,
            sameOrigin
        ])
        : uniqueNonEmpty([safeStored, fromEnv, sameOrigin]);

    const selected = candidates[0] || sameOrigin || LOCAL_API_FALLBACK;
    localStorage.setItem('api_base', selected);
    return selected;
}

function handleExpiredSession() {
    if (authRedirecting) return;
    authRedirecting = true;

    localStorage.removeItem('auth_token');
    localStorage.removeItem('session_token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_info');
    localStorage.removeItem('operator_alias');

    document.cookie = "session_token=; Path=/; Max-Age=0; SameSite=Lax";
    window.location.href = '/login';
}


/**
 * 2. FUNCIÓN DE INICIALIZACIÓN
 */
export async function initDashboard() {
    console.log("Sentinel Dashboard: Sincronizando módulos...");
    initCardHelpTooltips();

    const API_BASE = resolveApiBase();
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

    // Inicializar Flatpickr antes de sincronizar el rango en inputs.
    setupDatePickers();

    let currentRange = normalizeRange(getPresetRange('today'));
    syncRangeInputs(currentRange);
    updateKpiFilterLabel(currentRange.label);
    highlightPreset('today');

    setupKpiFilters((range, meta = {}) => {
        const nextRange = normalizeRange(range);
        const shouldForce = Boolean(meta.force);
        if (!shouldForce && isSameRange(currentRange, nextRange)) {
            return;
        }
        currentRange = nextRange;
        updateKpiFilterLabel(nextRange.label);
        void updateDashboard(API_BASE, token, alias, nextRange, { showLoading: true });
    });

    await updateDashboard(API_BASE, token, alias, currentRange, { showLoading: true });
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
                await updateDashboard(API_BASE, token, alias, currentRange, { showLoading: false });
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

    if (dashboardIntervalId) {
        clearInterval(dashboardIntervalId);
    }
    dashboardIntervalId = setInterval(() => {
        if (document.hidden) return;
        void updateDashboard(API_BASE, token, alias, currentRange, { preserveInFlight: true, showLoading: false });
    }, 30000);
}

/**
 * 3. FUNCIÓN DE ACTUALIZACIÓN GLOBAL (Auditoría de integridad)
 */
export async function updateDashboard(API_BASE, token, alias, range = {}, opts = {}) {
    if (!token) return;

    const { preserveInFlight = false, showLoading = false } = opts || {};
    if (preserveInFlight && dashboardAbortController) {
        return;
    }

    if (dashboardAbortController) {
        dashboardAbortController.abort();
    }
    dashboardAbortController = new AbortController();
    const requestSeq = ++dashboardRequestSeq;
    if (showLoading) {
        kpiLoadingRequestSeq = requestSeq;
        setKpiFilterLoading(true);
    }

    const requestTimeout = setTimeout(() => {
        if (dashboardAbortController) {
            dashboardAbortController.abort();
        }
    }, KPI_REQUEST_TIMEOUT_MS);

    try {
        setPayrollRange(range || {});

        const params = new URLSearchParams();
        if (range?.from) params.set('from', range.from);
        if (range?.to) params.set('to', range.to);
        params.set('_ts', String(Date.now()));
        const url = `${API_BASE}/api/kpis${params.toString() ? `?${params.toString()}` : ''}`;

        const updateEl = document.getElementById('last-update');
        if (updateEl) updateEl.textContent = "Sincronizando con Sentinel...";

        const kpiRes = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            },
            cache: 'no-store',
            signal: dashboardAbortController.signal
        });

        if (!kpiRes.ok) {
            if (kpiRes.status === 401 || kpiRes.status === 403) {
                handleExpiredSession();
                return;
            }

            let backendError = '';
            try {
                const errData = await kpiRes.json();
                backendError = errData?.error || '';
            } catch {
                // Ignore parsing errors and keep generic fallback.
            }

            console.error(`API Error: ${kpiRes.status} ${kpiRes.statusText}`);
            throw new Error(backendError || `Fallo en la respuesta de la API (${kpiRes.status})`);
        }
        const kpis = await kpiRes.json();
        if (requestSeq !== dashboardRequestSeq) {
            return;
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

        updateProyeccionesUI(kpis, range);

        // --- SECCIONES DE CARTERAS (LOGÍSTICA) ---
        updateRedSection(kpis);
        updatePaySection(kpis);
        updateSwitchSection(kpis);
        updateP2PSection(kpis);
        updateFiatSection(kpis, bankData);
        await refreshActiveAds(API_BASE, token, {
            signal: dashboardAbortController?.signal,
            onAuthError: handleExpiredSession
        });

        // --- UI ESTADO ---
        const aliasEl = document.getElementById('operator-alias');
        if (aliasEl) aliasEl.textContent = alias;

        if (updateEl) {
            const syncTime = new Date().toLocaleTimeString('es-VE', {
                timeZone: CARACAS_TZ
            });
            updateEl.textContent = `Sincronizado: ${syncTime}`;
        }

        // Payroll loading moved to background so filter changes feel snappier.
        // Keep it non-blocking and ignore late responses from stale requests.
        void (async () => {
            try {
                const payroll = await refreshPayrollSummary(API_BASE, token);
                if (requestSeq !== dashboardRequestSeq) return;
                if (payroll) {
                    const kpisWithPayroll = { ...kpis, payroll };
                    updateComisionOperadorUI(kpisWithPayroll, bankData);
                }
                await refreshPayrollWithdrawalHistory(API_BASE, token);
            } catch (_e) {
                // Non-fatal: dashboard remains usable even if payroll endpoints fail.
            }
        })();

    } catch (err) {
        if (err?.name === 'AbortError') {
            return;
        }
        console.error("Error en sincronización de Sentinel:", err);
        const updateEl = document.getElementById('last-update');
        if (updateEl) updateEl.textContent = "Error de conexión con Sentinel";
    } finally {
        clearTimeout(requestTimeout);
        if (requestSeq === dashboardRequestSeq) {
            dashboardAbortController = null;
        }
        if (showLoading && requestSeq === kpiLoadingRequestSeq) {
            setKpiFilterLoading(false);
        }
    }
}

/**
 * 4. FUNCIONES AUXILIARES
 */
function pad(n) { return String(n).padStart(2, '0'); }

function getCaracasDateParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: CARACAS_TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(date);

    const year = Number(parts.find(p => p.type === "year")?.value);
    const month = Number(parts.find(p => p.type === "month")?.value);
    const day = Number(parts.find(p => p.type === "day")?.value);
    return { year, month, day };
}

function toYmdFromParts(parts) {
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function parseDateKeyAsUtc(dateKey) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || '').trim());
    if (!match) return null;
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function formatUtcDateKey(date) {
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function shiftDateKey(dateKey, deltaDays) {
    const date = parseDateKeyAsUtc(dateKey);
    if (!date) return undefined;
    date.setUTCDate(date.getUTCDate() + deltaDays);
    return formatUtcDateKey(date);
}

function getWeekRangeFromDateKey(todayKey) {
    const date = parseDateKeyAsUtc(todayKey);
    if (!date) return { from: undefined, to: undefined };

    const day = date.getUTCDay();
    const diffToMonday = (day === 0 ? -6 : 1 - day);
    const from = shiftDateKey(todayKey, diffToMonday);
    const to = shiftDateKey(from, 6);
    return { from, to };
}

function getPresetRange(preset) {
    const todayParts = getCaracasDateParts(new Date());
    const today = toYmdFromParts(todayParts);
    const yesterday = shiftDateKey(today, -1);
    const startOfMonth = `${todayParts.year}-${pad(todayParts.month)}-01`;
    const startOfYear = `${todayParts.year}-01-01`;

    switch (preset) {
        case 'today':
            return { label: 'Hoy', from: today, to: today };
        case 'yesterday':
            return { label: 'Ayer', from: yesterday, to: yesterday };
        case 'this_week': {
            const r = getWeekRangeFromDateKey(today);
            return { label: 'Esta semana', ...r };
        }
        case 'last_7': {
            const from = shiftDateKey(today, -6);
            return { label: 'Ultimos 7 dias', from, to: today };
        }
        case 'this_month':
            return { label: 'Mes actual', from: startOfMonth, to: today };
        case 'last_30': {
            const from = shiftDateKey(today, -29);
            return { label: 'Ultimos 30 dias', from, to: today };
        }
        case 'ytd':
            return { label: 'YTD', from: startOfYear, to: today };
        case 'all':
            return { label: 'Todo', from: undefined, to: undefined };
        default:
            return { label: 'Personalizado' };
    }
}

function setupKpiFilters(onApply) {
    const presetGroup = document.getElementById('kpi-preset-group');
    const fromEl = document.getElementById('kpi-date-from');
    const toEl = document.getElementById('kpi-date-to');
    const applyBtn = document.getElementById('kpi-apply-range');

    presetGroup?.addEventListener('click', (e) => {
        const btn = e.target?.closest?.('.kpi-preset-btn');
        if (!btn) return;
        const preset = btn.getAttribute('data-preset');
        const range = getPresetRange(preset);
        syncRangeInputs(range);
        highlightPreset(preset);
        onApply(range, { source: 'preset', preset, force: false });
    });

    applyBtn?.addEventListener('click', () => {
        let from = sanitizeDateValue(fromEl?.value);
        let to = sanitizeDateValue(toEl?.value);

        // UX guard: si el usuario invierte fechas, corregimos en UI y request.
        if (from && to && from > to) {
            [from, to] = [to, from];
            syncRangeInputs({ from, to });
        }

        highlightPreset('custom');
        onApply({ label: 'Personalizado', from, to }, { source: 'custom', force: true });
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
        disableMobile: true,
        allowInput: true
    };

    flatpickr("#kpi-date-from", config);
    flatpickr("#kpi-date-to", config);
}

function updateDateInput(el, value) {
    if (!el) return;
    const dateValue = sanitizeDateValue(value);
    if (el._flatpickr) {
        if (!dateValue) {
            el._flatpickr.clear();
            return;
        }
        el._flatpickr.setDate(dateValue, false, "Y-m-d");
    } else {
        el.value = dateValue || '';
    }
}

function syncRangeInputs(range = {}) {
    const fromEl = document.getElementById('kpi-date-from');
    const toEl = document.getElementById('kpi-date-to');
    updateDateInput(fromEl, range?.from);
    updateDateInput(toEl, range?.to);
}

function sanitizeDateValue(value) {
    const trimmed = String(value ?? '').trim();
    return trimmed || undefined;
}

function normalizeRange(range = {}) {
    return {
        label: range?.label || 'Personalizado',
        from: sanitizeDateValue(range?.from),
        to: sanitizeDateValue(range?.to)
    };
}

function isSameRange(a = {}, b = {}) {
    return sanitizeDateValue(a?.from) === sanitizeDateValue(b?.from)
        && sanitizeDateValue(a?.to) === sanitizeDateValue(b?.to);
}

function setKpiFilterLoading(isLoading) {
    const applyBtn = document.getElementById('kpi-apply-range');
    if (!applyBtn) return;
    applyBtn.textContent = isLoading ? 'Actualizando...' : KPI_APPLY_BUTTON_TEXT;
    applyBtn.disabled = isLoading;
    applyBtn.classList.toggle('opacity-70', isLoading);
}


