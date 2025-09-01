const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
    questionId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    selectedOptions: [{
        type: mongoose.Schema.Types.ObjectId
    }],
    isCorrect: {
        type: Boolean,
        default: false
    },
    pointsEarned: {
        type: Number,
        default: 0
    }
});

const quizAttemptSchema = new mongoose.Schema({
    quizId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quiz',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    answers: [answerSchema],
    score: {
        type: Number,
        default: 0
    },
    percentage: {
        type: Number,
        default: 0
    },
    timeSpent: {
        type: Number, // in seconds
        default: 0
    },
    isPassed: {
        type: Boolean,
        default: false
    },
    startedAt: {
        type: Date,
        default: Date.now
    },
    submittedAt: {
        type: Date
    },
    attemptNumber: {
        type: Number,
        required: true
    }
});

// Calculate score and percentage before saving
quizAttemptSchema.pre('save', function(next) {
    const totalPoints = this.answers.reduce((total, answer) => total + answer.pointsEarned, 0);
    this.score = totalPoints;
    
    // We'll need to populate quiz to get total points for percentage calculation
    // This will be handled in the route logic
    next();
});

// Ensure unique attempts per user per quiz
quizAttemptSchema.index({ quizId: 1, userId: 1, attemptNumber: 1 }, { unique: true });

module.exports = mongoose.model('QuizAttempt', quizAttemptSchema);