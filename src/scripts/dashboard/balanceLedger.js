const CARACAS_TZ = 'America/Caracas';

const state = {
    apiBase: '',
    token: '',
    range: {},
    kpis: {},
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 0,
    loadedOnce: false,
    needsRefresh: true,
    initialized: false,
    requestSeq: 0,
    abortController: null,
    onAuthError: null,
    searchTerm: '',
    currentTransfers: [],
    pageNetByPage: new Map(),
};

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatNumber = (value, decimals = 2, locale = 'es-VE') => Number(value || 0).toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
});

const formatUsd = (value) => `$${formatNumber(value, 2, 'en-US')}`;
const toFiniteNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const getCategory = (type) => {
    if (!type) return 'OTRO';
    if (type.startsWith('P2P_')) return 'P2P';
    if (type.startsWith('PAY_')) return 'PAY';
    if (type === 'DEPOSIT' || type === 'WITHDRAWAL' || type === 'DIVIDEND') return 'RED';
    if (type === 'INTERNAL_TRANSFER') return 'SWITCH';
    return 'OTRO';
};

const getDirection = (type) => {
    switch (String(type || '').toUpperCase()) {
        case 'P2P_BUY':
        case 'PAY_RECEIVED':
        case 'DEPOSIT':
        case 'DIVIDEND':
            return 1;
        case 'P2P_SELL':
        case 'PAY_SENT':
        case 'WITHDRAWAL':
            return -1;
        default:
            return 0;
    }
};

const getSignedAmount = (tx = {}) => {
    const type = String(tx?.type || '').toUpperCase();
    const status = String(tx?.status || '').toUpperCase();
    const asset = String(tx?.asset || '').toUpperCase();
    const pm = String(tx?.paymentMethod || '').toUpperCase();
    const walletFrom = String(tx?.walletFrom || '').toUpperCase();
    const walletTo = String(tx?.walletTo || '').toUpperCase();
    const amount = toFiniteNumber(tx?.amount);

    if (!amount) return 0;
    if (status && status !== 'SUCCESS') return 0;

    // Balance corrido del modulo: solo USDT.
    if (asset && asset !== 'USDT') return 0;

    let delta = 0;

    switch (type) {
        case 'P2P_BUY':
        case 'PAY_RECEIVED':
        case 'DEPOSIT':
        case 'DIVIDEND':
            delta += amount;
            break;
        case 'P2P_SELL':
        case 'PAY_SENT':
        case 'WITHDRAWAL':
            delta -= amount;
            break;
        case 'CONVERT':
        case 'SPOT_TRADE':
            if (pm === 'CONVERT_IN' || pm === 'SPOT_SELL') delta += amount;
            else if (pm === 'CONVERT_OUT' || pm === 'SPOT_BUY') delta -= amount;
            break;
        case 'INTERNAL_TRANSFER': {
            const monitored = new Set(['MAIN', 'FUNDING', 'SPOT']);
            const fromMonitored = monitored.has(walletFrom);
            const toMonitored = monitored.has(walletTo);
            if (fromMonitored && !toMonitored) delta -= amount;
            else if (!fromMonitored && toMonitored) delta += amount;
            break;
        }
        default:
            break;
    }

    const fee = toFiniteNumber(tx?.fee);
    const feeCurrency = String(tx?.feeCurrency || '').toUpperCase();
    if (fee > 0 && (!feeCurrency || feeCurrency === 'USDT')) {
        delta -= fee;
    }

    return delta;
};

const getLedgerAnchorBalance = (kpis = {}) => {
    const candidates = [
        kpis?.metrics?.totalBalance,
        kpis?.currentBalance,
        kpis?.audit?.realBalance,
        kpis?.metrics?.balance,
        kpis?.summary?.balance,
    ];

    for (const candidate of candidates) {
        const n = Number(candidate);
        if (Number.isFinite(n)) return n;
    }

    const wallets = kpis?.wallets || {};
    const walletsSum = Number(wallets.balanceP2P || 0)
        + Number(wallets.balancePay || 0)
        + Number(wallets.balanceRed || 0)
        + Number(wallets.balanceSwitch || 0);

    return Number.isFinite(walletsSum) ? walletsSum : 0;
};

