const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    role: {
        type: String,
        enum: ['admin', 'khub', 'other'],
        default: 'other'
    },
    fullName: {
        type: String,
        required: true,
        trim: true
    },
    teamNumber: {
        type: String,
        required: function() {
            return this.role === 'khub';
        }
    },
    batchYear: {
        type: String,
        required: function() {
            return this.role === 'khub';
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Generate initial password
userSchema.methods.generateInitialPassword = function() {
    return `khub-${this.batchYear}`;
};

module.exports = mongoose.model('User', userSchema);
