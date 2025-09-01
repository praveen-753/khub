const express = require('express');
const compilex = require('compilex');
const Contest = require('../models/Contest');
const Submission = require('../models/Submission');
const { authenticateToken } = require('../middleware/auth');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const router = express.Router();

// Apply authentication middleware to most routes
// router.use(authenticateToken);

// Debug middleware
router.use((req, res, next) => {
    console.log(`📨 Submissions route: ${req.method} ${req.path}`);
    console.log('Headers:', req.headers);
    next();
});

// Run code for testing (without submitting) - temporarily no auth for debugging
router.post('/run', async (req, res) => {
    console.log('🔄 /run endpoint hit');
    try {
        const { contestId, questionId, code, language, input } = req.body;

        // Validate inputs
        if (!code || !language) {
            return res.status(400).json({ error: 'Code and language are required' });
        }

        let testResults = [];

        // If contestId and questionId are provided, run against sample test cases
        if (contestId && questionId) {
            const contest = await Contest.findById(contestId);
            if (!contest) {
                return res.status(404).json({ error: 'Contest not found' });
            }

            const question = contest.questions.id(questionId);
            if (!question) {
                return res.status(404).json({ error: 'Question not found' });
            }

            // Run only visible/sample test cases for testing
            const visibleTestCases = question.testCases.filter(tc => !tc.isHidden);
            
            for (const testCase of visibleTestCases) {
                try {
                    const result = await executeCode(code, language, testCase.input, question.timeLimit);
                    
                    const isCorrect = result.status === 'success' && 
                                     result.output.trim() === testCase.expectedOutput.trim();
                    
                    testResults.push({
                        input: testCase.input,
                        expectedOutput: testCase.expectedOutput,
                        actualOutput: result.output || '',
                        status: result.status,
                        error: result.error || '',
                        executionTime: result.executionTime || 0,
                        isCorrect,
                        marks: isCorrect ? testCase.marks : 0
                    });
                } catch (error) {
                    testResults.push({
                        input: testCase.input,
                        expectedOutput: testCase.expectedOutput,
                        actualOutput: '',
                        status: 'error',
                        error: error.message,
                        executionTime: 0,
                        isCorrect: false,
                        marks: 0
                    });
                }
            }

            res.json({
                success: true,
                testResults,
                totalVisible: visibleTestCases.length,
                passedVisible: testResults.filter(r => r.isCorrect).length
            });
        } else {
            // Run with custom input if no contest/question specified
            const result = await executeCode(code, language, input || '', 10000);
            
            res.json({
                success: true,
                result: {
                    status: result.status,
                    output: result.output,
                    error: result.error,
                    executionTime: result.executionTime
                }
            });
        }

    } catch (error) {
        console.error('Code run error:', error);
        res.status(500).json({ error: 'Failed to run code' });
    }
});

// Submit code for evaluation
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { contestId, questionId, code, language } = req.body;

        // Validate inputs
        if (!contestId || !questionId || !code || !language) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        // Get contest and question
        const contest = await Contest.findById(contestId);
        if (!contest) {
            return res.status(404).json({ error: 'Contest not found' });
        }

        const question = contest.questions.id(questionId);
        if (!question) {
            return res.status(404).json({ error: 'Question not found' });
        }

        // Check if contest is active and accessible
        const now = new Date();
        if (!contest.isActive || contest.endTime < now) {
            return res.status(403).json({ error: 'Contest is not accessible' });
        }

        if (contest.startTime > now) {
            return res.status(403).json({ error: 'Contest has not started yet' });
        }

        // Check if language is allowed
        if (!contest.allowedLanguages.includes(language)) {
            return res.status(400).json({ error: 'Programming language not allowed for this contest' });
        }

        // Check submission limits
        const existingSubmissions = await Submission.countDocuments({
            contestId,
            questionId,
            userId: req.user._id
        });

        if (existingSubmissions >= contest.maxAttempts) {
            return res.status(403).json({ error: 'Maximum submission attempts reached' });
        }

        // Create submission record
        const submission = new Submission({
            contestId,
            questionId,
            userId: req.user._id,
            code,
            language,
            status: 'pending',
            maxMarks: question.totalMarks
        });

        await submission.save();

        // Process submission synchronously to return results immediately
        try {
            await processSubmission(submission._id, question, code, language);
            
            // Fetch updated submission with results
            const updatedSubmission = await Submission.findById(submission._id);
            
            res.status(201).json({
                message: 'Code submitted successfully',
                submissionId: submission._id,
                status: updatedSubmission.status,
                submission: {
                    id: updatedSubmission._id,
                    marks: updatedSubmission.marksAwarded,
                    totalMarks: updatedSubmission.totalMarks,
                    scorePercentage: updatedSubmission.scorePercentage,
                    testResults: updatedSubmission.testCaseResults,
                    submittedAt: updatedSubmission.submittedAt,
                    executionTime: updatedSubmission.executionTime,
                    status: updatedSubmission.status
                }
            });
        } catch (processingError) {
            console.error('Submission processing failed:', processingError);
            res.status(201).json({
                message: 'Code submitted but processing failed',
                submissionId: submission._id,
                status: 'error',
                error: processingError.message
            });
        }

    } catch (error) {
        console.error('Submission error:', error);
        res.status(500).json({ error: 'Failed to submit code' });
    }
});

