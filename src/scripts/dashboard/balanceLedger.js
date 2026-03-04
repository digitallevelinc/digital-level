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

const getCategory = (type) => {
    if (!type) return 'OTRO';
    if (type.startsWith('P2P_')) return 'P2P';
    if (type.startsWith('PAY_')) return 'PAY';
    if (type === 'DEPOSIT' || type === 'WITHDRAWAL' || type === 'DIVIDEND') return 'RED';
    if (type === 'INTERNAL_TRANSFER') return 'SWITCH';
    return 'OTRO';
};

const getDirection = (type) => {
    switch (type) {
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

const getCategoryBalance = (kpis, category) => {
    const wallets = kpis?.wallets || {};
    switch (category) {
        case 'P2P':
            return Number(wallets.balanceP2P || 0);
        case 'PAY':
            return Number(wallets.balancePay || 0);
        case 'RED':
            return Number(wallets.balanceRed || 0);
        case 'SWITCH':
            return Number(wallets.balanceSwitch || 0);
        default:
            return 0;
    }
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

const buildDescriptionTop = (tx) => tx?.counterpartyName
    || tx?.paymentMethod
    || tx?.notes
    || 'Movimiento sin detalle';

const buildDescriptionMeta = (tx) => {
    const parts = [];
    const rateText = formatRate(tx?.exchangeRate);
    if (tx?.paymentMethod) parts.push(tx.paymentMethod);
    if (tx?.counterpartyName) parts.push(tx.counterpartyName);
    if (rateText) parts.push(rateText);
    if (tx?.orderNumber) parts.push(`ORDER ${tx.orderNumber}`);
    if (tx?.txHash || tx?.binanceRawId) parts.push(`TX ${tx.txHash || tx.binanceRawId}`);
    return parts.slice(0, 3);
};

const formatFiat = (tx) => {
    const fiatAmount = Number(tx?.fiatAmount || 0);
    if (fiatAmount) {
        return `${formatNumber(Math.abs(fiatAmount), 2)} ${escapeHtml(tx?.fiatCurrency || 'FIAT')}`;
    }
    const rateText = formatRate(tx?.exchangeRate);
    return rateText || 'SIN DATO FIAT';
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

const renderRow = (tx, kpis) => {
    const category = getCategory(tx.type);
    const signedAmount = Number(tx?.amount || 0) * getDirection(tx?.type);
    const amountTone = signedAmount < 0 ? 'text-red-400' : 'text-white';
    const categoryBalance = getCategoryBalance(kpis, category);
    const balanceTone = categoryBalance < 0 ? 'text-red-400' : 'text-white';
    const top = escapeHtml(buildDescriptionTop(tx));
    const meta = buildDescriptionMeta(tx);
    const metaHtml = meta.map((line) => `<span>${escapeHtml(line)}</span>`).join('<span class="text-white/18">|</span>');

    return `
        <article class="grid gap-3 px-4 py-3 md:px-5 lg:grid-cols-[128px_minmax(0,1.6fr)_82px_120px_128px] lg:items-center">
            <div class="text-[11px] font-semibold text-white/42">${escapeHtml(formatPostingDate(tx.timestamp))}</div>
            <div class="min-w-0">
                <div class="break-words text-[14px] font-semibold text-white">${top}</div>
                <div class="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-white/40">${metaHtml || '<span>Sin metadata extra</span>'}</div>
            </div>
            <div class="text-left lg:text-center">
                <span class="text-[0.95rem] font-black uppercase tracking-[0.12em] ${getCategoryTone(category)}">${category}</span>
            </div>
            <div class="text-left lg:text-right">
                <div class="text-[1.15rem] font-black leading-none ${amountTone}">${formatAmount(tx)}</div>
                <div class="mt-1 text-[10px] font-semibold text-white/40">${escapeHtml(formatFiat(tx))}</div>
            </div>
            <div class="text-left lg:text-right">
                <div class="text-[1rem] font-black leading-none ${balanceTone}">${categoryBalance < 0 ? '-' : ''}${formatUsd(Math.abs(categoryBalance))}</div>
                <div class="mt-1 text-[10px] font-medium text-white/35">Balance actual</div>
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

    const filteredTransfers = allTransfers.filter((tx) => matchesSearch(tx, state.searchTerm));

    if (count) {
        const suffix = state.searchTerm ? ` | ${filteredTransfers.length} visibles` : '';
        count.textContent = `Mostrando ${allTransfers.length} movimiento${allTransfers.length === 1 ? '' : 's'} de ${state.total}${suffix}`;
    }

    if (filteredTransfers.length === 0) {
        body.innerHTML = `
            <div class="px-4 py-10 text-center text-[14px] font-medium text-white/45 md:px-6">
                No hay coincidencias en esta pagina.
            </div>
        `;
        updatePaginationUI();
        if (scroll) scroll.scrollTop = 0;
        return;
    }

    body.innerHTML = filteredTransfers.map((tx) => renderRow(tx, state.kpis)).join('');
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
            throw new Error(`HTTP ${res.status}`);
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
        state.needsRefresh = true;
        state.total = 0;
        state.totalPages = 0;
        updatePaginationUI();
        renderPlaceholder('Cargando historial...');
        void fetchTransfersPage(1);
        return;
    }

    if (rangeChanged || apiChanged || tokenChanged) {
        state.needsRefresh = true;
        state.total = 0;
        state.totalPages = 0;
        updatePaginationUI();
        renderPlaceholder('Actualizando historial...');
        void fetchTransfersPage(1);
    }
};
