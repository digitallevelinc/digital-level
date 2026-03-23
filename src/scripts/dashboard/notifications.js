let notificationsPollTimer = null;
let notificationsOpen = false;

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatTimestamp(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return 'Ahora';
    return new Intl.DateTimeFormat('es-VE', {
        dateStyle: 'short',
        timeStyle: 'short'
    }).format(date);
}

export function initDashboardNotifications({ apiBase, token }) {
    const root = document.getElementById('dashboard-notifications');
    const toggle = document.getElementById('dashboard-notifications-btn');
    const panel = document.getElementById('dashboard-notifications-panel');
    const badge = document.getElementById('dashboard-notifications-badge');
    const list = document.getElementById('dashboard-notifications-list');
    const markReadBtn = document.getElementById('dashboard-notifications-mark-read');

    if (!root || !toggle || !panel || !badge || !list || !token) return;

    const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    const setOpen = (open) => {
        notificationsOpen = Boolean(open);
        panel.classList.toggle('hidden', !notificationsOpen);
        toggle.setAttribute('aria-expanded', notificationsOpen ? 'true' : 'false');
    };

    const render = (items = [], unreadCount = 0) => {
        const unread = Number(unreadCount || 0);
        badge.textContent = unread > 99 ? '99+' : String(unread);
        badge.classList.toggle('hidden', unread <= 0);

        if (!Array.isArray(items) || items.length === 0) {
            list.innerHTML = '<div class="px-4 py-5 text-center text-sm font-bold text-white/50">Sin notificaciones por ahora.</div>';
            return;
        }

        list.innerHTML = items.map((item) => {
            const unreadClass = item?.readAt ? 'border-white/8 bg-white/[0.03]' : 'border-[#F3BA2F]/25 bg-[#F3BA2F]/[0.06]';
            return `
                <article class="rounded-2xl border ${unreadClass} px-4 py-3">
                    <p class="text-[12px] font-black uppercase tracking-[0.16em] text-[#F3BA2F]">${escapeHtml(item?.title || 'Notificacion')}</p>
                    <p class="mt-2 text-sm leading-relaxed text-white/80">${escapeHtml(item?.message || '')}</p>
                    <p class="mt-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/40">${escapeHtml(formatTimestamp(item?.createdAt))}</p>
                </article>
            `;
        }).join('');
    };

    const fetchNotifications = async () => {
        const res = await fetch(`${String(apiBase || '').replace(/\/+$/, '')}/api/notifications?limit=12&t=${Date.now()}`, {
            headers,
            cache: 'no-store'
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({ items: [], unreadCount: 0 }));
        render(data?.items || [], data?.unreadCount || 0);
    };

    const markRead = async () => {
        await fetch(`${String(apiBase || '').replace(/\/+$/, '')}/api/notifications/read`, {
            method: 'POST',
            headers,
            body: JSON.stringify({})
        });
        await fetchNotifications();
    };

    if (notificationsPollTimer) {
        clearInterval(notificationsPollTimer);
        notificationsPollTimer = null;
    }

    toggle.addEventListener('click', async (event) => {
        event.stopPropagation();
        const nextOpen = !notificationsOpen;
        setOpen(nextOpen);
        if (nextOpen) {
            await fetchNotifications();
            await markRead();
        }
    });

    markReadBtn?.addEventListener('click', async (event) => {
        event.stopPropagation();
        await markRead();
    });

    document.addEventListener('click', (event) => {
        if (!notificationsOpen) return;
        if (root.contains(event.target)) return;
        setOpen(false);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && notificationsOpen) {
            setOpen(false);
        }
    });

    void fetchNotifications();
    notificationsPollTimer = setInterval(() => {
        if (document.hidden) return;
        void fetchNotifications();
    }, 15000);
}
