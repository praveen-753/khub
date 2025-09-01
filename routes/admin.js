const express = require('express');
const Contest = require('../models/Contest');
const Submission = require('../models/Submission');
const User = require('../models/User');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const upload = multer({ dest: 'uploads/' });

// Apply authentication middleware to all admin routes
router.use(authenticateToken);
router.use(requireAdmin);

// Create new contest
router.post('/contests', async (req, res) => {
    try {
        const contestData = {
            ...req.body,
            createdBy: req.user._id
        };

        const contest = new Contest(contestData);
        await contest.save();

        res.status(201).json({
            message: 'Contest created successfully',
            contest
        });
    } catch (error) {
        console.error('Contest creation error:', error);
        res.status(500).json({ error: 'Failed to create contest' });
    }
});

// Get all contests (admin view)
router.get('/contests', async (req, res) => {
    try {
        const contests = await Contest.find()
            .populate('createdBy', 'username email')
            .sort({ createdAt: -1 });

        res.json({ contests });
    } catch (error) {
        console.error('Error fetching contests:', error);
        res.status(500).json({ error: 'Failed to fetch contests' });
    }
});

// Get contest by ID (admin view)
router.get('/contests/:id', async (req, res) => {
    try {
        const contest = await Contest.findById(req.params.id)
            .populate('createdBy', 'username email');

        if (!contest) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        res.json({ contest });
    } catch (error) {
        console.error('Error fetching contest:', error);
        res.status(500).json({ error: 'Failed to fetch contest' });
    }
});

// Update contest
router.put('/contests/:id', async (req, res) => {
    try {
        const contest = await Contest.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!contest) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        res.json({
            message: 'Contest updated successfully',
            contest
        });
    } catch (error) {
        console.error('Contest update error:', error);
        res.status(500).json({ error: 'Failed to update contest' });
    }
});

// Delete contest
router.delete('/contests/:id', async (req, res) => {
    try {
        const contest = await Contest.findByIdAndDelete(req.params.id);

        if (!contest) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        // Also delete all submissions for this contest
        await Submission.deleteMany({ contestId: req.params.id });

        res.json({ message: 'Contest deleted successfully' });
    } catch (error) {
        console.error('Contest deletion error:', error);
        res.status(500).json({ error: 'Failed to delete contest' });
    }
});

// Add question to contest
router.post('/contests/:id/questions', async (req, res) => {
    try {
        const contest = await Contest.findById(req.params.id);

        if (!contest) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        contest.questions.push(req.body);
        await contest.save();

        res.status(201).json({
            message: 'Question added successfully',
            contest
        });
    } catch (error) {
        console.error('Question addition error:', error);
        res.status(500).json({ error: 'Failed to add question' });
    }
});

// Update question in contest
router.put('/contests/:contestId/questions/:questionId', async (req, res) => {
    try {
        const contest = await Contest.findById(req.params.contestId);

        if (!contest) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        const question = contest.questions.id(req.params.questionId);
        if (!question) {
            return res.status(404).json({ error: 'Question not found' });
        }

        Object.assign(question, req.body);
        await contest.save();

        res.json({
            message: 'Question updated successfully',
            contest
        });
    } catch (error) {
        console.error('Question update error:', error);
        res.status(500).json({ error: 'Failed to update question' });
    }
});

// Delete question from contest
router.delete('/contests/:contestId/questions/:questionId', async (req, res) => {
    try {
        const contest = await Contest.findById(req.params.contestId);

        if (!contest) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        contest.questions.id(req.params.questionId).remove();
        await contest.save();

        res.json({
            message: 'Question deleted successfully',
            contest
        });
    } catch (error) {
        console.error('Question deletion error:', error);
        res.status(500).json({ error: 'Failed to delete question' });
    }
});

// Get all submissions for admin review
router.get('/submissions', async (req, res) => {
    try {
        const { contestId, userId } = req.query;
        const filter = {};

        if (contestId) filter.contestId = contestId;
        if (userId) filter.userId = userId;

        const submissions = await Submission.find(filter)
            .populate('userId', 'username email fullName')
            .populate('contestId', 'name')
            .sort({ submittedAt: -1 });

        res.json({ submissions });
    } catch (error) {
        console.error('Error fetching submissions:', error);
        res.status(500).json({ error: 'Failed to fetch submissions' });
    }
});