// Get submission result
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const submission = await Submission.findById(req.params.id);

        if (!submission) {
            return res.status(404).json({ error: 'Submission not found' });
        }

        // Check if user owns this submission
        if (submission.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json({ submission });
    } catch (error) {
        console.error('Error fetching submission:', error);
        res.status(500).json({ error: 'Failed to fetch submission' });
    }
});

// Get user's submissions for a contest
router.get('/contest/:contestId/user', authenticateToken, async (req, res) => {
    try {
        const submissions = await Submission.find({
            contestId: req.params.contestId,
            userId: req.user._id
        }).sort({ submittedAt: -1 });

        res.json({ submissions });
    } catch (error) {
        console.error('Error fetching user submissions:', error);
        res.status(500).json({ error: 'Failed to fetch submissions' });
    }
});

// Get user's submissions for a specific question
router.get('/contest/:contestId/question/:questionId/user', authenticateToken, async (req, res) => {
    try {
        const submissions = await Submission.find({
            contestId: req.params.contestId,
            questionId: req.params.questionId,
            userId: req.user._id
        }).sort({ submittedAt: -1 });

        res.json({ submissions });
    } catch (error) {
        console.error('Error fetching question submissions:', error);
        res.status(500).json({ error: 'Failed to fetch submissions' });
    }
});

// Process submission function
async function processSubmission(submissionId, question, code, language) {
    try {
        const submission = await Submission.findById(submissionId);
        if (!submission) return;

        submission.status = 'running';
        await submission.save();

        const testCaseResults = [];
        let totalExecutionTime = 0;
        let totalMemoryUsed = 0;
        let totalMarks = 0;
        let obtainedMarks = 0;

        // Run code against ALL test cases (including hidden ones for final submission)
        for (const testCase of question.testCases) {
            try {
                console.log('\n=== Processing Test Case ===');
                console.log('Test Case ID:', testCase._id);
                console.log('Input:', testCase.input);
                console.log('Expected Output:', testCase.expectedOutput);
                console.log('Input Type:', typeof testCase.input);
                console.log('Is Hidden:', testCase.isHidden);
                console.log('Marks:', testCase.marks);
                
                const result = await executeCode(code, language, testCase.input, question.timeLimit);
                
                console.log('Execution Result:', result);
                console.log('Actual Output:', result.output);
                console.log('Output Match:', result.output.trim() === testCase.expectedOutput.trim());
                
                const testCaseResult = {
                    testCaseId: testCase._id,
                    status: 'failed',
                    executionTime: result.executionTime || 0,
                    memoryUsed: result.memoryUsed || 0,
                    output: result.output || '',
                    error: result.error || '',
                    marksAwarded: 0,
                    maxMarks: testCase.marks,
                    isHidden: testCase.isHidden || false
                };

                totalMarks += testCase.marks;

                // Check if output matches expected
                if (result.status === 'success' && 
                    result.output.trim() === testCase.expectedOutput.trim()) {
                    testCaseResult.status = 'passed';
                    testCaseResult.marksAwarded = testCase.marks;
                    obtainedMarks += testCase.marks;
                    console.log('✅ TEST CASE PASSED');
                } else if (result.status === 'timeout') {
                    testCaseResult.status = 'time_limit_exceeded';
                    console.log('⏰ TIME LIMIT EXCEEDED');
                } else if (result.status === 'error') {
                    testCaseResult.status = 'runtime_error';
                    console.log('❌ RUNTIME ERROR');
                } else {
                    console.log('❌ WRONG ANSWER');
                }

                testCaseResults.push(testCaseResult);
                totalExecutionTime += result.executionTime || 0;
                totalMemoryUsed = Math.max(totalMemoryUsed, result.memoryUsed || 0);

            } catch (error) {
                console.error('❌ Test case execution error:', error);
                totalMarks += testCase.marks;
                testCaseResults.push({
                    testCaseId: testCase._id,
                    status: 'runtime_error',
                    executionTime: 0,
                    memoryUsed: 0,
                    output: '',
                    error: error.message,
                    marksAwarded: 0,
                    maxMarks: testCase.marks,
                    isHidden: testCase.isHidden || false
                });
            }
        }

        // Calculate final score
        const scorePercentage = totalMarks > 0 ? Math.round((obtainedMarks / totalMarks) * 100) : 0;

        console.log('\n=== FINAL SUBMISSION RESULTS ===');
        console.log('Total Marks:', totalMarks);
        console.log('Obtained Marks:', obtainedMarks);
        console.log('Score Percentage:', scorePercentage + '%');
        console.log('Total Test Cases:', testCaseResults.length);
        console.log('Passed Test Cases:', testCaseResults.filter(r => r.status === 'passed').length);
        console.log('Test Case Results:', JSON.stringify(testCaseResults, null, 2));

        // Update submission with results
        submission.testCaseResults = testCaseResults;
        submission.executionTime = totalExecutionTime;
        submission.memoryUsed = totalMemoryUsed;
        submission.status = 'completed';
        submission.marksAwarded = obtainedMarks;
        submission.totalMarks = totalMarks;
        submission.scorePercentage = scorePercentage;
        
        await submission.save();

        console.log('✅ Submission saved successfully with ID:', submission._id);

    } catch (error) {
        console.error('Submission processing error:', error);
        
        // Update submission with error status
        const submission = await Submission.findById(submissionId);
        if (submission) {
            submission.status = 'error';
            submission.compilationError = error.message;
            await submission.save();
        }
    }
}

