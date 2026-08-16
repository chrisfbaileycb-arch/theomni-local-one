import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
export const API = `${BACKEND_URL}/api`;

const client = axios.create({ baseURL: API, withCredentials: true });

client.interceptors.response.use(undefined, (err) => {
  const d = err?.response?.data?.detail;
  if (err?.response?.status === 403 && (d === "access_code_required" || d === "revoked")) {
    window.dispatchEvent(new CustomEvent("omni-auth-locked", { detail: d }));
  }
  return Promise.reject(err);
});

// Auth & Team
export const authMe = () => client.get("/auth/me").then((r) => r.data);
export const authLogin = (email, password) => client.post("/auth/login", { email, password }).then((r) => r.data);
export const changeMasterPassword = (body) => client.post("/auth/change-password", body).then((r) => r.data);
export const authLogout = () => client.post("/auth/logout").then((r) => r.data);
export const authActivate = (code) => client.post("/auth/activate", { code }).then((r) => r.data);
export const getTeam = () => client.get("/team").then((r) => r.data);
export const rotateAccessCode = () => client.post("/team/rotate-code").then((r) => r.data);
export const revokeMember = (userId) => client.post(`/team/member/${userId}/revoke`).then((r) => r.data);
export const restoreMember = (userId) => client.post(`/team/member/${userId}/restore`).then((r) => r.data);
export const getApprovals = () => client.get("/approvals").then((r) => r.data);
export const approveRequest = (id) => client.post(`/approvals/${id}/approve`).then((r) => r.data);
export const rejectRequest = (id, reason) => client.post(`/approvals/${id}/reject`, { reason }).then((r) => r.data);

// Command Center
export const getOverview = () => client.get("/overview").then((r) => r.data);

// Content Director
export const getPrompts = () => client.get("/content/prompts").then((r) => r.data);
export const postCopy = (transcript) => client.post("/content/copy", { transcript }).then((r) => r.data);
export const postCritic = (index) => client.post("/content/critic", { index }).then((r) => r.data);
export const criticUploadInit = (filename) =>
  client.post("/content/critic/upload/init", { filename }).then((r) => r.data);
export const criticUploadChunk = (uploadId, index, chunk) => {
  const fd = new FormData();
  fd.append("uploadId", uploadId);
  fd.append("index", index);
  fd.append("chunk", chunk, "chunk");
  return client.post("/content/critic/upload/chunk", fd).then((r) => r.data);
};
export const criticAnalyze = (uploadId, filename, templateId) =>
  client.post("/content/critic/analyze", { uploadId, filename, templateId: templateId || null }, { timeout: 180000 }).then((r) => r.data);
export const criticVideoUrl = (videoUrl) => `${BACKEND_URL}${videoUrl}`;

// The Coach — build templates + accountability
export const coachTemplate = (topic) => client.post("/coach/template", { topic }, { timeout: 90000 }).then((r) => r.data);
export const getCoachTemplates = () => client.get("/coach/templates").then((r) => r.data);
export const coachTemplatePdfUrl = (id) => `${API}/coach/template/${id}/pdf`;
export const coachToCalendar = (id) => client.post(`/coach/template/${id}/to-calendar`).then((r) => r.data);
export const coachTemplateDelete = (id) => client.delete(`/coach/template/${id}`).then((r) => r.data);

// Onboarding Video Vault
export const getVault = () => client.get("/vault").then((r) => r.data);
export const vaultSave = (uploadId, filename, promptId, title) =>
  client.post("/vault/save", { uploadId, filename, promptId, title }, { timeout: 180000 }).then((r) => r.data);
export const vaultDelete = (id) => client.delete(`/vault/${id}`).then((r) => r.data);
export const vaultFeature = (id) => client.post(`/vault/${id}/feature`).then((r) => r.data);
export const vaultVideoUrl = (id) => `${API}/vault/video/${id}`;
export const publishAll = (assetId, caption) =>
  client.post("/content/publish-all", { assetId, caption }).then((r) => r.data);

// Content Director — Local Market Intelligence + Content Calendar
export const getLocalEvents = () => client.get("/content/local-events").then((r) => r.data);
export const getCalendar = () => client.get("/content/calendar").then((r) => r.data);
export const addCalendarWeek = () => client.post("/content/calendar/add-week").then((r) => r.data);
export const addCalendarPost = (post) => client.post("/content/calendar/post", post).then((r) => r.data);
export const removeCalendarPost = (id) => client.post("/content/calendar/remove", { id }).then((r) => r.data);
export const resetCalendar = () => client.post("/content/calendar/reset").then((r) => r.data);

// Content Director — Brand Brain (feeds every AI generation)
export const getBrandProfile = () => client.get("/content/brand-profile").then((r) => r.data);
export const updateBrandProfile = (profile) => client.put("/content/brand-profile", profile).then((r) => r.data);

// Quality Content Executioner (Ad Engine)
export const getReports = () => client.get("/executioner/reports").then((r) => r.data);
export const reconcile = () => client.post("/executioner/reconcile").then((r) => r.data);
export const resetLoop = () => client.post("/executioner/reset").then((r) => r.data);
export const getRecommendedPlan = () => client.get("/executioner/recommended-plan").then((r) => r.data);
export const getSampleTransactionsCsv = () =>
  client.get("/executioner/sample-transactions-csv").then((r) => r.data);
export const importTransactions = (csv, source = "square") =>
  client.post("/executioner/import-transactions", { csv, source }).then((r) => r.data);
export const clearTransactions = () => client.post("/executioner/clear-transactions").then((r) => r.data);
export const tableTentUrl = (spaceId, base) =>
  `${API}/maximizer/table-tent.pdf?spaceId=${encodeURIComponent(spaceId)}&base=${encodeURIComponent(base)}`;
