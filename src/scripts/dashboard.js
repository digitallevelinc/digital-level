// 1. IMPORTACIONES (Preservadas todas tus rutas originales + Sidebar)
import flatpickr from "flatpickr";
import { Spanish } from "flatpickr/dist/l10n/es.js";
import { fUSDT, fVES, inject } from './dashboard/utils.js';
// import { updateDispersorUI } from './dashboard/dispersor.js'; // REMOVED
import { updateProfitUI } from './dashboard/profit.js';
import { updateComisionOperadorUI } from './dashboard/comisionOp.js';
import { initPayrollWithdrawalsUI, refreshPayrollSummary, refreshPayrollWithdrawalHistory, setPayrollRange } from './dashboard/payrollWithdrawals.js';
import { updateProyeccionesUI } from './dashboard/proyecciones.js';
import { updateComisionesUI } from './dashboard/comisiones.js';
import { updateOperacionesUI } from './dashboard/operaciones.js';
import { updateBancosUI } from './dashboard/bancos.js';
import { updateBalanceLedgerUI } from './dashboard/balanceLedger.js';
import { updateSidebarMonitor } from './dashboard/SidebarMonitor.js';
import { initCardHelpTooltips } from './dashboard/cardHelp.js';
import { initDashboardNotifications } from './dashboard/notifications.js';
const KPI_REQUEST_TIMEOUT_MS = 12000;
const LIVE_KPI_FAST_REFRESH_DELAY_MS = 4500;
const DASHBOARD_BOOTSTRAP_HYDRATION_DELAY_MS = 900;
const KPI_APPLY_BUTTON_TEXT = "Actualizar Reporte";
const LOCAL_API_FALLBACK = "http://localhost:3003";
const CARACAS_TZ = "America/Caracas";
const sessionStore = window.sessionStorage;
const legacyLocalStore = window.localStorage;
const LEGACY_SHARED_AUTH_KEYS = ['auth_token', 'session_token', 'user_role', 'user_info', 'operator_alias'];
let dashboardIntervalId = null;
let dashboardAbortController = null;
let dashboardFastFollowUpTimer = null;
let dashboardBootstrapHydrationTimer = null;
let dashboardRequestSeq = 0;
let kpiLoadingRequestSeq = 0;
let authRedirecting = false;
let cachedLedgerBankData = [];
const COVERAGE_MODAL_FIAT_TOLERANCE = 500;
const COVERAGE_MODAL_STALE_MS = 8 * 60 * 60 * 1000;

function updateSidebarRangeLabel(range = {}) {
    const el = document.getElementById('side-range-label');
    if (!el) return;
    const from = sanitizeDateValue(range?.from);
    const to = sanitizeDateValue(range?.to);
    const label = String(range?.label || '').trim();

    if (!from && !to) {
        el.textContent = 'Todo + Wallet Live';
        return;
    }

    if (from && to) {
        if (from === to) {
            el.textContent = `${from} + Wallet Live`;
            return;
        }
        el.textContent = `${from} -> ${to} + Wallet Live`;
        return;
    }

    el.textContent = `${label || 'Rango activo'} + Wallet Live`;
}

function normalizeApiBase(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.replace(/\/+$/, '');
}

function clearDashboardFastFollowUp() {
    if (!dashboardFastFollowUpTimer) return;
    clearTimeout(dashboardFastFollowUpTimer);
    dashboardFastFollowUpTimer = null;
}

function clearDashboardBootstrapHydration() {
    if (!dashboardBootstrapHydrationTimer) return;
    clearTimeout(dashboardBootstrapHydrationTimer);
    dashboardBootstrapHydrationTimer = null;
}

function isLiveKpiRange(range = {}) {
    const todayKey = toYmdFromParts(getCaracasDateParts(new Date()));
    const to = sanitizeDateValue(range?.to);
    return !to || to === todayKey;
}

