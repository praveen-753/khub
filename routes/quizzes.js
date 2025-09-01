const express = require('express');
const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');
const Course = require('../models/Course');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get all quizzes for a specific module
router.get('/course/:courseId/module/:moduleId', async (req, res) => {
    try {
        const quizzes = await Quiz.find({
            courseId: req.params.courseId,
            moduleId: req.params.moduleId,
            isActive: true
        })
        .populate('createdBy', 'fullName username')
        .select('-questions.options.isCorrect') // Hide correct answers from list view
        .sort({ createdAt: -1 });

        res.json({ quizzes });
    } catch (error) {
        console.error('Error fetching quizzes:', error);
        res.status(500).json({ error: 'Failed to fetch quizzes' });
    }
});

// Get quiz details for taking the quiz
router.get('/:quizId', async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.quizId)
            .populate('courseId', 'title')
            .select('-questions.options.isCorrect'); // Hide correct answers

        if (!quiz || !quiz.isActive) {
            return res.status(404).json({ error: 'Quiz not found' });
        }

        // Check if user has attempts left
        const attemptCount = await QuizAttempt.countDocuments({
            quizId: req.params.quizId,
            userId: req.user._id
        });

        const canAttempt = quiz.settings.allowMultipleAttempts || attemptCount === 0;
        const attemptsLeft = quiz.settings.maxAttempts - attemptCount;

        // Shuffle questions and options if required
        let questions = quiz.questions;
        if (quiz.settings.shuffleQuestions) {
            questions = [...questions].sort(() => Math.random() - 0.5);
        }

        if (quiz.settings.shuffleOptions) {
            questions = questions.map(q => ({
                ...q.toObject(),
                options: [...q.options].sort(() => Math.random() - 0.5)
            }));
        }

        res.json({
            quiz: {
                ...quiz.toObject(),
                questions
            },
            canAttempt,
            attemptsLeft: Math.max(0, attemptsLeft),
            attemptCount
        });
    } catch (error) {
        console.error('Error fetching quiz:', error);
        res.status(500).json({ error: 'Failed to fetch quiz' });
    }
});

// Submit quiz attempt
router.post('/:quizId/submit', async (req, res) => {
    try {
        const { answers, timeSpent } = req.body;
        
        const quiz = await Quiz.findById(req.params.quizId);
        if (!quiz || !quiz.isActive) {
            return res.status(404).json({ error: 'Quiz not found' });
        }

        // Check attempt limits
        const attemptCount = await QuizAttempt.countDocuments({
            quizId: req.params.quizId,
            userId: req.user._id
        });

        if (!quiz.settings.allowMultipleAttempts && attemptCount > 0) {
            return res.status(400).json({ error: 'Multiple attempts not allowed' });
        }

        if (attemptCount >= quiz.settings.maxAttempts) {
            return res.status(400).json({ error: 'Maximum attempts exceeded' });
        }

        // Grade the quiz
        const gradedAnswers = answers.map(answer => {
            const question = quiz.questions.id(answer.questionId);
            if (!question) return { ...answer, isCorrect: false, pointsEarned: 0 };

            const correctOptions = question.options.filter(opt => opt.isCorrect).map(opt => opt._id.toString());
            const selectedOptions = answer.selectedOptions || [];

            let isCorrect = false;
            if (question.questionType === 'mcq') {
                // For MCQ, exactly one correct option should be selected
                isCorrect = selectedOptions.length === 1 && 
                           correctOptions.includes(selectedOptions[0]);
            } else {
                // For MSQ, all correct options should be selected and no incorrect ones
                const selectedSet = new Set(selectedOptions);
                const correctSet = new Set(correctOptions);
                isCorrect = selectedSet.size === correctSet.size && 
                           [...selectedSet].every(opt => correctSet.has(opt));
            }

            return {
                questionId: answer.questionId,
                selectedOptions: selectedOptions,
                isCorrect,
                pointsEarned: isCorrect ? question.points : 0
            };
        });

        const totalScore = gradedAnswers.reduce((sum, answer) => sum + answer.pointsEarned, 0);
        const percentage = quiz.totalPoints > 0 ? (totalScore / quiz.totalPoints) * 100 : 0;
        const isPassed = percentage >= quiz.settings.passingScore;

        const quizAttempt = new QuizAttempt({
            quizId: req.params.quizId,
            userId: req.user._id,
            answers: gradedAnswers,
            score: totalScore,
            percentage: Math.round(percentage * 100) / 100,
            timeSpent: timeSpent || 0,
            isPassed,
            submittedAt: new Date(),
            attemptNumber: attemptCount + 1
        });

        await quizAttempt.save();

        // Prepare response based on quiz settings
        let responseData = {
            score: totalScore,
            percentage: quizAttempt.percentage,
            isPassed,
            totalPoints: quiz.totalPoints,
            attemptNumber: quizAttempt.attemptNumber
        };

        if (quiz.settings.showResults) {
            responseData.answers = gradedAnswers;
            
            if (quiz.settings.showCorrectAnswers) {
                responseData.correctAnswers = quiz.questions.map(q => ({
                    questionId: q._id,
                    correctOptions: q.options.filter(opt => opt.isCorrect).map(opt => opt._id),
                    explanation: q.explanation
                }));
            }
        }

        res.json(responseData);
    } catch (error) {
        console.error('Error submitting quiz:', error);
        res.status(500).json({ error: 'Failed to submit quiz' });
    }
});

