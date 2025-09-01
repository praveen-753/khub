const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    currentModule: {
        type: mongoose.Schema.Types.ObjectId
    },
    currentTopic: {
        type: mongoose.Schema.Types.ObjectId
    },
    completedTopics: [{
        type: mongoose.Schema.Types.ObjectId
    }],
    completionPercentage: {
        type: Number,
        default: 0
    },
    lastAccessedAt: {
        type: Date,
        default: Date.now
    }
});

const enrollmentSchema = new mongoose.Schema({
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true
    },
    totalTopics: {
        type: Number,
        required: true,
        min: 0
    },
    enrollments: [progressSchema],
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index to ensure a user can only enroll once in a course
enrollmentSchema.index({ courseId: 1, userId: 1 }, { unique: true });

// Update timestamps
enrollmentSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('Enrollment', enrollmentSchema);