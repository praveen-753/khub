const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Task = require('../models/Task');
const Course = require('../models/Course');
const { authenticateToken } = require('../middleware/auth');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads/tasks');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const taskId = req.params.taskId || 'temp';
        const userDir = path.join(uploadDir, taskId);
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }
        cb(null, userDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    // Allow images and documents
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|zip|rar/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only images and documents are allowed.'));
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: fileFilter
});

// Apply authentication middleware
router.use(authenticateToken);

// Get all tasks for a course module
router.get('/course/:courseId/module/:moduleId', async (req, res) => {
    try {
        const { courseId, moduleId } = req.params;
        
        const tasks = await Task.find({
            courseId: courseId,
            moduleId: moduleId,
            isActive: true
        })
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 });

        // Add submission status for current user
        const tasksWithStatus = tasks.map(task => {
            const userSubmission = task.submissions.find(
                sub => sub.user.toString() === req.user._id.toString()
            );
            
            return {
                ...task.toObject(),
                userSubmission: userSubmission || null,
                hasSubmitted: !!userSubmission,
                submissionStatus: userSubmission?.status || null
            };
        });

        res.json({ tasks: tasksWithStatus });
    } catch (error) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
});

// Get single task details
router.get('/:taskId', async (req, res) => {
    try {
        const task = await Task.findById(req.params.taskId)
            .populate('createdBy', 'name email')
            .populate('submissions.user', 'name email')
            .populate('submissions.grade.gradedBy', 'name email');

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // Check if user has access to this task (enrolled in course)
        const course = await Course.findById(task.courseId);
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        // Find user's submission
        const userSubmission = task.submissions.find(
            sub => sub.user._id.toString() === req.user._id.toString()
        );

        const taskData = {
            ...task.toObject(),
            userSubmission: userSubmission || null,
            hasSubmitted: !!userSubmission
        };

        // If not admin/instructor, hide other users' submissions
        if (!['admin', 'instructor'].includes(req.user.role)) {
            taskData.submissions = userSubmission ? [userSubmission] : [];
        }

        res.json({ task: taskData });
    } catch (error) {
        console.error('Error fetching task:', error);
        res.status(500).json({ error: 'Failed to fetch task' });
    }
});

// Create new task (admin/instructor only)
router.post('/', upload.array('taskFiles', 5), async (req, res) => {
    try {
        // Check permissions
        if (!['admin', 'instructor'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Admin or instructor access required' });
        }

        const {
            title,
            description,
            courseId,
            moduleId,
            instructions,
            dueDate,
            maxScore,
            allowedFileTypes
        } = req.body;

        // Validate required fields
        if (!title || !description || !courseId || !moduleId) {
            return res.status(400).json({ error: 'Title, description, courseId, and moduleId are required' });
        }

        // Verify course exists
        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        // Process uploaded files
        const taskFiles = req.files ? req.files.map(file => ({
            originalName: file.originalname,
            filename: file.filename,
            mimetype: file.mimetype,
            size: file.size
        })) : [];

        const task = new Task({
            title,
            description,
            courseId,
            moduleId,
            taskFiles,
            instructions,
            dueDate: dueDate ? new Date(dueDate) : undefined,
            maxScore: maxScore ? parseInt(maxScore) : 100,
            allowedFileTypes: allowedFileTypes ? allowedFileTypes.split(',') : undefined,
            createdBy: req.user._id
        });

        await task.save();
        await task.populate('createdBy', 'name email');

        res.status(201).json({
            message: 'Task created successfully',
            task
        });
    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).json({ error: 'Failed to create task' });
    }
});

// Submit task (students)
router.post('/:taskId/submit', async (req, res) => {
    try {
        const { taskId } = req.params;
        const { submissionText, submissionLinks } = req.body;

        console.log('Task submission received:');
        console.log('taskId:', taskId);
        console.log('submissionText:', submissionText);
        console.log('submissionLinks:', submissionLinks);
        console.log('Full request body:', req.body);

        const task = await Task.findById(taskId);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // Check if due date has passed
        if (task.dueDate && new Date() > task.dueDate) {
            return res.status(400).json({ error: 'Task submission deadline has passed' });
        }

        // Check if user already submitted
        const existingSubmissionIndex = task.submissions.findIndex(
            sub => sub.user.toString() === req.user._id.toString()
        );

        // Validate submission links
        const validatedLinks = [];
        if (submissionLinks && Array.isArray(submissionLinks)) {
            console.log('Processing submission links:', submissionLinks);
            for (const link of submissionLinks) {
                if (link.title && link.url) {
                    // Basic URL validation
                    try {
                        new URL(link.url);
                        const validatedLink = {
                            title: link.title.trim(),
                            url: link.url.trim(),
                            type: link.type || 'other',
                            addedAt: new Date()
                        };
                        validatedLinks.push(validatedLink);
                        console.log('Added validated link:', validatedLink);
                    } catch (error) {
                        console.log('Invalid URL found:', link.url);
                        return res.status(400).json({ error: `Invalid URL: ${link.url}` });
                    }
                }
            }
        } else {
            console.log('No submission links found or not an array');
        }

        const submission = {
            user: req.user._id,
            submissionLinks: validatedLinks,
            submissionText: submissionText || '',
            submittedAt: new Date(),
            status: 'submitted'
        };

        console.log('Final submission object:', submission);

        if (existingSubmissionIndex >= 0) {
            // Update existing submission
            task.submissions[existingSubmissionIndex] = submission;
            console.log('Updated existing submission at index:', existingSubmissionIndex);
        } else {
            // Add new submission
            task.submissions.push(submission);
            console.log('Added new submission, total submissions:', task.submissions.length);
        }

        await task.save();
        console.log('Task saved successfully');

        res.json({
            message: 'Task submitted successfully',
            submission
        });
    } catch (error) {
        console.error('Error submitting task:', error);
        res.status(500).json({ error: 'Failed to submit task' });
    }
});

