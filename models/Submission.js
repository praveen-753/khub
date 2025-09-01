const mongoose = require('mongoose');

const testCaseResultSchema = new mongoose.Schema({
    testCaseId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    status: {
        type: String,
        enum: ['passed', 'failed', 'runtime_error', 'time_limit_exceeded', 'memory_limit_exceeded'],
        required: true
    },
    executionTime: {
        type: Number, // in milliseconds
        default: 0
    },
    memoryUsed: {
        type: Number, // in KB
        default: 0
    },
    output: {
        type: String,
        default: ''
    },
    error: {
        type: String,
        default: ''
    },
    marksAwarded: {
        type: Number,
        default: 0
    },
    maxMarks: {
        type: Number,
        default: 0
    },
    isHidden: {
        type: Boolean,
        default: false
    }
});

const submissionSchema = new mongoose.Schema({
    contestId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Contest',
        required: true
    },
    questionId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    code: {
        type: String,
        required: true
    },
    language: {
        type: String,
        enum: ['c', 'cpp', 'java', 'python', 'javascript'],
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'running', 'completed', 'error'],
        default: 'pending'
    },
    testCaseResults: [testCaseResultSchema],
    totalMarks: {
        type: Number,
        default: 0
    },
    marksAwarded: {
        type: Number,
        default: 0
    },
    scorePercentage: {
        type: Number,
        default: 0
    },
    maxMarks: {
        type: Number,
        default: 0
    },
    passedTestCases: {
        type: Number,
        default: 0
    },
    totalTestCases: {
        type: Number,
        default: 0
    },
    executionTime: {
        type: Number,
        default: 0
    },
    memoryUsed: {
        type: Number,
        default: 0
    },
    submittedAt: {
        type: Date,
        default: Date.now
    },
    compilationError: {
        type: String,
        default: ''
    }
});

// Calculate total marks and passed test cases
submissionSchema.pre('save', function(next) {
    this.totalMarks = this.testCaseResults.reduce((total, result) => total + result.marksAwarded, 0);
    this.passedTestCases = this.testCaseResults.filter(result => result.status === 'passed').length;
    this.totalTestCases = this.testCaseResults.length;
    next();
});

module.exports = mongoose.model('Submission', submissionSchema);