// Get submission details
router.get('/submissions/:id', async (req, res) => {
    try {
        const submission = await Submission.findById(req.params.id)
            .populate('userId', 'username email fullName')
            .populate('contestId', 'name questions');

        if (!submission) {
            return res.status(404).json({ error: 'Submission not found' });
        }

        res.json({ submission });
    } catch (error) {
        console.error('Error fetching submission:', error);
        res.status(500).json({ error: 'Failed to fetch submission' });
    }
});

// Get contest statistics
router.get('/contests/:id/stats', async (req, res) => {
    try {
        const contestId = req.params.id;

        const submissions = await Submission.find({ contestId })
            .populate('userId', 'username email fullName');

        const stats = {
            totalSubmissions: submissions.length,
            uniqueParticipants: [...new Set(submissions.map(s => s.userId._id.toString()))].length,
            averageScore: submissions.length > 0 
                ? submissions.reduce((sum, s) => sum + (s.totalMarks / s.maxMarks * 100), 0) / submissions.length 
                : 0,
            submissionsByQuestion: {},
            topPerformers: []
        };

        // Calculate statistics by question
        const contest = await Contest.findById(contestId);
        contest.questions.forEach(question => {
            const questionSubmissions = submissions.filter(s => 
                s.questionId.toString() === question._id.toString()
            );
            
            stats.submissionsByQuestion[question.title] = {
                totalSubmissions: questionSubmissions.length,
                averageScore: questionSubmissions.length > 0 
                    ? questionSubmissions.reduce((sum, s) => sum + (s.totalMarks / s.maxMarks * 100), 0) / questionSubmissions.length 
                    : 0
            };
        });

        // Get top performers
        const userScores = {};
        submissions.forEach(submission => {
            const userId = submission.userId._id.toString();
            if (!userScores[userId]) {
                userScores[userId] = {
                    user: submission.userId,
                    totalScore: 0,
                    maxScore: 0,
                    submissions: 0
                };
            }
            userScores[userId].totalScore += submission.totalMarks;
            userScores[userId].maxScore += submission.maxMarks;
            userScores[userId].submissions += 1;
        });

        stats.topPerformers = Object.values(userScores)
            .map(user => ({
                ...user,
                percentage: user.maxScore > 0 ? (user.totalScore / user.maxScore * 100) : 0
            }))
            .sort((a, b) => b.percentage - a.percentage)
            .slice(0, 10);

        res.json({ stats });
    } catch (error) {
        console.error('Error fetching contest stats:', error);
        res.status(500).json({ error: 'Failed to fetch contest statistics' });
    }
});

// Add user management routes
router.post('/users/bulk-upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);

        const users = [];
        for (const row of data) {
            const user = new User({
                username: row.username,
                email: row.email,
                fullName: row.name,
                role: 'khub',
                teamNumber: row.teamNumber,
                batchYear: row.batchYear,
                password: `khub-${row.batchYear}`
            });
            users.push(user);
        }

        await User.insertMany(users);
        res.status(201).json({
            message: `Successfully added ${users.length} users`,
            userCount: users.length
        });
    } catch (error) {
        console.error('Bulk user upload error:', error);
        res.status(500).json({ error: 'Failed to upload users' });
    }
});

// Manually add a single user
router.post('/users', async (req, res) => {
    try {
        const { name, username, email, teamNumber, batchYear } = req.body;
        
        const user = new User({
            username,
            email,
            fullName: name,
            role: 'khub',
            teamNumber,
            batchYear,
            password: `khub-${batchYear}`
        });

        await user.save();
        res.status(201).json({
            message: 'User created successfully',
            user: {
                username: user.username,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                teamNumber: user.teamNumber,
                batchYear: user.batchYear
            }
        });
    } catch (error) {
        console.error('User creation error:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// Get all users
router.get('/users', async (req, res) => {
    try {
        const users = await User.find({}, '-password');
        res.json({ users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

module.exports = router;