function scheduleDashboardFastFollowUp(API_BASE, token, alias, range = {}) {
    clearDashboardFastFollowUp();
    if (!isLiveKpiRange(range)) return;

    dashboardFastFollowUpTimer = setTimeout(() => {
        dashboardFastFollowUpTimer = null;
        if (document.hidden) return;
        void updateDashboard(API_BASE, token, alias, range, {
            preserveInFlight: true,
            showLoading: false,
            skipFastFollowUp: true
        });
    }, LIVE_KPI_FAST_REFRESH_DELAY_MS);
}

function scheduleDashboardBootstrapHydration(API_BASE, token, alias, range = {}) {
    clearDashboardBootstrapHydration();
    dashboardBootstrapHydrationTimer = setTimeout(() => {
        dashboardBootstrapHydrationTimer = null;
        if (document.hidden) return;
        void updateDashboard(API_BASE, token, alias, range, {
            preserveInFlight: true,
            showLoading: false,
            bootstrap: false,
            skipFastFollowUp: true
        });
    }, DASHBOARD_BOOTSTRAP_HYDRATION_DELAY_MS);
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

function purgeLegacySharedAuth() {
    try {
        LEGACY_SHARED_AUTH_KEYS.forEach((key) => legacyLocalStore.removeItem(key));
    } catch (_error) {
        // Ignore storage failures; sessionStorage is the source of truth.
    }
}

function clearTabAuth() {
    LEGACY_SHARED_AUTH_KEYS.forEach((key) => sessionStore.removeItem(key));
}

function normalizeBankKey(value) {
    const raw = String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    if (!raw) return '';
    if (raw.includes('bbva') || raw.includes('provincial')) return 'provincial';
    if (raw.includes('mercantil')) return 'mercantil';
    if (raw.includes('banesco')) return 'banesco';
    if (raw.includes('bnc')) return 'bnc';
    if (raw.includes('bancamiga')) return 'bancamiga';
    if (raw.includes('fintech') || raw === 'bank') return 'bank';
    return raw.replace(/[^a-z0-9]/g, '');
}

function bankLabelFromKey(bankKey) {
    switch (String(bankKey || '').toLowerCase()) {
        case 'provincial': return 'BBVA/Provincial';
        case 'mercantil': return 'Mercantil';
        case 'banesco': return 'Banesco';
        case 'bnc': return 'BNC';
        case 'bancamiga': return 'Bancamiga';
        case 'bank': return 'BANK';
        default: {
            const compact = String(bankKey || '').trim();
            if (!compact) return 'Banco extra';
            return compact.charAt(0).toUpperCase() + compact.slice(1);
        }
    }
}

function toggleCoverageAlertModal(isVisible, staleVerdicts = []) {
    if (isVisible) {
        if (typeof window.showCoverageAlertModal === 'function') {
            window.showCoverageAlertModal(staleVerdicts);
        }
        return;
    }
    if (typeof window.hideCoverageAlertModal === 'function') {
        window.hideCoverageAlertModal();
    }
}

const COVERAGE_ALERT_TERMINAL_STATUSES = new Set([
    'CLOSED', 'COMPLETED', 'CANCELLED', 'CANCELED',
    'CANCELLED_BY_SYSTEM', 'CANCELED_BY_SYSTEM',
    'EXPIRED', 'RELEASED', 'FINISHED', 'DONE', 'SUCCESS',
]);

function isCoverageAlertTerminalVerdict(verdict = {}) {
    const rawStatus = String(verdict?.status || verdict?.orderStatus || '').trim().toUpperCase();
    if (rawStatus) {
        if (COVERAGE_ALERT_TERMINAL_STATUSES.has(rawStatus)) return true;
        if (rawStatus.startsWith('CLOS') || rawStatus.startsWith('COMPLET') ||
            rawStatus.startsWith('CANCEL') || rawStatus.startsWith('EXPIRE') ||
            rawStatus.startsWith('RELEASE')) return true;
    }
    return Boolean(verdict?.closedAt || verdict?.completedAt || verdict?.releasedAt);
}

function getActiveLedgerCoverageBankKeys(bankData = []) {
    const activeKeys = new Set();
    let ledgerCoverageResolved = false;

    (Array.isArray(bankData) ? bankData : []).forEach((bank) => {
        if (bank?.ledgerSpreadReady === true) {
            ledgerCoverageResolved = true;
        }

        const totalFiat = Number(bank?.coverageTotalFiat || 0);
        const pendingFiat = Number(bank?.coveragePendingFiat || 0);
        if (totalFiat <= COVERAGE_MODAL_FIAT_TOLERANCE || pendingFiat <= COVERAGE_MODAL_FIAT_TOLERANCE) {
            return;
        }

        const key = normalizeBankKey(bank?.bank || bank?.bankName);
        if (key) activeKeys.add(key);
    });

    return { ledgerCoverageResolved, activeKeys };
}

function syncCoverageAlertModal(kpis = {}, bankData = [], currentRange = null) {
    const isOperatorMode = sessionStorage.getItem('admin_impersonation') !== 'true';
    if (!isOperatorMode) {
        toggleCoverageAlertModal(false);
        return;
    }

    const { ledgerCoverageResolved, activeKeys } = getActiveLedgerCoverageBankKeys(bankData);
    // The modal must only react to ledger-confirmed coverage state.
    // judge.openVerdicts can remain stale for a poll or two after coverage is
    // completed, so if the ledger has not resolved yet we prefer to keep the
    // modal hidden instead of flashing a false alert.
    if (!ledgerCoverageResolved) {
        toggleCoverageAlertModal(false);
        return;
    }

    const verdicts = Array.isArray(kpis?.judge?.openVerdicts) ? kpis.judge.openVerdicts : [];
    if (verdicts.length === 0) {
        toggleCoverageAlertModal(false);
        return;
    }

    const now = Date.now();
    const staleVerdicts = verdicts.filter((verdict) => {
        const remainingFiat = Number(verdict?.remainingFiat || 0);
        if (remainingFiat <= COVERAGE_MODAL_FIAT_TOLERANCE) return false;

        // Full terminal-status check (mirrors SidebarMonitor.isTerminalVerdict)
        if (isCoverageAlertTerminalVerdict(verdict)) return false;

        // Additional guard: if consumed fiat already covers expected, skip
        const expectedUsdt = Number(verdict?.expectedRebuyUsdt ?? verdict?.saleAmount ?? 0);
        const saleRate = Number(verdict?.saleRate || 0);
        const expectedFiat = Number(
            verdict?.expectedRebuyFiat ??
            (expectedUsdt > 0 && saleRate > 0 ? expectedUsdt * saleRate : 0)
        );
        const consumedFiat = Number(verdict?.consumedRebuyFiat || 0);
        if (expectedFiat > 0 && consumedFiat >= expectedFiat - COVERAGE_MODAL_FIAT_TOLERANCE) return false;

        // Verdicts created before the current date-range start are out of scope.
        // The ledger bank data is scoped to the range, so we can't verify them —
        // skip them to avoid false alerts from stale backend entries.
        if (currentRange && currentRange.from) {
            const parts = currentRange.from.split('-');
            if (parts.length === 3) {
                const rangeStartUtcMs = Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 4, 0, 0);
                const verdictTimestamp = new Date(verdict?.createdAt || verdict?.timestamp || 0).getTime();
                if (verdictTimestamp < rangeStartUtcMs) return false;
            }
        }

        const bankKey = normalizeBankKey(verdict?.paymentMethod);
        if (!bankKey || !activeKeys.has(bankKey)) return false;

        const ageMs = now - new Date(verdict?.createdAt || verdict?.timestamp || 0).getTime();
        return ageMs >= COVERAGE_MODAL_STALE_MS;
    });

    toggleCoverageAlertModal(staleVerdicts.length > 0, staleVerdicts);
}

