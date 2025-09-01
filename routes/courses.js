const express = require('express');
const Course = require('../models/Course');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get all courses (published ones for regular users, all for admins)
router.get('/', async (req, res) => {
    console.log('🌐 GET /api/courses called');
    try {
        let query = {};
        if (req.user.role !== 'admin') {
            query.isPublished = true;
        }
        console.log('Course query:', query);
        const courses = await Course.find(query)
            .populate('createdBy', 'username fullName')
            .sort({ createdAt: -1 });
        console.log('Courses found:', courses.length);
        res.json({ courses });
    } catch (error) {
        console.error('Error fetching courses:', error);
        res.status(500).json({ error: 'Failed to fetch courses' });
    }
});

// Create new course
router.post('/', requireAdmin, async (req, res) => {
    try {
        const courseData = {
            ...req.body,
            createdBy: req.user._id
        };
// console.log('Creating course with data:', courseData);
        const course = new Course(courseData);
        await course.save();

        res.status(201).json({
            message: 'Course created successfully',
            course
        });
    } catch (error) {
        console.error('Course creation error:', error);
        res.status(500).json({ error: 'Failed to create course' });
    }
});

// Get course by ID
router.get('/:id', async (req, res) => {
    try {
        const course = await Course.findById(req.params.id)
            .populate('createdBy', 'username fullName');

        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        // Check if course is published or user is admin/creator
        if (!course.isPublished && 
            req.user.role !== 'admin' && 
            course.createdBy._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json({ course });
    } catch (error) {
        console.error('Error fetching course:', error);
        res.status(500).json({ error: 'Failed to fetch course' });
    }
});

// Update course
router.put('/:id', requireAdmin, async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        // Update course fields
        Object.assign(course, req.body);
        await course.save();

        res.json({
            message: 'Course updated successfully',
            course
        });
    } catch (error) {
        console.error('Course update error:', error);
        res.status(500).json({ error: 'Failed to update course' });
    }
});

// Delete course
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const course = await Course.findByIdAndDelete(req.params.id);
        
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        res.json({ message: 'Course deleted successfully' });
    } catch (error) {
        console.error('Course deletion error:', error);
        res.status(500).json({ error: 'Failed to delete course' });
    }
});

// Add module to course
router.post('/:id/modules', requireAdmin, async (req, res) => {
    console.log('🌐 POST /api/courses/:id/modules called');
    console.log('Adding module:', req.body);
    try {
        const course = await Course.findById(req.params.id);
        
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        course.modules.push({
            name: req.body.name
        });

        await course.save();
        console.log('Module added successfully to course:', course.title);

        res.status(201).json({
            message: 'Module added successfully',
            course
        });
    } catch (error) {
        console.error('Module addition error:', error);
        res.status(500).json({ error: 'Failed to add module' });
    }
});

// Update module
router.put('/:courseId/modules/:moduleId', requireAdmin, async (req, res) => {
    console.log('🌐 PUT /api/courses/:courseId/modules/:moduleId called');
    console.log('Updating module:', req.params.moduleId);
    try {
        const course = await Course.findById(req.params.courseId);
        
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        const module = course.modules.id(req.params.moduleId);
        if (!module) {
            return res.status(404).json({ error: 'Module not found' });
        }

        module.name = req.body.name;
        await course.save();
        console.log('Module updated successfully');

        res.json({
            message: 'Module updated successfully',
            course
        });
    } catch (error) {
        console.error('Module update error:', error);
        res.status(500).json({ error: 'Failed to update module' });
    }
});

// Delete module
router.delete('/:courseId/modules/:moduleId', requireAdmin, async (req, res) => {
    console.log('🌐 DELETE /api/courses/:courseId/modules/:moduleId called');
    console.log('Deleting module:', req.params.moduleId);
    try {
        const course = await Course.findById(req.params.courseId);
        
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        course.modules.id(req.params.moduleId).remove();
        await course.save();
        console.log('Module deleted successfully');

        res.json({
            message: 'Module deleted successfully',
            course
        });
    } catch (error) {
        console.error('Module deletion error:', error);
        res.status(500).json({ error: 'Failed to delete module' });
    }
});

// Add main topic to module
router.post('/:courseId/modules/:moduleId/topics', requireAdmin, async (req, res) => {
    console.log('🌐 POST /api/courses/:courseId/modules/:moduleId/topics called');
    try {
        const course = await Course.findById(req.params.courseId);
        
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        const module = course.modules.id(req.params.moduleId);
        if (!module) {
            return res.status(404).json({ error: 'Module not found' });
        }

        module.mainTopics.push(req.body);
        await course.save();
        console.log('Main topic added successfully');

        res.status(201).json({
            message: 'Main topic added successfully',
            course
        });
    } catch (error) {
        console.error('Main topic addition error:', error);
        res.status(500).json({ error: 'Failed to add main topic' });
    }
});

module.exports = router;