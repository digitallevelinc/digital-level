import socket
import subprocess
import time

from playwright.sync_api import sync_playwright


PORT = 4321
BASE_URL = f"http://127.0.0.1:{PORT}"


def wait_for_server(process: subprocess.Popen[bytes]) -> None:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("Digital Level E2E server exited before becoming ready")
        try:
            with socket.create_connection(("127.0.0.1", PORT), timeout=0.5):
                return
        except OSError:
            time.sleep(0.25)
    raise TimeoutError("Digital Level E2E server did not become ready within 30 seconds")


def api_handler(route):
    path = route.request.url.split("?", 1)[0]
    if path.endswith("/api/kpis"):
        return route.fulfill(json={
            "reportDate": "2026-08-18",
            "metrics": {"totalBalance": 1000, "simpleBalance": 1000},
            "operations": {},
            "critical": {},
            "config": {},
            "bankInsights": [],
            "judge": {"openVerdicts": []},
        })
    if path.endswith("/api/transfers"):
        return route.fulfill(json={
            "transfers": [
                {
                    "id": "large-sell", "timestamp": "2026-08-18T18:29:11.556Z",
                    "type": "P2P_SELL", "amount": 852.97, "asset": "USDT",
                    "status": "SUCCESS", "paymentMethod": "BancodeVenezuela",
                    "fiatAmount": 760000, "fiatCurrency": "VES",
                    "exchangeRate": 891, "fee": 1.49, "feeCurrency": "USDT",
                    "advertisementRole": "MAKER", "counterpartyName": "Venta grande prueba",
                },
                {
                    "id": "partial-buy", "timestamp": "2026-08-18T18:30:48.999Z",
                    "type": "P2P_BUY", "amount": 175.04, "asset": "USDT",
                    "status": "SUCCESS", "paymentMethod": "BancodeVenezuela",
                    "fiatAmount": 155120.448, "fiatCurrency": "VES",
                    "exchangeRate": 886.20, "fee": 0.30, "feeCurrency": "USDT",
                    "advertisementRole": "MAKER", "counterpartyName": "Recompra parcial prueba",
                },
                {
                    "id": "buy-fee", "timestamp": "2026-08-18T18:41:00.000Z",
                    "type": "P2P_BUY", "amount": 199.94, "asset": "USDT",
                    "status": "SUCCESS", "paymentMethod": "Bank",
                    "fiatAmount": 177186.83, "fiatCurrency": "VES",
                    "exchangeRate": 886.20, "fee": 0.34, "feeCurrency": "USDT",
                    "advertisementRole": "MAKER", "counterpartyName": "Compra prueba",
                },
                {
                    "id": "sell-source", "timestamp": "2026-08-18T18:40:00.000Z",
                    "type": "P2P_SELL", "amount": 198.23, "asset": "USDT",
                    "status": "SUCCESS", "paymentMethod": "BancodeVenezuela",
                    "fiatAmount": 177186.83, "fiatCurrency": "VES",
                    "exchangeRate": 891.17, "fee": 0, "feeCurrency": "USDT",
                    "advertisementRole": "MAKER", "counterpartyName": "Venta prueba",
                },
            ],
            "pagination": {"total": 4, "totalPages": 1, "page": 1},
            "closingBalance": 1000,
        })
    return route.fulfill(json={})


server = subprocess.Popen(
    ["npm", "run", "dev", "--", "--host", "127.0.0.1", "--port", str(PORT)],
)

try:
    wait_for_server(server)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1100})
        page.add_init_script("""
            sessionStorage.setItem('auth_token', 'e2e-token');
            sessionStorage.setItem('user_role', 'operator');
            sessionStorage.setItem('operator_alias', 'E2E');
            localStorage.setItem('api_base', 'http://127.0.0.1:4321');
        """)
        page.route("**/api/**", api_handler)
        page.goto(f"{BASE_URL}/dashboard/", wait_until="networkidle")

        buy_row = page.locator("#balance-ledger-body").get_by_text("Compra prueba").locator("xpath=ancestor::article")
        buy_row.wait_for(state="visible", timeout=20_000)
        assert "$1.03" in buy_row.inner_text(), buy_row.inner_text()

        tooltip_texts = buy_row.locator(".formula-popover").all_inner_texts()
        expected_formula = "198,2285 + 0,34 (fees) = 198,5685"
        expected_spread = "199,60 - 198,57 = 1,0315"
        assert any(expected_formula in text for text in tooltip_texts), tooltip_texts
        assert any(expected_spread in text for text in tooltip_texts), tooltip_texts

        partial_row = page.locator("#balance-ledger-body").get_by_text("Recompra parcial prueba").locator("xpath=ancestor::article")
        partial_row.wait_for(state="visible", timeout=20_000)
        assert "+$0.03" in partial_row.inner_text(), partial_row.inner_text()
        browser.close()
finally:
    server.terminate()
    try:
        server.wait(timeout=10)
    except subprocess.TimeoutExpired:
        server.kill()
        server.wait(timeout=5)
