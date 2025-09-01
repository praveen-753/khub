const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Register
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, fullName } = req.body;

        // Debug logging
        console.log('📝 Registration attempt:', { username, email, fullName, passwordLength: password?.length });

        // Validate required fields
        if (!username || !email || !password || !fullName) {
            console.log('❌ Missing required fields');
            return res.status(400).json({
                error: 'All fields (username, email, password, fullName) are required'
            });
        }

        // Check database connection and existing users
        console.log('🔍 Checking database for existing users...');
        console.log('🔗 MongoDB connection state:', require('mongoose').connection.readyState);
        console.log('📊 Database name:', require('mongoose').connection.name);
        
        // Count total users in database
        const totalUsers = await User.countDocuments();
        console.log('👥 Total users in database:', totalUsers);
        
        // Check if user exists
        const existingUser = await User.findOne({
            $or: [{ email }, { username }]
        });

        if (existingUser) {
            console.log('❌ User already exists:', existingUser.email === email ? 'email' : 'username');
            console.log('📋 Existing user details:', {
                id: existingUser._id,
                email: existingUser.email,
                username: existingUser.username,
                createdAt: existingUser.createdAt
            });
            return res.status(400).json({
                error: 'User with this email or username already exists'
            });
        }
        
        console.log('✅ No existing user found, proceeding with registration...');

        // Create new user - force role to be 'other' for all new registrations
        const user = new User({
            username,
            email,
            password,
            fullName,
            role: 'other' // Force role to be 'other' for all new registrations
        });

        await user.save();

        console.log('✅ User created successfully:', user.email);

        // Generate JWT token
        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                fullName: user.fullName,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        
        // Handle mongoose validation errors
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(e => e.message);
            console.log('❌ Validation errors:', messages);
            return res.status(400).json({
                error: `Validation failed: ${messages.join(', ')}`
            });
        }
        
        // Handle duplicate key errors
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            console.log('❌ Duplicate key error:', field);
            return res.status(400).json({
                error: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`
            });
        }
        
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                fullName: user.fullName,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ user });
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const { fullName, email, username } = req.body;

        // Check if email/username is taken by another user
        const existingUser = await User.findOne({
            $and: [
                { _id: { $ne: req.user._id } },
                { $or: [{ email }, { username }] }
            ]
        });

        if (existingUser) {
            return res.status(400).json({
                error: `${existingUser.email === email ? 'Email' : 'Username'} is already taken`
            });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update fields
        user.fullName = fullName || user.fullName;
        user.email = email || user.email;
        user.username = username || user.username;

        await user.save();

        res.json({
            message: 'Profile updated successfully',
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                teamNumber: user.teamNumber,
                batchYear: user.batchYear
            }
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

module.exports = router;
