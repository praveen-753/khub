const mongoose = require('mongoose');

const contentSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['youtube', 'paragraph', 'code', 'output', 'syntax', 'points', 'heading', 'subheading'],
        required: true
    },
    content: {
        type: String,
        required: true
    }
});

const mainTopicSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: String,
    contents: [contentSchema],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const moduleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    mainTopics: [mainTopicSchema],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const courseSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    subtitle: String,
    description: {
        type: String,
        required: true
    },
    thumbnail: String,
    level: {
        type: String,
        enum: ['beginner', 'intermediate', 'advanced'],
        default: 'beginner'
    },
    prerequisites: [String],
    learningObjectives: [String],
    duration: String,
    modules: [moduleSchema],
    pricing: {
        isFree: { type: Boolean, default: true },
        price: { type: Number, default: 0 },
        currency: { type: String, default: 'USD' }
    },
    isPublished: { type: Boolean, default: false },
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

module.exports = mongoose.model('Course', courseSchema);