const getKnownNetBeforePage = (page) => {
    if (page <= 1) return 0;

    let netBefore = 0;
    for (let i = 1; i < page; i += 1) {
        if (!state.pageNetByPage.has(i)) return null;
        netBefore += Number(state.pageNetByPage.get(i) || 0);
    }

    return netBefore;
};

const getCategoryTone = (category) => {
    switch (category) {
        case 'P2P':
            return 'text-[#f7c948]';
        case 'PAY':
            return 'text-sky-300';
        case 'RED':
            return 'text-violet-300';
        case 'SWITCH':
            return 'text-emerald-300';
        default:
            return 'text-white/55';
    }
};

const formatPostingDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
        timeZone: CARACAS_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const formatRate = (rate) => {
    const n = Number(rate || 0);
    return n > 0 ? `RATE ${formatNumber(n, 2)}` : '';
};

const formatFeeMeta = (tx) => {
    const fee = toFiniteNumber(tx?.fee);
    if (fee <= 0) return '';
    return `FEE ${formatUsd(fee)}`;
};

const maskCounterpartyName = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    return raw;
};

const buildDescriptionTop = (tx) => {
    if (tx?.counterpartyName) return maskCounterpartyName(tx.counterpartyName);
    return tx?.notes || tx?.paymentMethod || 'Movimiento sin detalle';
};

const buildDescriptionMeta = (tx, topLine = '') => {
    const parts = [];
    const rateText = formatRate(tx?.exchangeRate);
    const feeText = formatFeeMeta(tx);
    const status = String(tx?.status || '').toUpperCase();
    const asset = String(tx?.asset || '').toUpperCase();
    const fiatCurrency = String(tx?.fiatCurrency || '').toUpperCase();

    // Keep sender/receiver identity only in the top line to avoid redundancy.
    if (tx?.paymentMethod) parts.push(tx.paymentMethod);
    if (asset) parts.push(asset);
    if (fiatCurrency) parts.push(fiatCurrency);
    if (feeText) parts.push(feeText);
    if (rateText) parts.push(rateText);
    if (tx?.tradeType) parts.push(`TRADE ${tx.tradeType}`);
    if (tx?.orderNumber) parts.push(`ORDER ${tx.orderNumber}`);
    if (tx?.counterpartyId && tx?.counterpartyName !== topLine) {
        parts.push(`ID ${tx.counterpartyId}`);
    }
    if (tx?.walletFrom || tx?.walletTo) {
        parts.push(`${tx.walletFrom || '?'}->${tx.walletTo || '?'}`);
    }
    if (status && status !== 'SUCCESS') parts.push(`STATUS ${status}`);
    if (tx?.notes && tx?.notes !== topLine) parts.push(tx.notes);
    return parts;
};

const getTxRate = (tx) => {
    const directRate = Number(tx?.exchangeRate || 0);
    if (directRate > 0) return directRate;

    const amount = Math.abs(Number(tx?.amount || 0));
    const fiatAmount = Math.abs(Number(tx?.fiatAmount || 0));
    if (amount > 0 && fiatAmount > 0) return fiatAmount / amount;

    return 0;
};

const resolveFiatAmount = (tx) => {
    const fiatAmount = Math.abs(Number(tx?.fiatAmount || 0));
    if (fiatAmount > 0) return fiatAmount;

    const amount = Math.abs(Number(tx?.amount || 0));
    if (amount <= 0) return 0;

    const rate = getTxRate(tx);
    if (rate > 0) return amount * rate;

    // Ultimo recurso: mostrar el monto base como FIAT para evitar huecos de datos en UI.
    return amount;
};

