const fs = require('fs-extra');
const path = require('path');
const os = require('os');

// Set up temp directory path
const tempPath = path.join(__dirname, '..', 'temp');

// Ensure the temp directory exists
function initTempDirectory() {
    if (!fs.existsSync(tempPath)) {
        fs.mkdirSync(tempPath, { recursive: true });
    }
    // Clean any existing files
    fs.emptyDirSync(tempPath);
}

// Get OS-specific settings
function getCompilerSettings() {
    const isWindows = os.platform() === 'win32';
    
    return {
        stats: true,
        timeout: 10000,
        compilers: {
            python: {
                path: isWindows ? 'python' : 'python3',
                compile: false,
                execute: isWindows ? 'python' : 'python3',
                executionArgs: ['-u'],  // Unbuffered output
                env: {
                    PYTHONIOENCODING: 'utf-8',
                    PYTHONUNBUFFERED: '1'
                }
            }
        }
    };
}

module.exports = {
    tempPath,
    initTempDirectory,
    getCompilerSettings
};