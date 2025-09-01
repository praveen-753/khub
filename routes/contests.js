const express = require('express');
const Contest = require('../models/Contest');
const Submission = require('../models/Submission');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Apply authentication middleware
router.use(authenticateToken);

// Get all active contests for users
router.get('/', async (req, res) => {
    try {
        const now = new Date();
        const contests = await Contest.find({
            isActive: true,
            endTime: { $gte: now }
        })
        .select('name description startTime endTime duration createdAt')
        .sort({ startTime: 1 });

        res.json({ contests });
    } catch (error) {
        console.error('Error fetching contests:', error);
        res.status(500).json({ error: 'Failed to fetch contests' });
    }
});

// Get contest details for participants
router.get('/:id', async (req, res) => {
    try {
        const contest = await Contest.findById(req.params.id);

        if (!contest) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        // Check if contest is accessible
        const now = new Date();
        if (!contest.isActive || contest.endTime < now) {
            return res.status(403).json({ error: 'Contest is not accessible' });
        }

        // Don't send test cases to participants (only sample input/output)
        const contestData = {
            _id: contest._id,
            name: contest.name,
            description: contest.description,
            startTime: contest.startTime,
            endTime: contest.endTime,
            duration: contest.duration,
            allowedLanguages: contest.allowedLanguages,
            maxAttempts: contest.maxAttempts,
            questions: contest.questions.map(question => ({
                _id: question._id,
                title: question.title,
                description: question.description,
                difficulty: question.difficulty,
                constraints: question.constraints,
                inputFormat: question.inputFormat,
                outputFormat: question.outputFormat,
                sampleInput: question.sampleInput,
                sampleOutput: question.sampleOutput,
                timeLimit: question.timeLimit,
                memoryLimit: question.memoryLimit,
                totalMarks: question.totalMarks
            }))
        };

        res.json({ contest: contestData });
    } catch (error) {
        console.error('Error fetching contest:', error);
        res.status(500).json({ error: 'Failed to fetch contest' });
    }
});

// Get specific question details
router.get('/:contestId/questions/:questionId', async (req, res) => {
    try {
        const contest = await Contest.findById(req.params.contestId);

        if (!contest) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        const question = contest.questions.id(req.params.questionId);
        if (!question) {
            return res.status(404).json({ error: 'Question not found' });
        }

        // Check if contest is accessible
        const now = new Date();
        if (!contest.isActive || contest.endTime < now) {
            return res.status(403).json({ error: 'Contest is not accessible' });
        }

        // Don't send test cases to participants
        const questionData = {
            _id: question._id,
            title: question.title,
            description: question.description,
            difficulty: question.difficulty,
            constraints: question.constraints,
            inputFormat: question.inputFormat,
            outputFormat: question.outputFormat,
            sampleInput: question.sampleInput,
            sampleOutput: question.sampleOutput,
            timeLimit: question.timeLimit,
            memoryLimit: question.memoryLimit,
            totalMarks: question.totalMarks
        };

        res.json({ question: questionData });
    } catch (error) {
        console.error('Error fetching question:', error);
        res.status(500).json({ error: 'Failed to fetch question' });
    }
});