const formatFiat = (tx) => {
    const fiatResolved = resolveFiatAmount(tx);
    return `${formatNumber(fiatResolved, 2)} FIAT`;
};

const formatAmount = (tx) => {
    const direction = getDirection(tx?.type);
    const amount = Number(tx?.amount || 0);
    const sign = direction < 0 ? '-' : direction > 0 ? '+' : '';
    return `${sign}${formatUsd(Math.abs(amount))}`;
};

const getElements = () => ({
    panel: document.getElementById('balance-ledger-panel'),
    body: document.getElementById('balance-ledger-body'),
    count: document.getElementById('balance-ledger-count'),
    results: document.getElementById('balance-ledger-results'),
    pageIndicator: document.getElementById('balance-ledger-page-indicator'),
    prevBtn: document.getElementById('balance-ledger-prev'),
    nextBtn: document.getElementById('balance-ledger-next'),
    scroll: document.getElementById('balance-ledger-scroll'),
    searchInput: document.getElementById('balance-ledger-search'),
});

const sanitizeDateValue = (value) => {
    const trimmed = String(value ?? '').trim();
    return trimmed || undefined;
};

const isSameRange = (a = {}, b = {}) => sanitizeDateValue(a?.from) === sanitizeDateValue(b?.from)
    && sanitizeDateValue(a?.to) === sanitizeDateValue(b?.to);

const buildTransfersUrl = (apiBase, range = {}, page = 1, limit = 12) => {
    const params = new URLSearchParams();
    const from = sanitizeDateValue(range?.from);
    const to = sanitizeDateValue(range?.to);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    params.set('page', String(page));
    params.set('limit', String(limit));
    params.set('_ts', String(Date.now()));
    return `${String(apiBase || '').replace(/\/+$/, '')}/api/transfers?${params.toString()}`;
};

const updatePaginationUI = () => {
    const { results, pageIndicator, prevBtn, nextBtn } = getElements();
    if (results) results.textContent = `${state.total} Resultados`;
    if (pageIndicator) pageIndicator.textContent = `Pagina ${state.totalPages ? state.page : 0} / ${state.totalPages}`;
    if (prevBtn) prevBtn.disabled = state.page <= 1 || state.totalPages === 0;
    if (nextBtn) nextBtn.disabled = state.page >= state.totalPages || state.totalPages === 0;
};

const renderPlaceholder = (message, toneClass = 'text-white/45') => {
    const { body } = getElements();
    if (!body) return;
    body.innerHTML = `
        <div class="px-4 py-10 text-center text-[15px] font-medium ${toneClass} md:px-6">
            ${escapeHtml(message)}
        </div>
    `;
};

const renderLoading = () => {
    const { count } = getElements();
    if (count) count.textContent = `Cargando pagina ${state.page}...`;
    renderPlaceholder('Cargando historial...');
};

const renderError = (message) => {
    const { count } = getElements();
    if (count) count.textContent = 'No se pudo cargar el historial';
    state.total = 0;
    state.totalPages = 0;
    updatePaginationUI();
    renderPlaceholder(message, 'text-rose-300');
};

const renderEmpty = () => {
    const { count } = getElements();
    if (count) count.textContent = 'Sin movimientos en el rango actual';
    state.total = 0;
    state.totalPages = 0;
    state.currentTransfers = [];
    updatePaginationUI();
    renderPlaceholder('Sin movimientos para el rango seleccionado.');
};

