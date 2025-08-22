import express from 'express';
import admin from 'firebase-admin';

const router = express.Router();
const db = admin.firestore();

// Helper function to process new facts and categorize them into the userProfile structure
function processNewFacts(userProfile: any, newFacts: string[]) {
  // Create a copy of the userProfile to avoid mutations
  const updatedProfile = { ...userProfile };
  
  // Initialize sections if they don't exist
  if (!updatedProfile.personalityInsights) {
    updatedProfile.personalityInsights = { strengths: [], challenges: [], values: [], motivations: [] };
  }
  if (!updatedProfile.lifeContext) {
    updatedProfile.lifeContext = { significantEvents: [], currentChallenges: [], relationships: [], healthFactors: [] };
  }
  if (!updatedProfile.goals) {
    updatedProfile.goals = { shortTerm: [], longTerm: [], habits: { developing: [], breaking: [] } };
  }
  if (!updatedProfile.preferences) {
    updatedProfile.preferences = { communicationStyle: "balanced", journalingGoals: [], interests: [] };
  }

  // Simple keyword matching to categorize facts
  // This is a basic implementation - in a production environment, 
  // you might want to use more sophisticated NLP techniques
  for (const fact of newFacts) {
    const factLower = fact.toLowerCase();
    
    // Personality insights
    if (factLower.includes('strength') || factLower.includes('good at') || factLower.includes('excel')) {
      if (!updatedProfile.personalityInsights.strengths.includes(fact)) {
        updatedProfile.personalityInsights.strengths.push(fact);
      }
    } else if (factLower.includes('challenge') || factLower.includes('struggle') || factLower.includes('difficult')) {
      if (!updatedProfile.personalityInsights.challenges.includes(fact)) {
        updatedProfile.personalityInsights.challenges.push(fact);
      }
    } else if (factLower.includes('value') || factLower.includes('believe') || factLower.includes('important')) {
      if (!updatedProfile.personalityInsights.values.includes(fact)) {
        updatedProfile.personalityInsights.values.push(fact);
      }
    } else if (factLower.includes('motivation') || factLower.includes('driven') || factLower.includes('want to')) {
      if (!updatedProfile.personalityInsights.motivations.includes(fact)) {
        updatedProfile.personalityInsights.motivations.push(fact);
      }
    }
    
    // Life context
    else if (factLower.includes('happened') || factLower.includes('event') || factLower.includes('experience')) {
      if (!updatedProfile.lifeContext.significantEvents.includes(fact)) {
        updatedProfile.lifeContext.significantEvents.push(fact);
      }
    } else if (factLower.includes('problem') || factLower.includes('issue') || factLower.includes('facing')) {
      if (!updatedProfile.lifeContext.currentChallenges.includes(fact)) {
        updatedProfile.lifeContext.currentChallenges.push(fact);
      }
    } else if (factLower.includes('relationship') || factLower.includes('friend') || factLower.includes('family') || factLower.includes('partner')) {
      if (!updatedProfile.lifeContext.relationships.includes(fact)) {
        updatedProfile.lifeContext.relationships.push(fact);
      }
    } else if (factLower.includes('health') || factLower.includes('medical') || factLower.includes('sleep') || factLower.includes('eating')) {
      if (!updatedProfile.lifeContext.healthFactors.includes(fact)) {
        updatedProfile.lifeContext.healthFactors.push(fact);
      }
    }
    
    // Goals and interests
    else if (factLower.includes('short term') || factLower.includes('next week') || factLower.includes('soon')) {
      if (!updatedProfile.goals.shortTerm.includes(fact)) {
        updatedProfile.goals.shortTerm.push(fact);
      }
    } else if (factLower.includes('long term') || factLower.includes('future') || factLower.includes('aspire')) {
      if (!updatedProfile.goals.longTerm.includes(fact)) {
        updatedProfile.goals.longTerm.push(fact);
      }
    } else if (factLower.includes('start habit') || factLower.includes('develop habit') || factLower.includes('build habit')) {
      if (!updatedProfile.goals.habits.developing.includes(fact)) {
        updatedProfile.goals.habits.developing.push(fact);
      }
    } else if (factLower.includes('stop habit') || factLower.includes('break habit') || factLower.includes('quit')) {
      if (!updatedProfile.goals.habits.breaking.includes(fact)) {
        updatedProfile.goals.habits.breaking.push(fact);
      }
    } else if (factLower.includes('interest') || factLower.includes('hobby') || factLower.includes('enjoy')) {
      if (!updatedProfile.preferences.interests.includes(fact)) {
        updatedProfile.preferences.interests.push(fact);
      }
    }
    
    // Default case - if we can't categorize, add to values as a generic insight
    else {
      if (!updatedProfile.personalityInsights.values.includes(fact)) {
        updatedProfile.personalityInsights.values.push(fact);
      }
    }
  }
  
  return updatedProfile;
}

const PERSONALITY_KEYS = [
  'resilience',
  'discipline',
  'focus',
  'selfWorth',
  'confidence',
  'clarity',
];

type AIResponse = {
  summary: string;
  nextStep: string;
  moodScore: number;
  feelings: string[];
  topic: string;
  selfInsight?: string;
  thoughtPattern?: string;
  personalityDeltas?: Record<string, number>;
  newFacts?: string[];
};

