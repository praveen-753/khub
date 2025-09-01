const mongoose = require('mongoose');

const taskSubmissionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    submissionLinks: [{
        title: {
            type: String,
            required: true,
            trim: true
        },
        url: {
            type: String,
            required: true,
            trim: true
        },
        type: {
            type: String,
            enum: ['github', 'drive', 'dropbox', 'onedrive', 'other'],
            default: 'other'
        },
        addedAt: {
            type: Date,
            default: Date.now
        }
    }],
    submissionText: {
        type: String,
        trim: true
    },
    submittedAt: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['submitted', 'graded', 'returned'],
        default: 'submitted'
    },
    grade: {
        score: {
            type: Number,
            min: 0,
            max: 100
        },
        feedback: String,
        gradedAt: Date,
        gradedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }
});

const taskSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true
    },
    moduleId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    taskFiles: [{
        originalName: String,
        filename: String,
        mimetype: String,
        size: Number,
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],
    instructions: {
        type: String,
        trim: true
    },
    dueDate: {
        type: Date
    },
    maxScore: {
        type: Number,
        default: 100,
        min: 0
    },
    allowedFileTypes: [{
        type: String,
        default: ['pdf', 'doc', 'docx', 'txt', 'jpg', 'jpeg', 'png', 'gif']
    }],
    maxFileSize: {
        type: Number,
        default: 10 * 1024 * 1024 // 10MB in bytes
    },
    submissions: [taskSubmissionSchema],
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt field before saving
taskSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Index for efficient queries
taskSchema.index({ courseId: 1, moduleId: 1 });
taskSchema.index({ dueDate: 1 });
taskSchema.index({ 'submissions.user': 1 });

module.exports = mongoose.model('Task', taskSchema);