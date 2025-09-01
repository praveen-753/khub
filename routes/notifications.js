const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { authenticateToken } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Rate limiting for notifications
const createNotificationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50 // limit each IP to 50 requests per windowMs
});

const readNotificationLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100 // limit each IP to 100 requests per windowMs
});

// Apply authentication middleware
router.use(authenticateToken);

// Get all notifications for current user with pagination
router.get('/', async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        const limitNum = Math.min(parseInt(limit), 100); // Max 100 per request
        const offsetNum = parseInt(offset) || 0;

        // Get notifications with pagination
        const notifications = await Notification.find()
            .populate('courseId', 'title')
            .sort({ createdAt: -1 })
            .limit(limitNum)
            .skip(offsetNum)
            .lean();

        // Get total count for pagination
        const total = await Notification.countDocuments();

        // Process notifications to include read status
        const processedNotifications = notifications.map(notification => {
            const recipient = notification.recipients?.find(
                r => r.user?.toString() === req.user._id.toString()
            );
            
            return {
                ...notification,
                status: recipient ? 'read' : 'unread',
                readAt: recipient?.readAt || null
            };
        });

        // Count unread notifications
        const unreadCount = await Notification.countDocuments({
            'recipients.user': { $ne: req.user._id }
        });

        res.json({ 
            notifications: processedNotifications,
            total,
            unreadCount,
            hasMore: (offsetNum + limitNum) < total
        });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Get course-specific notifications
router.get('/course/:courseId', async (req, res) => {
    try {
        const { courseId } = req.params;
        
        const notifications = await Notification.find({
            $or: [
                { courseId: courseId },
                { type: 'global' } // Include global notifications
            ]
        })
        .populate('courseId', 'title')
        .sort({ createdAt: -1 })
        .lean();

        // Process notifications to include read status
        const processedNotifications = notifications.map(notification => {
            const recipient = notification.recipients?.find(
                r => r.user?.toString() === req.user._id.toString()
            );
            
            return {
                ...notification,
                status: recipient ? 'read' : 'unread',
                readAt: recipient?.readAt || null
            };
        });

        res.json({ notifications: processedNotifications });
    } catch (error) {
        console.error('Error fetching course notifications:', error);
        res.status(500).json({ error: 'Failed to fetch course notifications' });
    }
});

// Get unread count for all notifications
router.get('/unread-count', async (req, res) => {
    try {
        const count = await Notification.countDocuments({
            'recipients.user': { $ne: req.user._id }
        });
        
        res.json({ count });
    } catch (error) {
        console.error('Error fetching unread count:', error);
        res.status(500).json({ error: 'Failed to fetch unread count' });
    }
});

// Get unread count for course-specific notifications
router.get('/course/:courseId/unread-count', async (req, res) => {
    try {
        const { courseId } = req.params;
        
        const count = await Notification.countDocuments({
            $or: [
                { courseId: courseId },
                { type: 'global' }
            ],
            'recipients.user': { $ne: req.user._id }
        });
        
        res.json({ count });
    } catch (error) {
        console.error('Error fetching course unread count:', error);
        res.status(500).json({ error: 'Failed to fetch course unread count' });
    }
});

// Create new notification (admin/instructor only)
router.post('/', createNotificationLimiter, async (req, res) => {
    try {
        // Debug logging
        console.log('📝 Notification Creation Debug:', {
            userRole: req.user.role,
            userId: req.user._id,
            email: req.user.email,
            requestBody: req.body,
            timestamp: new Date().toISOString()
        });

        // Check if user has permission to create notifications
        const allowedRoles = ['admin', 'instructor'];
        if (!allowedRoles.includes(req.user.role)) {
            console.log('❌ Authorization Failed:', {
                userRole: req.user.role,
                allowedRoles,
                userId: req.user._id
            });
            return res.status(403).json({ 
                error: 'Not authorized to create notifications. Admin or instructor role required.',
                currentRole: req.user.role,
                requiredRoles: allowedRoles
            });
        }

        const { title, message, type = 'general', courseId, priority = 'low', targetUsers = [] } = req.body;

        // Validate required fields
        if (!title || !message) {
            return res.status(400).json({ error: 'Title and message are required' });
        }

        // Validate type-specific requirements
        if (type === 'course' && !courseId) {
            return res.status(400).json({ error: 'Course ID is required for course notifications' });
        }

        // For instructors, ensure they can only create notifications for their courses
        if (req.user.role === 'instructor' && type === 'course') {
            // TODO: Add course ownership check if needed
            // const course = await Course.findById(courseId);
            // if (!course || course.instructor.toString() !== req.user._id.toString()) {
            //     return res.status(403).json({ error: 'Not authorized to create notifications for this course' });
            // }
        }

        const notification = new Notification({
            title,
            message,
            type,
            courseId: type === 'course' ? courseId : undefined,
            priority,
            targetUsers: targetUsers.length > 0 ? targetUsers : undefined,
            createdBy: req.user._id
        });

        await notification.save();
        await notification.populate('courseId', 'title');
        
        console.log('✅ Notification Created Successfully:', {
            notificationId: notification._id,
            title: notification.title,
            type: notification.type
        });
        
        res.status(201).json({ 
            message: 'Notification created successfully',
            notification 
        });
    } catch (error) {
        console.error('💥 Error creating notification:', error);
        res.status(500).json({ error: 'Failed to create notification', details: error.message });
    }
});

// Mark notifications as read
router.put('/read', readNotificationLimiter, async (req, res) => {
    try {
        const { notificationIds } = req.body;
        
        if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
            return res.status(400).json({ error: 'notificationIds must be a non-empty array' });
        }

        // Limit batch size
        if (notificationIds.length > 50) {
            return res.status(400).json({ error: 'Cannot mark more than 50 notifications at once' });
        }

        // Use bulkWrite for better performance
        const bulkOps = notificationIds.map(notificationId => ({
            updateOne: {
                filter: { 
                    _id: notificationId,
                    'recipients.user': { $ne: req.user._id }
                },
                update: {
                    $addToSet: {
                        recipients: {
                            user: req.user._id,
                            readAt: new Date()
                        }
                    }
                }
            }
        }));

        const result = await Notification.bulkWrite(bulkOps);
        
        res.json({ 
            success: true,
            modifiedCount: result.modifiedCount,
            matchedCount: result.matchedCount
        });
    } catch (error) {
        console.error('Error marking notifications as read:', error);
        res.status(500).json({ error: 'Failed to mark notifications as read' });
    }
});

