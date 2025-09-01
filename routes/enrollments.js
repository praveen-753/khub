const express = require('express');
const router = express.Router();
const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');
const { authenticateToken } = require('../middleware/auth');

// Apply authentication to all routes
router.use(authenticateToken);

// Enroll in a course
router.post('/:courseId', async (req, res) => {
    try {
        const course = await Course.findById(req.params.courseId);
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        // Calculate total topics in the course
        let totalTopics = 0;
        course.modules.forEach(module => {
            totalTopics += module.mainTopics ? module.mainTopics.length : 0;
        });

        // Create or update enrollment document
        let enrollment = await Enrollment.findOne({ courseId: req.params.courseId });
        
        if (!enrollment) {
            enrollment = new Enrollment({
                courseId: req.params.courseId,
                totalTopics,
                enrollments: [{
                    userId: req.user._id,
                    currentModule: course.modules[0]?._id,
                    currentTopic: course.modules[0]?.mainTopics[0]?._id,
                    completedTopics: [],
                    completionPercentage: 0
                }]
            });
        } else {
            // Check if user is already enrolled
            if (enrollment.enrollments.some(e => e.userId.toString() === req.user._id.toString())) {
                return res.status(400).json({ error: 'Already enrolled in this course' });
            }

            // Update total topics count in case course structure has changed
            enrollment.totalTopics = totalTopics;

            // Add new enrollment for this user
            enrollment.enrollments.push({
                userId: req.user._id,
                currentModule: course.modules[0]?._id,
                currentTopic: course.modules[0]?.mainTopics[0]?._id,
                completedTopics: [],
                completionPercentage: 0
            });
        }

        await enrollment.save();
        res.status(201).json({ message: 'Enrolled successfully', enrollment });
    } catch (error) {
        console.error('Enrollment error:', error);
        res.status(500).json({ error: 'Failed to enroll in course' });
    }
});

// Get user's enrolled courses with progress
router.get('/my-courses', async (req, res) => {
    try {
        const enrollments = await Enrollment.find({
            'enrollments.userId': req.user._id
        }).populate('courseId');
        
        const coursesWithProgress = enrollments.map(enrollment => {
            const userProgress = enrollment.enrollments.find(
                e => e.userId.toString() === req.user._id.toString()
            );
            return {
                course: enrollment.courseId,
                progress: userProgress,
                totalTopics: enrollment.totalTopics
            };
        });
        
        res.json({ enrollments: coursesWithProgress });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch enrolled courses' });
    }
});

// Mark topic as complete
router.post('/:courseId/topics/:topicId/complete', async (req, res) => {
    try {
        const enrollment = await Enrollment.findOne({ courseId: req.params.courseId });
        if (!enrollment) {
            return res.status(404).json({ error: 'Enrollment not found' });
        }

        const userEnrollment = enrollment.enrollments.find(
            e => e.userId.toString() === req.user._id.toString()
        );

        if (!userEnrollment) {
            return res.status(404).json({ error: 'User not enrolled in this course' });
        }

        // Add topic to completed topics if not already completed
        if (!userEnrollment.completedTopics.includes(req.params.topicId)) {
            userEnrollment.completedTopics.push(req.params.topicId);
        }

        // Update completion percentage based on total topics
        userEnrollment.completionPercentage = 
            (userEnrollment.completedTopics.length / enrollment.totalTopics) * 100;

        // Update last accessed
        userEnrollment.lastAccessedAt = new Date();

        await enrollment.save();
        res.json({ 
            message: 'Topic marked as complete', 
            progress: userEnrollment 
        });
    } catch (error) {
        console.error('Error marking topic complete:', error);
        res.status(500).json({ error: 'Failed to mark topic as complete' });
    }
});

// Update current module and topic
router.put('/:courseId/progress', async (req, res) => {
    try {
        const enrollment = await Enrollment.findOne({ courseId: req.params.courseId });
        if (!enrollment) {
            return res.status(404).json({ error: 'Enrollment not found' });
        }

        const userEnrollment = enrollment.enrollments.find(
            e => e.userId.toString() === req.user._id.toString()
        );

        if (!userEnrollment) {
            return res.status(404).json({ error: 'User not enrolled in this course' });
        }

        // Update current module and topic
        if (req.body.moduleId) userEnrollment.currentModule = req.body.moduleId;
        if (req.body.topicId) userEnrollment.currentTopic = req.body.topicId;
        userEnrollment.lastAccessedAt = new Date();

        await enrollment.save();
        res.json({ 
            message: 'Progress updated', 
            progress: userEnrollment 
        });
    } catch (error) {
        console.error('Error updating progress:', error);
        res.status(500).json({ error: 'Failed to update progress' });
    }
});

// Check enrollment status
router.get('/:courseId/status', async (req, res) => {
    try {
        const enrollment = await Enrollment.findOne({
            courseId: req.params.courseId,
            'enrollments.userId': req.user._id
        });
        
        const userEnrollment = enrollment ? enrollment.enrollments.find(
            e => e.userId.toString() === req.user._id.toString()
        ) : null;
        
        res.json({ 
            isEnrolled: !!userEnrollment,
            progress: userEnrollment
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to check enrollment status' });
    }
});

// Update enrollment status
router.put('/:courseId/status', async (req, res) => {
    try {
        const enrollment = await Enrollment.findOne({ courseId: req.params.courseId });
        if (!enrollment) {
            return res.status(404).json({ error: 'Enrollment not found' });
        }

        const userEnrollment = enrollment.enrollments.find(
            e => e.userId.toString() === req.user._id.toString()
        );

        if (!userEnrollment) {
            return res.status(404).json({ error: 'User not enrolled in this course' });
        }

        userEnrollment.status = req.body.status;
        await enrollment.save();
        
        res.json({ message: 'Status updated successfully', enrollment: userEnrollment });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update enrollment status' });
    }
});

// Get all enrollments for a specific course (Admin only)
router.get('/course/:courseId', async (req, res) => {
    try {
        // Check if user is admin or instructor
        if (!['admin', 'instructor'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Admin or instructor access required' });
        }

        const enrollment = await Enrollment.findOne({ courseId: req.params.courseId })
            .populate('enrollments.userId', 'fullName username email teamNumber batchYear');
        
        if (!enrollment) {
            return res.json({ enrollments: [] });
        }

        // Transform the data to match the expected format
        const enrollments = enrollment.enrollments.map(userEnrollment => ({
            _id: userEnrollment._id,
            user: userEnrollment.userId,
            enrolledAt: userEnrollment.enrolledAt,
            progress: userEnrollment.completionPercentage,
            lastAccessedAt: userEnrollment.lastAccessedAt,
            completedTopics: userEnrollment.completedTopics.length,
            totalTopics: enrollment.totalTopics,
            status: userEnrollment.status
        }));
        
        res.json({ enrollments });
    } catch (error) {
        console.error('Error fetching course enrollments:', error);
        res.status(500).json({ error: 'Failed to fetch course enrollments' });
    }
});

// Get all enrollments across all courses (Admin only)
router.get('/all', async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const enrollments = await Enrollment.find({})
            .populate('courseId', 'title subtitle')
            .populate('enrollments.userId', 'fullName username email teamNumber batchYear');
        
        res.json({ enrollments });
    } catch (error) {
        console.error('Error fetching all enrollments:', error);
        res.status(500).json({ error: 'Failed to fetch enrollments' });
    }
});

module.exports = router;