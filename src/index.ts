import 'dotenv/config';         
import express from 'express';
import cors from 'cors';

//auth etc etc
import checkAuth from './routes/authLogic/checkAuth';
import signUp from './routes/authLogic/signUp';
import deleteAccount from './routes/authLogic/deleteAccount';
//bobee page
import getConvosAndDailyCount from './routes/bobee/getConvsAndDailyCount';
import deleteConversation from './routes/bobee/deleteConversation'
import openConversation from './routes/bobee/openConversation'
import chat from './routes/bobee/chat'
import saveConversation from './routes/bobee/saveConversation'
import loadUserFacts from './routes/bobee/loadUserFacts'
//files page
import getJournals from './routes/files/getJournals'
import deleteJournal from './routes/files/deleteJournal'
//insights page
import habitCardsStats from './routes/insights/habitCardsStats'
import moodChartStats from './routes/insights/moodChartStats'
import personalityStats from './routes/insights/personalityStats'
import topicsStats from './routes/insights/topicStats'
//journal page
import getWordCountAndStreak from './routes/journal/getWordAndCountStreak';
import checkVoiceUsage from './routes/journal/checkVoiceUsage';
import transcribe from './routes/journal/transcribeAudio';
import personalityMetrics from './routes/journal/getPersonalityMetrics'
import journalResponse from './routes/journal/journalResponse'
import submitJournal from './routes/journal/submitJournal'
//subcribe
import subscribeStart from './routes/subscribe/subscribeStart';
import subscribeFinalise from './routes/subscribe/subscribeFinalise';
import subscribeCancel from './routes/subscribe/subscribeCancel';
import subscribeStatus from './routes/subscribe/subscribeStatus';






const app = express();
app.use(cors());
app.use(express.json());

//auth etc etc
app.use('/api/check-auth', checkAuth) //checks auth on page load and redirects
app.use('/api/signup', signUp);
app.use('/api/delete-account', deleteAccount);

//bobee page 
app.use('/api/conversations-and-daily-count', getConvosAndDailyCount)
app.use('/api/delete-conversation', deleteConversation)
app.use('/api/open-conversation', openConversation)
app.use('/api/chat', chat)
app.use('/api/save-conversation', saveConversation)
app.use('/api/load-user-facts', loadUserFacts)

//files page
app.use('/api/get-journals', getJournals)
app.use('/api/delete-journal', deleteJournal)

//insights page
app.use('/api/habit-cards-stats', habitCardsStats)
app.use('/api/mood-chart-stats', moodChartStats)
app.use('/api/personality-stats', personalityStats)
app.use('/api/topics', topicsStats)

//journal page
app.use('/api/get-word-count-and-streak', getWordCountAndStreak);
app.use('/api/check-voice-usage', checkVoiceUsage);
app.use('/api/transcribe', transcribe);
app.use('/api/get-personality-scores', personalityMetrics);
app.use('/api/journal-response', journalResponse)
app.use('/api/submit-journal', submitJournal)

//subscribe
app.use('/api/subscribe/start', subscribeStart);
app.use('/api/subscribe/finalise', subscribeFinalise);
app.use('/api/subscribe/cancel', subscribeCancel);
app.use('/api/subscribe/status', subscribeStatus);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 API listening on port ${PORT}`);
});