// Grade task submission (admin/instructor only)
router.put('/:taskId/submissions/:submissionId/grade', async (req, res) => {
    try {
        // Check permissions
        if (!['admin', 'instructor'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Admin or instructor access required' });
        }

        const { taskId, submissionId } = req.params;
        const { score, feedback } = req.body;

        const task = await Task.findById(taskId);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // Find submission by ID (for embedded documents, we need to find by _id in array)
        const submissionIndex = task.submissions.findIndex(
            sub => sub._id.toString() === submissionId
        );
        
        if (submissionIndex === -1) {
            return res.status(404).json({ error: 'Submission not found' });
        }

        const submission = task.submissions[submissionIndex];

        // Validate score
        if (score < 0 || score > task.maxScore) {
            return res.status(400).json({ error: `Score must be between 0 and ${task.maxScore}` });
        }

        // Update the submission
        submission.grade = {
            score: score,
            feedback: feedback || '',
            gradedAt: new Date(),
            gradedBy: req.user._id
        };
        submission.status = 'graded';

        await task.save();

        res.json({
            message: 'Submission graded successfully',
            submission
        });
    } catch (error) {
        console.error('Error grading submission:', error);
        res.status(500).json({ error: 'Failed to grade submission' });
    }
});

// Get all submissions for a task (admin/instructor only)
router.get('/:taskId/submissions', async (req, res) => {
    try {
        // Check permissions
        if (!['admin', 'instructor'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Admin or instructor access required' });
        }

        console.log('=== FETCHING TASK SUBMISSIONS ===');
        console.log('TaskId:', req.params.taskId);
        console.log('Requesting user:', req.user.username, 'Role:', req.user.role);

        const task = await Task.findById(req.params.taskId)
            .populate('submissions.user', 'fullName email username teamNumber batchYear')
            .populate('submissions.grade.gradedBy', 'fullName email username');

        if (!task) {
            console.log('Task not found for ID:', req.params.taskId);
            return res.status(404).json({ error: 'Task not found' });
        }

        console.log('Task found:', task.title);
        console.log('Number of submissions:', task.submissions.length);
        
        // Log each submission with user data
        task.submissions.forEach((submission, index) => {
            console.log(`Submission ${index + 1}:`, {
                submissionId: submission._id,
                user: submission.user,
                userType: typeof submission.user,
                submittedAt: submission.submittedAt,
                status: submission.status,
                linksCount: submission.submissionLinks?.length || 0,
                hasGrade: !!submission.grade
            });
        });

        const responseData = {
            task: {
                _id: task._id,
                title: task.title,
                description: task.description,
                maxScore: task.maxScore,
                dueDate: task.dueDate
            },
            submissions: task.submissions
        };

        console.log('Sending response with submissions:', responseData.submissions.length);
        res.json(responseData);
    } catch (error) {
        console.error('Error fetching submissions:', error);
        res.status(500).json({ error: 'Failed to fetch submissions' });
    }
});

// Get user's own submissions for a task (students)
router.get('/:taskId/user-submissions', async (req, res) => {
    try {
        const task = await Task.findById(req.params.taskId);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // Find user's submissions
        const userSubmissions = task.submissions.filter(
            sub => sub.user.toString() === req.user._id.toString()
        );

        res.json({
            submissions: userSubmissions
        });
    } catch (error) {
        console.error('Error fetching user submissions:', error);
        res.status(500).json({ error: 'Failed to fetch user submissions' });
    }
});

// Download task file
router.get('/:taskId/files/:filename', async (req, res) => {
    try {
        const { taskId, filename } = req.params;
        
        const task = await Task.findById(taskId);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const filePath = path.join(uploadDir, taskId, filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        res.download(filePath);
    } catch (error) {
        console.error('Error downloading file:', error);
        res.status(500).json({ error: 'Failed to download file' });
    }
});

// Delete task (admin/instructor only)
router.delete('/:taskId', async (req, res) => {
    try {
        // Check permissions
        if (!['admin', 'instructor'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Admin or instructor access required' });
        }

        const task = await Task.findById(req.params.taskId);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // Soft delete
        task.isActive = false;
        await task.save();

        res.json({ message: 'Task deleted successfully' });
    } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

module.exports = router;