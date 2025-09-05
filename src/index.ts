import 'dotenv/config';         
import express from 'express';
import cors from 'cors';
import http from "http"    

//auth etc etc
import checkAuth from './routes/authLogic/checkAuth';
import signUp from './routes/authLogic/signUp';
import deleteAccount from './routes/authLogic/deleteAccount';
//bobee page
import deleteConversation from './routes/bobee/deleteConversation'
import openConversation from './routes/bobee/openConversation'
import chat from './routes/bobee/chat'
import saveConversation from './routes/bobee/saveConversation'
import listConversations from './routes/bobee/listConversations'
import aiInsights from './routes/bobee/aiInsights'
//files page
import getJournals from './routes/files/getJournals'
import deleteJournal from './routes/files/deleteJournal'
//insights page
import habitCardsStats from './routes/insights/habitCardsStats'
import moodChartStats from './routes/insights/moodChartStats'
import personalityStats from './routes/insights/personalityStats'
import topicsStats from './routes/insights/topicStats'
import bobeeMessageMeta from './routes/insights/bobeeMessageMeta'
import bobeeMessage from './routes/insights/bobeeMessage'
//journal page
import getWordCountAndStreak from './routes/journal/getWordAndCountStreak';
import checkVoiceUsage from './routes/journal/checkVoiceUsage';
import transcribe from './routes/journal/transcribeAudio';
import personalityMetrics from './routes/journal/getPersonalityMetrics'
import journalResponse from './routes/journal/journalResponse'
import submitJournal from './routes/journal/submitJournal'
import generateProfileFacts from './routes/journal/generateProfileFacts'
// schedulers
import { scheduleStreakReset } from './schedulers/resetStreaks'
import { scheduleDailyAiInsights } from './schedulers/dailyAiInsights'
//subcribe
import subscribeStatus from './routes/subscribe/subscribeStatus';
import iapVerify from './routes/subscribe/iapVerify';
import unifiedStatus from './routes/subscribe/unifiedStatus';
// settings
import userPersonalityData from './routes/settings/userPersonalityData';
//websocket 




const app = express();
// Create a single HTTP server so Express and WebSocket share the same listener
const server = http.createServer(app)
app.use(cors());
app.use(express.json());

//auth etc etc
app.use('/api/check-auth', checkAuth) //checks auth on page load and redirects
app.use('/api/signup', signUp);
app.use('/api/delete-account', deleteAccount);

//bobee page 
app.use('/api/delete-conversation', deleteConversation)
app.use('/api/open-conversation', openConversation)
app.use('/api/chat', chat)
app.use('/api/save-conversation', saveConversation)
app.use('/api/list-conversations', listConversations)
app.use('/api/ai-insights', aiInsights)

//files page
app.use('/api/get-journals', getJournals)
app.use('/api/delete-journal', deleteJournal)

//insights page
app.use('/api/habit-cards-stats', habitCardsStats)
app.use('/api/mood-chart-stats', moodChartStats)
app.use('/api/personality-stats', personalityStats)
app.use('/api/topics', topicsStats)
app.use('/api/bobee-message-meta', bobeeMessageMeta)
app.use('/api/bobee-message', bobeeMessage)

//journal page
app.use('/api/get-word-count-and-streak', getWordCountAndStreak);
app.use('/api/check-voice-usage', checkVoiceUsage);
app.use('/api/transcribe', transcribe);
app.use('/api/get-personality-scores', personalityMetrics);
app.use('/api/journal-response', journalResponse)
app.use('/api/submit-journal', submitJournal)
app.use('/api/generate-profile-facts', generateProfileFacts)

//subscribe
app.use('/api/subscribe/status', subscribeStatus);
app.use('/api/subscribe/iap/verify', iapVerify); 
app.use('/api/subscribe/unified-status', unifiedStatus); 

// settings
app.use('/api/settings/get-personality-data', userPersonalityData);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
  scheduleStreakReset();
  scheduleDailyAiInsights();
});