// Admin-specific routes (for contest management)
// Get contest details for admin (with full data including test cases)
router.get('/admin/:id', async (req, res) => {
    try {
        // Check if user is admin
        if (!['admin', 'instructor'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const contest = await Contest.findById(req.params.id)
            .populate('createdBy', 'fullName email username');

        if (!contest) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        // Send full contest data including test cases for admin
        res.json({ contest });
    } catch (error) {
        console.error('Error fetching admin contest:', error);
        res.status(500).json({ error: 'Failed to fetch contest' });
    }
});

// Get contest participants (admin only)
router.get('/admin/:id/participants', async (req, res) => {
    try {
        // Check if user is admin
        if (!['admin', 'instructor'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        // For now, we'll get participants from submissions
        // In a real system, you might have a separate participants collection
        const submissions = await Submission.find({ contestId: req.params.id })
            .populate('userId', 'fullName email username teamNumber batchYear')
            .select('userId submittedAt')
            .sort({ submittedAt: 1 });

        // Get unique participants
        const participantsMap = new Map();
        submissions.forEach(submission => {
            if (submission.userId && !participantsMap.has(submission.userId._id.toString())) {
                participantsMap.set(submission.userId._id.toString(), {
                    _id: submission.userId._id,
                    user: submission.userId,
                    registeredAt: submission.submittedAt // Using first submission as registration time
                });
            }
        });

        const participants = Array.from(participantsMap.values());
        res.json({ participants });
    } catch (error) {
        console.error('Error fetching participants:', error);
        res.status(500).json({ error: 'Failed to fetch participants' });
    }
});

// Get all contest submissions (admin only)
router.get('/admin/:id/submissions', async (req, res) => {
    try {
        // Check if user is admin
        if (!['admin', 'instructor'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const submissions = await Submission.find({ contestId: req.params.id })
            .populate('userId', 'fullName email username teamNumber batchYear')
            .sort({ submittedAt: -1 });

        res.json({ submissions });
    } catch (error) {
        console.error('Error fetching submissions:', error);
        res.status(500).json({ error: 'Failed to fetch submissions' });
    }
});

// Get contest leaderboard (admin only)
router.get('/admin/:id/leaderboard', async (req, res) => {
    try {
        // Check if user is admin
        if (!['admin', 'instructor'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const contest = await Contest.findById(req.params.id);
        if (!contest) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        // Get all submissions for this contest
        const submissions = await Submission.find({ contestId: req.params.id })
            .populate('userId', 'fullName email username teamNumber batchYear')
            .sort({ submittedAt: -1 });

        // Calculate leaderboard
        const userScores = new Map();
        
        submissions.forEach(submission => {
            if (!submission.userId) return;
            
            const userId = submission.userId._id.toString();
            const questionId = submission.questionId.toString();
            
            if (!userScores.has(userId)) {
                userScores.set(userId, {
                    userId: userId,
                    user: submission.userId,
                    totalScore: 0,
                    problemsSolved: 0,
                    totalTime: 0,
                    lastSubmission: submission.submittedAt,
                    maxPossibleScore: 0,
                    questionScores: new Map()
                });
            }
            
            const userScore = userScores.get(userId);
            const currentQuestionScore = userScore.questionScores.get(questionId) || 0;
            
            // Update if this submission has a better score for this question
            if (submission.marksAwarded > currentQuestionScore) {
                const scoreDiff = submission.marksAwarded - currentQuestionScore;
                userScore.totalScore += scoreDiff;
                userScore.questionScores.set(questionId, submission.marksAwarded);
                
                // If this is the first time solving this question
                if (currentQuestionScore === 0 && submission.marksAwarded > 0) {
                    userScore.problemsSolved += 1;
                }
            }
            
            userScore.totalTime += submission.executionTime || 0;
            userScore.lastSubmission = submission.submittedAt;
        });

        // Calculate max possible score
        const maxPossibleScore = contest.questions.reduce((total, question) => total + question.totalMarks, 0);
        userScores.forEach(userScore => {
            userScore.maxPossibleScore = maxPossibleScore;
        });

        // Convert to array and sort by total score (descending)
        const leaderboard = Array.from(userScores.values())
            .sort((a, b) => {
                if (b.totalScore !== a.totalScore) {
                    return b.totalScore - a.totalScore;
                }
                // If scores are equal, sort by problems solved
                if (b.problemsSolved !== a.problemsSolved) {
                    return b.problemsSolved - a.problemsSolved;
                }
                // If still equal, sort by total time (ascending - faster is better)
                return a.totalTime - b.totalTime;
            });

        res.json({ leaderboard });
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});

module.exports = router;