const matchesSearch = (tx, searchTerm) => {
    const needle = String(searchTerm || '').trim().toLowerCase();
    if (!needle) return true;

    const haystack = [
        tx?.counterpartyName,
        tx?.paymentMethod,
        tx?.notes,
        tx?.orderNumber,
        tx?.txHash,
        tx?.binanceRawId,
        tx?.type,
        tx?.fiatCurrency,
        formatRate(tx?.exchangeRate),
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    return haystack.includes(needle);
};

const buildRowsWithBalance = (transfers = []) => {
    const rows = Array.isArray(transfers) ? transfers : [];
    const pageNet = rows.reduce((sum, tx) => sum + getSignedAmount(tx), 0);
    state.pageNetByPage.set(state.page, pageNet);

    const anchorBalance = getLedgerAnchorBalance(state.kpis);
    const knownNetBefore = getKnownNetBeforePage(state.page);
    let runningBalance = anchorBalance - Number(knownNetBefore || 0);

    return rows.map((tx) => {
        const row = {
            tx,
            balance: runningBalance,
        };
        runningBalance -= getSignedAmount(tx);
        return row;
    });
};

const renderRow = (tx, rowBalance) => {
    const category = getCategory(tx.type);
    const signedAmount = getSignedAmount(tx);
    const amountTone = signedAmount < 0 ? 'text-red-400' : 'text-white';
    const balanceTone = rowBalance < 0 ? 'text-red-400' : 'text-white';
    const topRaw = buildDescriptionTop(tx);
    const top = escapeHtml(topRaw);
    const meta = buildDescriptionMeta(tx, topRaw);
    const metaHtml = meta.map((line) => `<span>${escapeHtml(line)}</span>`).join('<span class="text-white/18">|</span>');

    return `
        <article class="grid gap-2 px-4 py-2 md:px-5 lg:grid-cols-[128px_minmax(300px,1.5fr)_92px_minmax(150px,0.9fr)_minmax(150px,0.9fr)] lg:items-center">
            <div class="text-[11px] font-semibold text-white/72">${escapeHtml(formatPostingDate(tx.timestamp))}</div>
            <div class="min-w-0">
                <div class="break-words text-[14px] font-semibold text-white">${top}</div>
                <div class="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] font-medium text-white/78">${metaHtml || '<span class="text-white/60">Sin metadata extra</span>'}</div>
            </div>
            <div class="text-left lg:text-center">
                <span class="text-[0.95rem] font-black uppercase tracking-[0.12em] ${getCategoryTone(category)}">${category}</span>
            </div>
            <div class="text-left lg:text-right">
                <div class="text-[1.15rem] font-black leading-none ${amountTone}">${formatAmount(tx)}</div>
                <div class="mt-0.5 text-[10px] font-semibold text-white/72">${escapeHtml(formatFiat(tx))}</div>
            </div>
            <div class="text-left lg:text-right">
                <div class="text-[1rem] font-black leading-none ${balanceTone}">${rowBalance < 0 ? '-' : ''}${formatUsd(Math.abs(rowBalance))}</div>
                <div class="mt-0.5 text-[10px] font-medium text-white/72">${escapeHtml(formatFiat(tx))}</div>
            </div>
        </article>
    `;
};

const renderTransfers = (transfers = []) => {
    const { body, count, scroll } = getElements();
    if (!body) return;

    const allTransfers = Array.isArray(transfers) ? transfers : [];
    state.currentTransfers = allTransfers;

    if (allTransfers.length === 0) {
        renderEmpty();
        return;
    }

    const rowsWithBalance = buildRowsWithBalance(allTransfers);
    const filteredRows = rowsWithBalance.filter(({ tx }) => matchesSearch(tx, state.searchTerm));

    if (count) {
        const suffix = state.searchTerm ? ` | ${filteredRows.length} visibles` : '';
        count.textContent = `Mostrando ${allTransfers.length} movimiento${allTransfers.length === 1 ? '' : 's'} de ${state.total}${suffix}`;
    }

    if (filteredRows.length === 0) {
        body.innerHTML = `
            <div class="px-4 py-10 text-center text-[14px] font-medium text-white/45 md:px-6">
                No hay coincidencias en esta pagina.
            </div>
        `;
        updatePaginationUI();
        if (scroll) scroll.scrollTop = 0;
        return;
    }

    body.innerHTML = filteredRows.map(({ tx, balance }) => renderRow(tx, balance)).join('');
    updatePaginationUI();
    if (scroll) scroll.scrollTop = 0;
};

const fetchTransfersPage = async (page = 1) => {
    if (!state.apiBase || !state.token) return;

    if (state.abortController) {
        state.abortController.abort();
    }

    state.page = page;
    state.abortController = new AbortController();
    const requestSeq = ++state.requestSeq;
    renderLoading();
    updatePaginationUI();

    try {
        const res = await fetch(buildTransfersUrl(state.apiBase, state.range, page, state.limit), {
            headers: {
                'Authorization': `Bearer ${state.token}`
            },
            cache: 'no-store',
            signal: state.abortController.signal
        });

        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                state.onAuthError?.();
                return;
            }
            let detail = '';
            try {
                detail = await res.text();
            } catch {
                detail = '';
            }
            throw new Error(`HTTP ${res.status}${detail ? ` - ${detail.slice(0, 160)}` : ''}`);
        }

        const payload = await res.json();
        if (requestSeq !== state.requestSeq) return;

        const pagination = payload?.pagination || {};
        state.total = Number(pagination.total || 0);
        state.totalPages = Number(pagination.totalPages || 0);
        state.page = Number(pagination.page || page);
        state.loadedOnce = true;
        state.needsRefresh = false;

        renderTransfers(Array.isArray(payload?.transfers) ? payload.transfers : []);
    } catch (error) {
        if (error?.name === 'AbortError') return;
        console.warn('No fue posible cargar el historial de balance:', error);
        renderError('No fue posible cargar el historial. Intenta de nuevo.');
    } finally {
        if (requestSeq === state.requestSeq) {
            state.abortController = null;
        }
    }
};

