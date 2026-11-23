/*
 * Runtime configuration.
 * apiBase: URL of the TradeDesk backend, e.g. "https://tradedesk-api.onrender.com".
 *   - Leave "" when the backend serves this folder itself (local: `uvicorn backend.app:app`).
 *   - On GitHub Pages this file is rewritten by .github/workflows/pages.yml from the
 *     repository variable API_BASE_URL.
 */
window.TD_CONFIG = { apiBase: "" };