// Get user's quiz attempts
router.get('/:quizId/attempts', async (req, res) => {
    try {
        const attempts = await QuizAttempt.find({
            quizId: req.params.quizId,
            userId: req.user._id
        })
        .populate('quizId', 'title settings')
        .sort({ attemptNumber: -1 });

        res.json({ attempts });
    } catch (error) {
        console.error('Error fetching attempts:', error);
        res.status(500).json({ error: 'Failed to fetch attempts' });
    }
});

// Admin routes
// Create quiz
router.post('/', requireAdmin, async (req, res) => {
    try {
        const { courseId, moduleId } = req.body;
        
        // Verify course and module exist
        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        const module = course.modules.id(moduleId);
        if (!module) {
            return res.status(404).json({ error: 'Module not found' });
        }

        const quiz = new Quiz({
            ...req.body,
            createdBy: req.user._id
        });

        await quiz.save();
        
        res.status(201).json({
            message: 'Quiz created successfully',
            quiz
        });
    } catch (error) {
        console.error('Error creating quiz:', error);
        res.status(500).json({ error: 'Failed to create quiz' });
    }
});

// Update quiz
router.put('/:quizId', requireAdmin, async (req, res) => {
    try {
        const quiz = await Quiz.findByIdAndUpdate(
            req.params.quizId,
            { ...req.body, updatedAt: new Date() },
            { new: true, runValidators: true }
        );

        if (!quiz) {
            return res.status(404).json({ error: 'Quiz not found' });
        }

        res.json({
            message: 'Quiz updated successfully',
            quiz
        });
    } catch (error) {
        console.error('Error updating quiz:', error);
        res.status(500).json({ error: 'Failed to update quiz' });
    }
});

// Delete quiz
router.delete('/:quizId', requireAdmin, async (req, res) => {
    try {
        const quiz = await Quiz.findByIdAndDelete(req.params.quizId);
        
        if (!quiz) {
            return res.status(404).json({ error: 'Quiz not found' });
        }

        // Also delete all attempts for this quiz
        await QuizAttempt.deleteMany({ quizId: req.params.quizId });

        res.json({ message: 'Quiz deleted successfully' });
    } catch (error) {
        console.error('Error deleting quiz:', error);
        res.status(500).json({ error: 'Failed to delete quiz' });
    }
});

// Get all quizzes (admin)
router.get('/admin/all', requireAdmin, async (req, res) => {
    try {
        const { courseId } = req.query;
        let filter = {};
        
        if (courseId) {
            filter.courseId = courseId;
        }

        const quizzes = await Quiz.find(filter)
            .populate('courseId', 'title')
            .populate('createdBy', 'fullName username')
            .sort({ createdAt: -1 });

        res.json({ quizzes });
    } catch (error) {
        console.error('Error fetching all quizzes:', error);
        res.status(500).json({ error: 'Failed to fetch quizzes' });
    }
});

// Get quiz statistics (admin)
router.get('/:quizId/stats', requireAdmin, async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.quizId);
        if (!quiz) {
            return res.status(404).json({ error: 'Quiz not found' });
        }

        const attempts = await QuizAttempt.find({ quizId: req.params.quizId })
            .populate('userId', 'fullName username email');

        const stats = {
            totalAttempts: attempts.length,
            uniqueUsers: [...new Set(attempts.map(a => a.userId._id.toString()))].length,
            averageScore: attempts.length > 0 
                ? attempts.reduce((sum, a) => sum + a.percentage, 0) / attempts.length 
                : 0,
            passRate: attempts.length > 0 
                ? (attempts.filter(a => a.isPassed).length / attempts.length) * 100 
                : 0,
            averageTimeSpent: attempts.length > 0 
                ? attempts.reduce((sum, a) => sum + a.timeSpent, 0) / attempts.length 
                : 0
        };

        res.json({ stats, attempts });
    } catch (error) {
        console.error('Error fetching quiz stats:', error);
        res.status(500).json({ error: 'Failed to fetch quiz statistics' });
    }
});

module.exports = router;