function getRequiredBankKeys(kpis = {}) {
    const defaults = ['mercantil', 'banesco', 'bnc', 'provincial', 'bancamiga', 'bank'];
    const spendLimits = kpis?.config?.bankSpendLimitsVes || {};
    const pagoMovilLimits = kpis?.config?.bankPagoMovilLimitsVes || {};
    const configured = [
        ...Object.keys(spendLimits || {}),
        ...Object.keys(pagoMovilLimits || {}),
    ]
        .map(normalizeBankKey)
        .filter(Boolean);

    return Array.from(new Set([...defaults, ...configured]));
}

function handleExpiredSession() {
    if (authRedirecting) return;
    authRedirecting = true;

    purgeLegacySharedAuth();
    clearTabAuth();
    window.location.href = '/login';
}


/**
 * 2. FUNCIÓN DE INICIALIZACIÓN
 */
export async function initDashboard() {
    console.log("Sentinel Dashboard: Sincronizando módulos...");
    purgeLegacySharedAuth();
    initCardHelpTooltips();

    const API_BASE = resolveApiBase();
    const token = sessionStore.getItem('auth_token') || sessionStore.getItem('session_token');

    // Recuperar alias con soporte Multi-Rol
    let alias = 'Operador';
    try {
        const userInfoStr = sessionStore.getItem('user_info');
        if (userInfoStr) {
            const user = JSON.parse(userInfoStr);
            alias = user.alias || sessionStore.getItem('operator_alias') || 'Usuario';
        } else {
            alias = sessionStore.getItem('operator_alias') || 'Operador';
        }
    } catch (e) {
        alias = sessionStore.getItem('operator_alias') || 'Operador';
    }

    if (!token) {
        console.warn("No se encontró token, redirigiendo...");
        window.location.href = '/login';
        return;
    }

    initDashboardNotifications({ apiBase: API_BASE, token });

    const logoutBtn = document.getElementById('logout-btn');
    logoutBtn?.addEventListener('click', () => {
        purgeLegacySharedAuth();
        clearTabAuth();
        // Limpieza de cookie también si es posible, aunque suele ser HttpOnly o gestionada por servidor.
        // Forzamos expiración de cookie cliente
        window.location.href = '/login';
    });

    // --- EXPORT HANDLER ---
    const exportBtn = document.getElementById('link-p2p-sheet');
    if (exportBtn) {
        exportBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const sheetHref = exportBtn.getAttribute('href') || '#';
            // If the link has been configured to point to Google Sheets, open it
            if (sheetHref !== '#' && exportBtn.getAttribute('aria-disabled') !== 'true') {
                window.open(sheetHref, '_blank', 'noopener,noreferrer');
                return;
            }
            // Otherwise export the current range as CSV for Google Sheets/Excel
            try {
                exportBtn.style.opacity = '0.5';
                exportBtn.style.pointerEvents = 'none';
                const params = new URLSearchParams();
                if (currentRange?.from) params.set('from', currentRange.from);
                if (currentRange?.to) params.set('to', currentRange.to);
                const res = await fetch(`${API_BASE}/api/export/range.csv?${params.toString()}`, {
                    headers: { Authorization: `Bearer ${token}` },
                    cache: 'no-store',
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    alert(err?.error || `Error ${res.status} al exportar`);
                    return;
                }
                const filename = res.headers.get('X-Export-File-Name') || 'export.csv';
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (err) {
                console.error('Export error:', err);
                alert('Error al generar el reporte');
            } finally {
                exportBtn.style.opacity = '';
                exportBtn.style.pointerEvents = '';
            }
        });
    }

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

    await updateDashboard(API_BASE, token, alias, currentRange, {
        showLoading: true,
        bootstrap: true,
        skipFastFollowUp: true
    });
    scheduleDashboardBootstrapHydration(API_BASE, token, alias, currentRange);
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
function buildKpiUrl(API_BASE, range = {}, options = {}) {
    const params = new URLSearchParams();
    if (range?.from) params.set('from', range.from);
    if (range?.to) params.set('to', range.to);
    if (options?.bootstrap) params.set('bootstrap', '1');
    params.set('_ts', String(Date.now()));
    return `${API_BASE}/api/kpis${params.toString() ? `?${params.toString()}` : ''}`;
}

async function fetchDashboardKpis(API_BASE, token, range = {}, signal, options = {}) {
    const res = await fetch(buildKpiUrl(API_BASE, range, options), {
        headers: {
            'Authorization': `Bearer ${token}`
        },
        cache: 'no-store',
        signal
    });

    if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
            handleExpiredSession();
            return null;
        }

        let backendError = '';
        try {
            const errData = await res.json();
            backendError = errData?.error || '';
        } catch {
            // Ignore parsing errors and keep generic fallback.
        }

        console.error(`API Error: ${res.status} ${res.statusText}`);
        throw new Error(backendError || `Fallo en la respuesta de la API (${res.status})`);
    }

    return await res.json();
}