export const getConnections = () => client.get("/connections").then((r) => r.data);
export const setConnection = (platform, connected) =>
  client.put("/connections", { platform, connected }).then((r) => r.data);
export const getPathways = () => client.get("/connections/pathways").then((r) => r.data);
export const oauthStart = (platform) =>
  client.get(`/connections/oauth/${platform}/start`).then((r) => r.data);
export const oauthCallback = (platform, code) =>
  client.post("/connections/oauth/callback", { platform, code }).then((r) => r.data);

// Quality Customer Maximizer (Rewards / Gamification)
export const getGames = () => client.get("/maximizer/games").then((r) => r.data);
export const setActiveGame = (gameId) => client.put("/maximizer/games/active", { gameId }).then((r) => r.data);
export const getSegments = () => client.get("/maximizer/segments").then((r) => r.data);
export const getDrip = () => client.get("/maximizer/drip").then((r) => r.data);
export const spin = (body) => client.post("/maximizer/spin", body).then((r) => r.data);
export const getMembers = () => client.get("/maximizer/members").then((r) => r.data);
export const membersExportUrl = () => `${API}/maximizer/members/export.csv`;
export const postScan = (spaceId) => client.post("/maximizer/scan", { spaceId }).then((r) => r.data);
export const getLocations = () => client.get("/maximizer/locations").then((r) => r.data);
export const getWeeklyReport = () => client.get("/maximizer/weekly-report").then((r) => r.data);
export const weeklyReportPdfUrl = () => `${API}/maximizer/weekly-report.pdf`;
export const qrSheetUrl = (base) => `${API}/maximizer/qr-sheet.pdf?base=${encodeURIComponent(base)}`;
export const getReportEmail = () => client.get("/maximizer/report-email").then((r) => r.data);
export const setReportEmail = (body) => client.put("/maximizer/report-email", body).then((r) => r.data);
export const sendReportNow = () => client.post("/maximizer/report-email/send-now").then((r) => r.data);
export const getAdSpend = () => client.get("/maximizer/ad-spend").then((r) => r.data);
export const addAdSpend = (body) => client.post("/maximizer/ad-spend", body).then((r) => r.data);
export const deleteAdSpend = (id) => client.delete(`/maximizer/ad-spend/${id}`).then((r) => r.data);
export const getImportStatus = () => client.get("/maximizer/import-status").then((r) => r.data);
export const getGamePlan = () => client.get("/maximizer/game-plan").then((r) => r.data);
export const setGameWeek = (weekStart, gameId) =>
  client.put("/maximizer/game-plan/week", { weekStart, gameId }).then((r) => r.data);
export const setGameSettings = (body) => client.put("/maximizer/game-settings", body).then((r) => r.data);
export const getStrategy = () => client.get("/content/strategy").then((r) => r.data);
export const putStrategy = (body) => client.put("/content/strategy", body).then((r) => r.data);
export const addIndustry = (body) => client.post("/content/industries", body).then((r) => r.data);
export const updateIndustry = (iid, body) => client.put(`/content/industries/${iid}`, body).then((r) => r.data);
export const deleteIndustry = (iid) => client.delete(`/content/industries/${iid}`).then((r) => r.data);

export const createCheckout = (lookupKey) =>
  client.post("/payments/checkout", { lookup_key: lookupKey, origin_url: window.location.origin }).then((r) => r.data);
export const paymentStatus = (sessionId) => client.get(`/payments/status/${sessionId}`).then((r) => r.data);

export const gbpStart = () => client.get("/google-business/start").then((r) => r.data);
export const gbpStatus = () => client.get("/google-business/status").then((r) => r.data);
export const gbpLocations = () => client.get("/google-business/locations").then((r) => r.data);
export const gbpSetLocation = (name, title) =>
  client.put("/google-business/location", { name, title }).then((r) => r.data);
export const gbpDisconnect = () => client.delete("/google-business/connection").then((r) => r.data);
export const getPrizeBoard = () => client.get("/maximizer/prize-board").then((r) => r.data);
export const setPrizeBoard = (body) => client.put("/maximizer/prize-board", body).then((r) => r.data);
export const getSpinQr = (spaceId, base) =>
  client.get("/maximizer/spin/qr", { params: { spaceId, base } }).then((r) => r.data);
export const redeemCode = (code, netSales) =>
  client.post("/maximizer/redeem", { code, netSales }).then((r) => r.data);
export const getRedemptionsDashboard = () =>
  client.get("/maximizer/redemptions/dashboard").then((r) => r.data);
export const getSampleCustomerCsv = () => client.get("/maximizer/sample-customer-csv").then((r) => r.data);
export const importCustomerCsv = (csv) => client.post("/maximizer/import-csv", { csv }).then((r) => r.data);
export const getWelcomeQueue = () => client.get("/maximizer/welcome-queue").then((r) => r.data);
export const sendWelcome = (index) => client.post("/email/send-welcome", { index }).then((r) => r.data);

// Codes & Redemption
export const getCurrentBatch = () => client.get("/codes/current").then((r) => r.data);
export const generateBatch = (length) => client.post("/codes/generate", { length }).then((r) => r.data);
export const getSampleCsv = () => client.get("/codes/sample-csv").then((r) => r.data);
export const reconcileCsv = (csv) => client.post("/codes/reconcile", { csv }).then((r) => r.data);

// Email Engine (Anti-Spam Trickle)
export const getTricklePlan = () => client.get("/email/trickle-plan?total=3000").then((r) => r.data);
export const previewEmail = (content) => client.post("/email/preview", { content }).then((r) => r.data);