// Mark all notifications as read
router.put('/read-all', readNotificationLimiter, async (req, res) => {
    try {
        const result = await Notification.updateMany(
            { 'recipients.user': { $ne: req.user._id } },
            {
                $addToSet: {
                    recipients: {
                        user: req.user._id,
                        readAt: new Date()
                    }
                }
            }
        );
        
        res.json({ 
            success: true,
            modifiedCount: result.modifiedCount,
            matchedCount: result.matchedCount
        });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ error: 'Failed to mark all notifications as read' });
    }
});

// Mark all course notifications as read
router.put('/course/:courseId/read-all', readNotificationLimiter, async (req, res) => {
    try {
        const { courseId } = req.params;
        
        const result = await Notification.updateMany(
            {
                $or: [
                    { courseId: courseId },
                    { type: 'global' }
                ],
                'recipients.user': { $ne: req.user._id }
            },
            {
                $addToSet: {
                    recipients: {
                        user: req.user._id,
                        readAt: new Date()
                    }
                }
            }
        );
        
        res.json({ 
            success: true,
            modifiedCount: result.modifiedCount,
            matchedCount: result.matchedCount
        });
    } catch (error) {
        console.error('Error marking course notifications as read:', error);
        res.status(500).json({ error: 'Failed to mark course notifications as read' });
    }
});

// Delete notification (admin only or creator)
router.delete('/:id', async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id);
        
        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        // Only allow admins or the creator to delete
        if (req.user.role !== 'admin' && notification.createdBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Not authorized to delete this notification' });
        }

        await Notification.findByIdAndDelete(req.params.id);
        res.json({ message: 'Notification deleted successfully' });
    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({ error: 'Failed to delete notification' });
    }
});

// Get notification statistics (admin only)
router.get('/stats', async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const stats = await Notification.aggregate([
            {
                $group: {
                    _id: '$type',
                    count: { $sum: 1 },
                    unread: {
                        $sum: {
                            $cond: [
                                { $eq: [{ $size: '$recipients' }, 0] },
                                1,
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        const totalNotifications = await Notification.countDocuments();
        const totalUnread = await Notification.countDocuments({
            recipients: { $size: 0 }
        });

        res.json({
            total: totalNotifications,
            totalUnread,
            byType: stats
        });
    } catch (error) {
        console.error('Error fetching notification stats:', error);
        res.status(500).json({ error: 'Failed to fetch notification statistics' });
    }
});

// Debug endpoint to check current user auth status
router.get('/debug/auth-status', async (req, res) => {
    try {
        res.json({
            authenticated: true,
            user: {
                id: req.user._id,
                email: req.user.email,
                role: req.user.role,
                name: req.user.name
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get auth status' });
    }
});

module.exports = router;