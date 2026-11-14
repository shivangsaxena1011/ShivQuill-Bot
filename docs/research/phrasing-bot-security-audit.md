# Security Audit: Phrasing-Bot Reference Repository

## 1. Vulnerability Assessment Matrix

| Vulnerability ID | Category | Severity | Description in Phrasing-Bot | Remediation Required |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Denial of Service (DoS) | **CRITICAL** | Zero-value chunk size infinite loop locks Node event loop (`i += 0`). | Validate chunk size with floor of `Math.max(1, size)`. Default to safe chunk size (e.g. 3). |
| **SEC-02** | Memory Exhaustion (DoS) | **HIGH** | Unbounded global array `queue = []` retains all generations forever without TTL or size limits. | Implement LRU cache or Redis with strict TTL (e.g., 10 minutes) and automatic eviction. |
| **SEC-03** | Injection / Unvalidated Input | **HIGH** | `req.body.prompt`, `req.body.model`, `req.body.type` used without type or length checks. Huge payloads can crash memory. | Enforce strict schema validation (Zod) with max character limits (e.g., 20,000 chars). |
| **SEC-04** | Missing Rate Limiting | **HIGH** | No rate limiting on `/api/start-generation`. Any client can trigger thousands of LLM API calls, draining quotas. | Implement `express-rate-limit` per IP / API key. |
| **SEC-05** | CORS Misconfiguration | **MEDIUM** | `app.use(cors())` allows wildcard `*` origins, permitting cross-site request forgery or unauthorized consumption. | Configure specific trusted origins in production. |
| **SEC-06** | Missing Security Headers | **MEDIUM** | No security headers applied (missing Helmet, CSP, X-Frame-Options, X-Content-Type-Options). | Mount `helmet()` middleware with safe CSP and headers. |
| **SEC-07** | Prompt Injection Vulnerability | **HIGH** | Raw user text concatenated directly into user prompts without delimiter guards or instruction fences. | Use Markdown code blocks or XML boundary fences (`<user_text>...</user_text>`) with explicit system constraints. |
| **SEC-08** | Unsafe Model Routing | **MEDIUM** | Client can submit arbitrary model names to backend. | Whitelist permissible models on the server. |

---

## 2. Hardening Strategy for Target Platform

1. **Input Validation**: Use Zod to validate all incoming request bodies, checking types, required fields, and character limits.
2. **Rate Limiting**: Apply sliding-window rate limiters on generation routes (e.g., 20 requests per minute per IP).
3. **Queue / Task Management**: Replace unbounded in-memory array with an auto-expiring in-memory Map with max size and 15-minute TTL, ready for Redis backing.
4. **Resilient Error Boundaries**: Wrap all LLM completions in structured `try/catch` blocks with retry mechanisms, exponential backoff, and meaningful client error messages.
5. **Secure Configuration**: Never expose API keys or secrets to frontend bundles or client network traffic.
