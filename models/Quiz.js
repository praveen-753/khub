const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema({
    text: {
        type: String,
        required: true
    },
    isCorrect: {
        type: Boolean,
        default: false
    }
});

const questionSchema = new mongoose.Schema({
    questionText: {
        type: String,
        required: true
    },
    questionType: {
        type: String,
        enum: ['mcq', 'msq'], // mcq = multiple choice (single), msq = multiple select (multiple)
        required: true
    },
    options: [optionSchema],
    explanation: {
        type: String,
        default: ''
    },
    points: {
        type: Number,
        default: 1,
        min: 1
    }
});

const quizSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: ''
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
    questions: [questionSchema],
    settings: {
        timeLimit: {
            type: Number, // in minutes, 0 means no time limit
            default: 0
        },
        allowMultipleAttempts: {
            type: Boolean,
            default: true
        },
        maxAttempts: {
            type: Number,
            default: 3
        },
        showResults: {
            type: Boolean,
            default: true
        },
        showCorrectAnswers: {
            type: Boolean,
            default: true
        },
        shuffleQuestions: {
            type: Boolean,
            default: false
        },
        shuffleOptions: {
            type: Boolean,
            default: false
        },
        passingScore: {
            type: Number,
            default: 60,
            min: 0,
            max: 100
        }
    },
    totalPoints: {
        type: Number,
        default: 0
    },
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

// Calculate total points before saving
quizSchema.pre('save', function(next) {
    this.totalPoints = this.questions.reduce((total, question) => total + question.points, 0);
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('Quiz', quizSchema);