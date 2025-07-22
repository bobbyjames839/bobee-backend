import 'dotenv/config';         
import express from 'express';
import cors from 'cors';
import checkVoiceUsageRouter from './routes/stopRecording/checkVoiceUsage';
import transcribeRouter from './routes/stopRecording/transcribeAudio';
import updatePersonality from './routes/stopRecording/personality'
import journalResponse from './routes/stopRecording/journalResponse'
import updateWordStreak from './routes/stopRecording/updateStats'
import journal from './routes/submitJournal/journal'
import conversationsRouter from './routes/mainScreen/conversations'
import conversationRouter from './routes/mainScreen/conversation'
import metricsRouter from './routes/mainScreen/metrics'
import habitCardsStatsRouter from './routes/insights/habitCardsStats'
import moodChartStatsRouter from './routes/insights/moodChartStats'
import personalityStatsRouter from './routes/insights/personalityStats'
import topicsStatsRouter from './routes/insights/topicStats'
import saveConversation from './routes/bobee/saveConversation'
import openConversation from './routes/bobee/openConversation'
import loadFacts from './routes/bobee/loadFacts'
import chat from './routes/bobee/chat'
import fetchJournals from './routes/files/fetchJournals'
import deleteJournal from './routes/files/deleteJournal'
import subscribe from './routes/subscribe/stripe'

const app = express();
app.use(cors());
app.use(express.json());

//stopRecording
app.use('/api/check-voice-usage', checkVoiceUsageRouter);
app.use('/api/transcribe', transcribeRouter);
app.use('/api/personality', updatePersonality);
app.use('/api/journal-response', journalResponse)
app.use('/api/update-word-count-and-streak', updateWordStreak)
//submitJournal
app.use('/api/journal', journal)
//mainScreen
app.use('/api/conversations', conversationsRouter)
app.use('/api/conversations', conversationRouter)
app.use('/api/metrics', metricsRouter)
app.use('/api/habit-cards-stats', habitCardsStatsRouter)
app.use('/api/mood-chart-stats', moodChartStatsRouter)
app.use('/api/personality-stats', personalityStatsRouter)
app.use('/api/topics', topicsStatsRouter)
//bobee
app.use('/api/save-conversation', saveConversation)
app.use('/api/open-conversation', openConversation)
app.use('/api/load-facts', loadFacts)
app.use('/api/chat', chat)
//files
app.use('/api/fetch-journals', fetchJournals)
app.use('/api/delete-journal', deleteJournal)
//subscription
app.use('/api/subscribe', subscribe)

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 API listening on port ${PORT}`);
});