// Execute code function
function executeCode(code, language, input, timeLimit) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        
        console.log('\n🔄 EXECUTING CODE:');
        console.log('Language:', language);
        console.log('Input:', JSON.stringify(input));
        console.log('Input Length:', input ? input.length : 0);
        console.log('Time Limit:', timeLimit);
        console.log('Code Preview:', code.substring(0, 100) + '...');

        if (language === 'python') {
            console.log('🐍 Python execution with input:', JSON.stringify(input));
            const inputStr = String(input || '').trim();
            
            // For Python execution - prepare code with input handling
            const pythonCode = `
# Simulated input
input_lines = ${JSON.stringify(inputStr.split('\n'))}
input_index = 0

def input():
    global input_index
    if input_index < len(input_lines):
        line = input_lines[input_index]
        input_index += 1
        return line
    return ""

${code}`;

            // Use compilex with OS-specific configuration
            compilex.compilePython(
                { OS: process.platform === 'win32' ? 'windows' : 'linux' },
                pythonCode,
                function(data) {
                    const executionTime = Date.now() - startTime;
                    console.log('🐍 Python execution result:', data);
                    
                    if (data.error) {
                        console.log('❌ Python execution failed');
                        resolve({
                            status: 'error',
                            error: data.error,
                            executionTime,
                            memoryUsed: 0,
                            output: data.output || ''
                        });
                    } else if (executionTime > timeLimit) {
                        console.log('⏰ Python execution timeout');
                        resolve({
                            status: 'timeout',
                            error: 'Time limit exceeded',
                            executionTime,
                            memoryUsed: 0,
                            output: data.output || ''
                        });
                    } else {
                        console.log('✅ Python execution successful');
                        resolve({
                            status: 'success',
                            error: '',
                            executionTime,
                            memoryUsed: 0,
                            output: data.output || ''
                        });
                    }
                }
            );
        } else {
            // For other languages, use existing compilex setup
            const compilexLang = {
                'c': 'C',
                'cpp': 'Cpp',
                'java': 'Java',
                'javascript': 'node'
            }[language];

            if (!compilexLang) {
                return resolve({
                    status: 'error',
                    error: 'Unsupported language',
                    executionTime: 0,
                    memoryUsed: 0,
                    output: ''
                });
            }

            const compileMethod = `compile${compilexLang}`;
            
            compilex[compileMethod](code, input, (data) => {
                const executionTime = Date.now() - startTime;
                
                if (data.error) {
                    resolve({
                        status: 'error',
                        error: data.error,
                        executionTime,
                        memoryUsed: 0,
                        output: data.output || ''
                    });
                } else if (executionTime > timeLimit) {
                    resolve({
                        status: 'timeout',
                        error: 'Time limit exceeded',
                        executionTime,
                        memoryUsed: 0,
                        output: data.output || ''
                    });
                } else {
                    resolve({
                        status: 'success',
                        error: '',
                        executionTime,
                        memoryUsed: 0,
                        output: data.output || ''
                    });
                }
            });
        }
    });
}

module.exports = router;
