const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['general', 'course', 'announcement'],
        default: 'general'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'low'
    },
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: function() {
            return this.type === 'course';
        }
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['read', 'unread'],
        default: 'unread'
    },
    readBy: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        readAt: {
            type: Date,
            default: Date.now
        }
    }],
    recipients: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        readAt: Date
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Add pre-save middleware to update status based on recipients
notificationSchema.pre('save', function(next) {
    if (this.recipients && this.recipients.length > 0) {
        this.status = 'read';
    }
    next();
});

module.exports = mongoose.model('Notification', notificationSchema);