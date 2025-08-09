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







import checkVoiceUsageRouter from './routes/stopRecording/checkVoiceUsage';
import transcribeRouter from './routes/stopRecording/transcribeAudio';
import updatePersonality from './routes/stopRecording/personality'
import journalResponse from './routes/stopRecording/journalResponse'
import updateWordStreak from './routes/stopRecording/updateStats'
import journal from './routes/submitJournal/journal'
import habitCardsStatsRouter from './routes/insights/habitCardsStats'
import moodChartStatsRouter from './routes/insights/moodChartStats'
import personalityStatsRouter from './routes/insights/personalityStats'
import topicsStatsRouter from './routes/insights/topicStats'
import fetchJournals from './routes/files/fetchJournals'
import deleteJournal from './routes/files/deleteJournal'
import subscribe from './routes/subscribe/stripe'

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








//stopRecording
app.use('/api/check-voice-usage', checkVoiceUsageRouter);
app.use('/api/transcribe', transcribeRouter);
app.use('/api/personality', updatePersonality);
app.use('/api/journal-response', journalResponse)
app.use('/api/update-word-count-and-streak', updateWordStreak)
//submitJournal
app.use('/api/journal', journal)
app.use('/api/habit-cards-stats', habitCardsStatsRouter)
app.use('/api/mood-chart-stats', moodChartStatsRouter)
app.use('/api/personality-stats', personalityStatsRouter)
app.use('/api/topics', topicsStatsRouter)
//bobee
//files
app.use('/api/fetch-journals', fetchJournals)
app.use('/api/delete-journal', deleteJournal)
//subscription
app.use('/api/subscribe', subscribe)


const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 API listening on port ${PORT}`);
});