router.post('/', async (req, res) => {
  // Voice usage update removed as requested
  try {
    const {
      userId,
      transcript,
      prompt = '',
      aiResponse,
      timerSeconds,
    }: {
      userId: string;
      transcript: string;
      prompt?: string;
      aiResponse: AIResponse;
      timerSeconds?: number;
    } = req.body;

    // — validate
    if (!userId || !transcript || !aiResponse) {
      return res
        .status(400)
        .json({ error: 'Missing userId, transcript or aiResponse' });
    }

    // — 1️⃣ Save journal entry
    const { newFacts = [], personalityDeltas } = aiResponse;
    const entryRef = await db
      .collection('users')
      .doc(userId)
      .collection('journals')
      .add({
        transcript,
        prompt,
        aiResponse: {
          summary: aiResponse.summary,
          nextStep: aiResponse.nextStep,
          moodScore: aiResponse.moodScore,
          feelings: aiResponse.feelings,
          topic: aiResponse.topic,
          selfInsight: aiResponse.selfInsight,
          thoughtPattern: aiResponse.thoughtPattern,
          personalityDeltas: aiResponse.personalityDeltas
        },
        createdAt: admin.firestore.Timestamp.now(),
      });

    // — 2️⃣ Compute & update writing stats
    const wordCount = transcript.trim().split(/\s+/).length;
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    // prepare for streak calculation
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    let currentStreak = 1;
    if (userSnap.exists) {
      const data = userSnap.data()!;
      const fsDate = data.lastJournalDate;
      const lastDate =
        fsDate && typeof fsDate.toDate === 'function'
          ? fsDate.toDate()
          : null;
      if (lastDate) {
        lastDate.setHours(0, 0, 0, 0);
        if (lastDate.getTime() === yesterday.getTime()) {
          currentStreak = (data.currentStreak || 0) + 1;
        } else if (lastDate.getTime() === today.getTime()) {
          currentStreak = data.currentStreak || 1;
        }
      }
    }
    // Update journalStats object
    const prevStats = userSnap.exists && userSnap.data()?.journalStats ? userSnap.data()!.journalStats : { streak: 0, totalEntries: 0, totalWords: 0 };
    await userRef.set(
      {
        journalStats: {
          streak: currentStreak,
          totalEntries: (prevStats.totalEntries || 0) + 1,
          totalWords: (prevStats.totalWords || 0) + wordCount,
        },
        lastJournalDate: admin.firestore.Timestamp.fromDate(new Date()),
      },
      { merge: true }
    );

    // — 3️⃣ Update userProfile with newFacts
    if (newFacts.length > 0) {
      const userSnap2 = await userRef.get();
      const userProfile = userSnap2.exists && userSnap2.data()?.userProfile ? userSnap2.data()!.userProfile : {};
      
      // Process new facts to categorize them into userProfile sections
      const updatedUserProfile = processNewFacts(userProfile, newFacts);
      
      await userRef.set(
        {
          // Update the comprehensive userProfile
          userProfile: {
            ...updatedUserProfile,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
          }
        },
        { merge: true }
      );
    }

    // — 4️⃣ Increment topic frequency
    const userSnap3 = await userRef.get();
    const prevTopics = userSnap3.exists && userSnap3.data()?.topics ? userSnap3.data()!.topics : {};
    await userRef.set(
      {
        topics: {
          ...prevTopics,
          [aiResponse.topic]: (prevTopics?.[aiResponse.topic] || 0) + 1,
        },
      },
      { merge: true }
    );

    // — 5️⃣ Personality & deltas
    if (personalityDeltas) {
      const userSnap4 = await userRef.get();
      const prevScores = userSnap4.exists && userSnap4.data()?.personality ? userSnap4.data()!.personality : {};
      // Calculate new personality by applying deltas
      const newPersonality: Record<string, number> = {};
      PERSONALITY_KEYS.forEach((key) => {
        const prev = prevScores[key] || 50;
        const delta = personalityDeltas[key] || 0;
        newPersonality[key] = Math.max(0, Math.min(100, prev + delta));
      });
      // Save deltas and new personality
      await userRef.set(
        {
          personality: newPersonality,
          personalityDeltas: personalityDeltas,
        },
        { merge: true }
      );
    }

    // — 6️⃣ Update voice usage if timerSeconds is provided
    if (typeof timerSeconds === 'number') {
      const todayStr = new Date().toISOString().split('T')[0];
      const userSnap5 = await userRef.get();
      const prevVoiceUsage = userSnap5.exists && userSnap5.data()?.voiceUsage ? userSnap5.data()!.voiceUsage : { date: todayStr, totalSeconds: 0 };
      let alreadyUsed = 0;
      if (prevVoiceUsage.date === todayStr) {
        alreadyUsed = prevVoiceUsage.totalSeconds;
      }
      const newTotal = alreadyUsed + timerSeconds;
      await userRef.set({
        voiceUsage: { date: todayStr, totalSeconds: newTotal }
      }, { merge: true });
    }

    // — 7️⃣ All done!
    return res.status(200).json({
      entryId: entryRef.id,
      wordCount,
      currentStreak,
      personalityDeltas: personalityDeltas || null,
    });
  } catch (error) {
    console.error('Error in unified /api/journal:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
