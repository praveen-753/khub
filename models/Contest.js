const mongoose = require('mongoose');

const testCaseSchema = new mongoose.Schema({
    input: {
        type: String,
        required: true
    },
    expectedOutput: {
        type: String,
        required: true
    },
    marks: {
        type: Number,
        required: true,
        min: 0
    },
    isHidden: {
        type: Boolean,
        default: false
    }
});

const questionSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    difficulty: {
        type: String,
        enum: ['Easy', 'Medium', 'Hard'],
        required: true
    },
    constraints: {
        type: String,
        default: ''
    },
    inputFormat: {
        type: String,
        required: true
    },
    outputFormat: {
        type: String,
        required: true
    },
    sampleInput: {
        type: String,
        required: true
    },
    sampleOutput: {
        type: String,
        required: true
    },
    testCases: [testCaseSchema],
    timeLimit: {
        type: Number,
        default: 2000, // milliseconds
        min: 1000,
        max: 10000
    },
    memoryLimit: {
        type: Number,
        default: 256, // MB
        min: 128,
        max: 512
    },
    totalMarks: {
        type: Number,
        default: 0
    }
});

const contestSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    startTime: {
        type: Date,
        required: true
    },
    endTime: {
        type: Date,
        required: true
    },
    duration: {
        type: Number, // in minutes
        required: true
    },
    questions: [questionSchema],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    allowedLanguages: [{
        type: String,
        enum: ['c', 'cpp', 'java', 'python', 'javascript'],
        default: ['c', 'cpp', 'java', 'python']
    }],
    maxAttempts: {
        type: Number,
        default: 1,
        min: 1
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Calculate total marks for each question
questionSchema.pre('save', function(next) {
    this.totalMarks = this.testCases.reduce((total, testCase) => total + testCase.marks, 0);
    next();
});

module.exports = mongoose.model('Contest', contestSchema);