function hasFiniteNumber(value) {
    return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function getSellFeesTotal(kpis = {}, bankData = []) {
    if (hasFiniteNumber(kpis.operations?.totalFeesSell)) {
        return Number(kpis.operations.totalFeesSell);
    }

    return (bankData || []).reduce((sum, bank) => (
        sum
        + Number(bank?.trf?.sellFee || 0)
        + Number(bank?.pm?.sellFee || 0)
    ), 0);
}

function syncCriticalProfitFromBanks(kpis = {}, metrics = {}, bankData = []) {
    // Profit Operativo must come only from the canonical backend value.
    if (!kpis.critical) kpis.critical = {};
    if (!kpis.metrics) kpis.metrics = metrics;

    const critical = kpis.critical;
    const completedCycles = Number(critical.completedCycles || 0);
    const hasCanonicalProfit = hasFiniteNumber(critical.profitTotalUSDT);
    const canonicalProfit = hasCanonicalProfit ? Number(critical.profitTotalUSDT) : 0;

    if (hasCanonicalProfit) {
        critical.profitTotalUSDT = canonicalProfit;
    }
    critical.averageCycleProfit = hasCanonicalProfit && completedCycles > 0
        ? canonicalProfit / completedCycles
        : 0;

    kpis.metrics.totalProfit = canonicalProfit;

    return canonicalProfit;
}

function normalizeKpiBankData(kpis = {}) {
    const metrics = kpis.metrics || {};
    const bankData = (kpis.bankInsights || []).map(i => {
        const trf = i.trf || {};
        const pm = i.pm || {};

        return {
            ...i,
            fiatBalance: Number(i.fiatBalance || 0),
            usdtBalance: Number(i.usdtBalance || 0),
            profit: Number(i.profit || 0),
            ledgerSpreadReady: false,
            profitPercent: Number(i.profitPercent || i.margin || 0),
            activeVerdictsCount: Number(i.activeVerdictsCount || 0),
            avgBuyRate: Number(i.avgBuyRate || 0),
            avgSellRate: Number(i.avgSellRate || 0),
            buyRate: Number(i.buyRate || i.avgBuyRate || 0),
            sellRate: Number(i.sellRate || i.avgSellRate || 0),
            ceilingRate: Number(i.ceilingRate || 0),
            ceilingAppliedPercent: Number(i.ceilingAppliedPercent || 0),
            currentCycleSaleUSDT: Number(i.currentCycleSaleUSDT || 0),
            currentCycleProgress: Number(i.currentCycleProgress || 0),
            currentCycleFiatRemaining: Number(i.currentCycleFiatRemaining || 0),
            currentCycleTotalFiat: Number(i.currentCycleTotalFiat || 0),
            currentCycleFiatSpent: Number(i.currentCycleFiatSpent || 0),
            currentCycleRecoveredUSDT: Number(i.currentCycleRecoveredUSDT || 0),
            currentCycleProfitUSDT: Number(i.currentCycleProfitUSDT || 0),
            currentCycleProfitFiat: Number(i.currentCycleProfitFiat || 0),
            currentCycleProfitPercent: Number(i.currentCycleProfitPercent || 0),
            lastSellRate: Number(i.lastSellRate || 0),
            realizedFiatBase: Number(i.realizedFiatBase || 0),
            realizedVolumeUSDT: Number(i.realizedVolumeUSDT || 0),
            spreadBuyUsdt: Number(i.spreadBuyUsdt || 0),
            spreadSellUsdt: Number(i.spreadSellUsdt || 0),
            spreadProfitUsdt: Number(i.spreadProfitUsdt || 0),
            weightedBreakEvenRate: Number(i.weightedBreakEvenRate || 0),
            buyVolUSDT: Number(i.buyVolUSDT || 0),
            sellVolUSDT: Number(i.sellVolUSDT || 0),
            feeBuy: Number(trf.buyFee || 0) + Number(pm.buyFee || 0),
            feeSell: Number(trf.sellFee || 0) + Number(pm.sellFee || 0),
            trf,
            pm
        };
    });

    const defaultBanks = ['Mercantil', 'Banesco', 'BNC', 'BBVA/Provincial', 'Bancamiga', 'BANK'];

    defaultBanks.forEach(dbParams => {
        const exists = bankData.find(b => {
            const bId = (b.bank || '').toLowerCase().trim();
            const dbId = dbParams.toLowerCase().trim();
            if (bId === dbId) return true;
            if (dbId.includes('provincial') && bId.includes('provincial')) return true;
            return false;
        });

        if (!exists) {
            const globalFavorites = kpis.favorites || [];
            const isFav = globalFavorites.some(f => f.toLowerCase().trim() === dbParams.toLowerCase().trim());

            bankData.push({
                bank: dbParams,
                bankName: dbParams,
                fiatBalance: 0,
                profit: 0,
                ledgerSpreadReady: false,
                profitPercent: 0,
                activeVerdictsCount: 0,
                avgBuyRate: 0,
                avgSellRate: 0,
                buyRate: 0,
                sellRate: 0,
                weightedAvgBuyRate: 0,
                weightedAvgSellRate: 0,
                ceilingRate: 0,
                ceilingAppliedPercent: 0,
                currentCycleSaleUSDT: 0,
                currentCycleProgress: 0,
                currentCycleFiatRemaining: 0,
                currentCycleTotalFiat: 0,
                currentCycleFiatSpent: 0,
                currentCycleRecoveredUSDT: 0,
                currentCycleProfitUSDT: 0,
                currentCycleProfitFiat: 0,
                currentCycleProfitPercent: 0,
                lastSellRate: 0,
                realizedFiatBase: 0,
                realizedVolumeUSDT: 0,
                spreadBuyUsdt: 0,
                spreadSellUsdt: 0,
                spreadProfitUsdt: 0,
                weightedBreakEvenRate: 0,
                margin: 0,
                buyVolUSDT: 0,
                sellVolUSDT: 0,
                trf: { buyCount: 0, sellCount: 0, buyVol: 0, sellVol: 0, buyFee: 0, sellFee: 0 },
                pm: { buyCount: 0, sellCount: 0, buyVol: 0, sellVol: 0, buyFee: 0, sellFee: 0, avgBuyRate: 0, avgSellRate: 0 },
                isFavorite: isFav
            });
        }
    });

    syncCriticalProfitFromBanks(kpis, metrics, bankData);

    return { metrics, bankData, kpis };
}

export async function updateDashboard(API_BASE, token, alias, range = {}, opts = {}) {
    if (!token) return;

    const {
        preserveInFlight = false,
        showLoading = false,
        skipFastFollowUp = false,
        bootstrap = false
    } = opts || {};
    let requestTimeoutCleared = false;
    if (preserveInFlight && dashboardAbortController) {
        return;
    }

    if (showLoading) {
        clearDashboardFastFollowUp();
        clearDashboardBootstrapHydration();
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

        const mainRange = normalizeRange(range);
        updateSidebarRangeLabel(mainRange);

        const updateEl = document.getElementById('last-update');
        if (updateEl) updateEl.textContent = "Sincronizando con Sentinel...";

        const kpis = await fetchDashboardKpis(
            API_BASE,
            token,
            mainRange,
            dashboardAbortController.signal,
            { bootstrap }
        );

        if (!kpis) {
            return;
        }
        clearTimeout(requestTimeout);
        requestTimeoutCleared = true;
        if (requestSeq !== dashboardRequestSeq) {
            return;
        }

        // Si es una carga explícita (cambio de filtro), ocultamos el modal.
        // Si no (background refresh), usamos la caché del ledger actual,
        // ya que el balanceLedger UI no volverá a llamar a onBankDataUpdate si no tiene data nueva.
        if (showLoading) {
            cachedLedgerBankData = [];
            syncCoverageAlertModal(kpis, [], mainRange);
        } else {
            syncCoverageAlertModal(kpis, cachedLedgerBankData, mainRange);
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
                ledgerSpreadReady: false,
                profitPercent: Number(i.profitPercent || i.margin || 0),
                activeVerdictsCount: Number(i.activeVerdictsCount || 0),
                avgBuyRate: Number(i.avgBuyRate || 0),
                avgSellRate: Number(i.avgSellRate || 0),
                buyRate: Number(i.buyRate || i.avgBuyRate || 0),
                sellRate: Number(i.sellRate || i.avgSellRate || 0),
                ceilingRate: Number(i.ceilingRate || 0),
                ceilingAppliedPercent: Number(i.ceilingAppliedPercent || 0),
                currentCycleSaleUSDT: Number(i.currentCycleSaleUSDT || 0),
                currentCycleProgress: Number(i.currentCycleProgress || 0),
                currentCycleFiatRemaining: Number(i.currentCycleFiatRemaining || 0),
                currentCycleTotalFiat: Number(i.currentCycleTotalFiat || 0),
                currentCycleFiatSpent: Number(i.currentCycleFiatSpent || 0),
                currentCycleRecoveredUSDT: Number(i.currentCycleRecoveredUSDT || 0),
                currentCycleProfitUSDT: Number(i.currentCycleProfitUSDT || 0),
                currentCycleProfitFiat: Number(i.currentCycleProfitFiat || 0),
                currentCycleProfitPercent: Number(i.currentCycleProfitPercent || 0),
                lastSellRate: Number(i.lastSellRate || 0),
                realizedFiatBase: Number(i.realizedFiatBase || 0),
                realizedVolumeUSDT: Number(i.realizedVolumeUSDT || 0),
                spreadBuyUsdt: Number(i.spreadBuyUsdt || 0),
                spreadSellUsdt: Number(i.spreadSellUsdt || 0),
                spreadProfitUsdt: Number(i.spreadProfitUsdt || 0),
                weightedBreakEvenRate: Number(i.weightedBreakEvenRate || 0),

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
        const requiredBankKeys = getRequiredBankKeys(kpis);
        const globalFavorites = Array.isArray(kpis.favorites) ? kpis.favorites : [];
        const favoriteKeys = new Set(globalFavorites.map(normalizeBankKey).filter(Boolean));

        requiredBankKeys.forEach((bankKey) => {
            const exists = bankData.some((bank) => normalizeBankKey(bank.bank || bank.bankName) === bankKey);
            if (!exists) {
                const bankLabel = bankLabelFromKey(bankKey);
                const isFav = favoriteKeys.has(bankKey);

                bankData.push({
                    bank: bankLabel,
                    bankName: bankLabel,
                    // Campos Source of Truth (Inicializados en 0)
                    fiatBalance: 0,
                    usdtBalance: 0,
                    profit: 0,
                    ledgerSpreadReady: false,
                    profitPercent: 0,
                    activeVerdictsCount: 0,
                    avgBuyRate: 0,
                    avgSellRate: 0,
                    buyRate: 0,
                    sellRate: 0,
                    weightedAvgBuyRate: 0,
                    weightedAvgSellRate: 0,
                    ceilingRate: 0,
                    ceilingAppliedPercent: 0,
                    currentCycleSaleUSDT: 0,
                    currentCycleProgress: 0,
                    currentCycleFiatRemaining: 0,
                    currentCycleTotalFiat: 0,
                    currentCycleFiatSpent: 0,
                    currentCycleRecoveredUSDT: 0,
                    currentCycleProfitUSDT: 0,
                    currentCycleProfitFiat: 0,
                    currentCycleProfitPercent: 0,
                    lastSellRate: 0,
                    realizedFiatBase: 0,
                    realizedVolumeUSDT: 0,
                    spreadBuyUsdt: 0,
                    spreadSellUsdt: 0,
                    spreadProfitUsdt: 0,
                    weightedBreakEvenRate: 0,
                    margin: 0,
                    buyVolUSDT: 0,
                    sellVolUSDT: 0,
                    trf: { buyCount: 0, sellCount: 0, buyVol: 0, sellVol: 0, buyFee: 0, sellFee: 0 },
                    pm: { buyCount: 0, sellCount: 0, buyVol: 0, sellVol: 0, buyFee: 0, sellFee: 0, avgBuyRate: 0, avgSellRate: 0 },
                    isFavorite: isFav
                });
            }
        });

        // Mantener el profit neto canonico del backend. Si no llega, reconstruir
        // un fallback desde judge - fees de venta para no inflar el KPI.
        syncCriticalProfitFromBanks(kpis, metrics, bankData);

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
            updateBancosUI(bankData, kpis);
        }

        // updateDispersorUI(kpis); // REMOVED

        // Sincronizamos el Profit UI (usando datos críticos del backend)
        updateProfitUI(kpis, bankData);

        updateProyeccionesUI(kpis, range);

        // --- SECCIONES DE CARTERAS (LOGÍSTICA) ---
        updateBalanceLedgerUI(kpis, {
            apiBase: API_BASE,
            token,
            range: mainRange,
            onAuthError: handleExpiredSession,
            bankData,
            onBankDataUpdate: (updatedBankData, ledgerSummary) => {
                cachedLedgerBankData = updatedBankData;
                updateSidebarMonitor(kpis, updatedBankData, ledgerSummary);
                updateProfitUI(kpis, updatedBankData, ledgerSummary);
                syncCoverageAlertModal(kpis, updatedBankData, mainRange);
            },
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

        if (showLoading && !skipFastFollowUp) {
            scheduleDashboardFastFollowUp(API_BASE, token, alias, mainRange);
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
        if (!requestTimeoutCleared) {
            clearTimeout(requestTimeout);
        }
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
        btn.classList.toggle('kpi-preset-btn-active', isActive);
        btn.classList.toggle('border-gray-800', !isActive);
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
    const audit = kpis.audit || {};

    const liveBalance =
        summary.totalBalance ??
        kpis.currentBalance ??
        audit.realBalance ??
        critical.balanceTotal ??
        summary.balance ??
        0;
    inject('kpi-balance', fUSDT(liveBalance));

    const beValue = critical.breakEvenRate ?? summary.minBuyRate ?? summary.breakEven;
    inject('kpi-breakeven', beValue ? (typeof beValue === 'number' ? beValue.toFixed(2) : beValue) : '---');

    inject('kpi-margin', pct(critical.globalMarginPercent ?? summary.globalMarginPct), true);

    // El backend envía el PROFIT NETO directamente, no hacer cálculos aquí.
    const profitToDisplay = critical.profitTotalUSDT ?? (manualProfit !== null ? manualProfit : (summary.totalProfit ?? summary.profit ?? 0));
    inject('kpi-profit', fUSDT(profitToDisplay), true);

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
