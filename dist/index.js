"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = __importDefault(require("http"));
//auth etc etc
const checkAuth_1 = __importDefault(require("./routes/authLogic/checkAuth"));
const signUp_1 = __importDefault(require("./routes/authLogic/signUp"));
const deleteAccount_1 = __importDefault(require("./routes/authLogic/deleteAccount"));
//bobee page
const deleteConversation_1 = __importDefault(require("./routes/bobee/deleteConversation"));
const openConversation_1 = __importDefault(require("./routes/bobee/openConversation"));
const chat_1 = __importDefault(require("./routes/bobee/chat"));
// reflection flow (single 2-turn chat) new endpoint
const reflectionFlow_1 = __importDefault(require("./routes/bobee/reflectionFlow"));
const saveConversation_1 = __importDefault(require("./routes/bobee/saveConversation"));
const listConversations_1 = __importDefault(require("./routes/bobee/listConversations"));
const aiInsights_1 = __importDefault(require("./routes/bobee/aiInsights"));
//files page
const getJournals_1 = __importDefault(require("./routes/files/getJournals"));
const deleteJournal_1 = __importDefault(require("./routes/files/deleteJournal"));
//insights page
const habitCardsStats_1 = __importDefault(require("./routes/insights/habitCardsStats"));
const moodChartStats_1 = __importDefault(require("./routes/insights/moodChartStats"));
const personalityStats_1 = __importDefault(require("./routes/insights/personalityStats"));
const topicStats_1 = __importDefault(require("./routes/insights/topicStats"));
const bobeeMessageMeta_1 = __importDefault(require("./routes/insights/bobeeMessageMeta"));
const bobeeMessage_1 = __importDefault(require("./routes/insights/bobeeMessage"));
//journal page
const getWordAndCountStreak_1 = __importDefault(require("./routes/journal/getWordAndCountStreak"));
const checkVoiceUsage_1 = __importDefault(require("./routes/journal/checkVoiceUsage"));
const transcribeAudio_1 = __importDefault(require("./routes/journal/transcribeAudio"));
const getPersonalityMetrics_1 = __importDefault(require("./routes/journal/getPersonalityMetrics"));
const journalResponse_1 = __importDefault(require("./routes/journal/journalResponse"));
const submitJournal_1 = __importDefault(require("./routes/journal/submitJournal"));
const generateProfileFacts_1 = __importDefault(require("./routes/journal/generateProfileFacts"));
// schedulers
const resetStreaks_1 = require("./schedulers/resetStreaks");
const dailyAiInsights_1 = require("./schedulers/dailyAiInsights");
//subcribe
const subscribeStatus_1 = __importDefault(require("./routes/subscribe/subscribeStatus"));
const iapVerify_1 = __importDefault(require("./routes/subscribe/iapVerify"));
const unifiedStatus_1 = __importDefault(require("./routes/subscribe/unifiedStatus"));
// settings
const userPersonalityData_1 = __importDefault(require("./routes/settings/userPersonalityData"));
//websocket 
const app = (0, express_1.default)();
// Create a single HTTP server so Express and WebSocket share the same listener
const server = http_1.default.createServer(app);
app.use((0, cors_1.default)());
app.use(express_1.default.json());
//auth etc etc
app.use('/api/check-auth', checkAuth_1.default); //checks auth on page load and redirects
app.use('/api/signup', signUp_1.default);
app.use('/api/delete-account', deleteAccount_1.default);
//bobee page 
app.use('/api/delete-conversation', deleteConversation_1.default);
app.use('/api/open-conversation', openConversation_1.default);
app.use('/api/chat', chat_1.default);
app.use('/api/reflection-flow', reflectionFlow_1.default);
app.use('/api/save-conversation', saveConversation_1.default);
app.use('/api/list-conversations', listConversations_1.default);
app.use('/api/ai-insights', aiInsights_1.default);
//files page
app.use('/api/get-journals', getJournals_1.default);
app.use('/api/delete-journal', deleteJournal_1.default);
//insights page
app.use('/api/habit-cards-stats', habitCardsStats_1.default);
app.use('/api/mood-chart-stats', moodChartStats_1.default);
app.use('/api/personality-stats', personalityStats_1.default);
app.use('/api/topics', topicStats_1.default);
app.use('/api/bobee-message-meta', bobeeMessageMeta_1.default);
app.use('/api/bobee-message', bobeeMessage_1.default);
//journal page
app.use('/api/get-word-count-and-streak', getWordAndCountStreak_1.default);
app.use('/api/check-voice-usage', checkVoiceUsage_1.default);
app.use('/api/transcribe', transcribeAudio_1.default);
app.use('/api/get-personality-scores', getPersonalityMetrics_1.default);
app.use('/api/journal-response', journalResponse_1.default);
app.use('/api/submit-journal', submitJournal_1.default);
app.use('/api/generate-profile-facts', generateProfileFacts_1.default);
//subscribe
app.use('/api/subscribe/status', subscribeStatus_1.default);
app.use('/api/subscribe/iap/verify', iapVerify_1.default);
app.use('/api/subscribe/unified-status', unifiedStatus_1.default);
// settings
app.use('/api/settings/get-personality-data', userPersonalityData_1.default);
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`API listening on port ${PORT}`);
    (0, resetStreaks_1.scheduleStreakReset)();
    (0, dailyAiInsights_1.scheduleDailyAiInsights)();
});