const bindEventsOnce = () => {
    if (state.initialized) return;
    state.initialized = true;

    const { prevBtn, nextBtn, searchInput } = getElements();

    prevBtn?.addEventListener('click', () => {
        if (state.page <= 1) return;
        void fetchTransfersPage(state.page - 1);
    });

    nextBtn?.addEventListener('click', () => {
        if (state.page >= state.totalPages) return;
        void fetchTransfersPage(state.page + 1);
    });

    searchInput?.addEventListener('input', (event) => {
        state.searchTerm = String(event?.target?.value || '').trim();
        renderTransfers(state.currentTransfers);
    });
};

export const updateBalanceLedgerUI = (kpis = {}, context = {}) => {
    bindEventsOnce();

    const nextRange = {
        from: sanitizeDateValue(context?.range?.from),
        to: sanitizeDateValue(context?.range?.to),
    };
    const rangeChanged = !isSameRange(state.range, nextRange);
    const apiChanged = state.apiBase !== String(context?.apiBase || '').trim();
    const tokenChanged = state.token !== String(context?.token || '').trim();

    state.kpis = kpis || {};
    state.apiBase = String(context?.apiBase || '').trim();
    state.token = String(context?.token || '').trim();
    state.range = nextRange;
    state.onAuthError = typeof context?.onAuthError === 'function' ? context.onAuthError : null;

    const { searchInput } = getElements();
    if (searchInput && searchInput.value !== state.searchTerm) {
        searchInput.value = state.searchTerm;
    }

    if (!state.loadedOnce) {
        state.pageNetByPage.clear();
        state.needsRefresh = true;
        state.total = 0;
        state.totalPages = 0;
        updatePaginationUI();
        renderPlaceholder('Cargando historial...');
        void fetchTransfersPage(1);
        return;
    }

    if (rangeChanged || apiChanged || tokenChanged) {
        state.pageNetByPage.clear();
        state.needsRefresh = true;
        state.total = 0;
        state.totalPages = 0;
        updatePaginationUI();
        renderPlaceholder('Actualizando historial...');
        void fetchTransfersPage(1);
        return;
    }

    if (state.currentTransfers.length > 0) {
        renderTransfers(state.currentTransfers);
    }
};
