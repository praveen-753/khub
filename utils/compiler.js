const path = require('path');
const fs = require('fs');
const os = require('os');

const initTempDirectory = () => {
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
        console.log('📁 Created temp directory:', tempDir);
    }
};

const getCompilerSettings = () => {
    const platform = os.platform();
    const isProduction = process.env.NODE_ENV === 'production';
    const compilersDir = path.join(__dirname, '../compilers');
    
    console.log('🔧 Environment:', isProduction ? 'Production (Render)' : 'Development');
    
    // Base compiler configuration
    let compilerOptions = {
        tempPath: path.join(__dirname, '../temp'),
        compilers: {
            cpp: {
                path: process.env.GPP_PATH || 'g++',
                args: ['-o', '$output', '$input'],
                outputExt: platform === 'win32' ? '.exe' : ''
            },
            c: {
                path: process.env.GCC_PATH || 'gcc',
                args: ['-o', '$output', '$input'],
                outputExt: platform === 'win32' ? '.exe' : ''
            },
            python: {
                path: process.env.PYTHON_PATH || (platform === 'win32' ? 'python' : 'python3'),
                args: ['$input']
            },
            javascript: {
                path: process.env.NODE_PATH || 'node',
                args: ['$input']
            }
        }
    };

    // Only check for custom compilers in development
    if (!isProduction && fs.existsSync(compilersDir)) {
        console.log('🔍 Development mode: Checking for custom compilers...');
        
        // Check for custom Python installation
        const pythonDirs = fs.readdirSync(compilersDir).filter(dir => 
            dir.startsWith('Python-') && fs.statSync(path.join(compilersDir, dir)).isDirectory()
        );
        
        if (pythonDirs.length > 0) {
            const pythonDir = pythonDirs[0];
            const pythonPath = path.join(compilersDir, pythonDir, 'python');
            if (fs.existsSync(pythonPath)) {
                compilerOptions.compilers.python.path = pythonPath;
                console.log('🐍 Using custom Python:', pythonPath);
            }
        }
    } else if (isProduction) {
        console.log('🚀 Production mode: Using system compilers');
        console.log('   Python:', compilerOptions.compilers.python.path);
        console.log('   Node.js:', compilerOptions.compilers.javascript.path);
        console.log('   GCC:', compilerOptions.compilers.c.path);
        console.log('   G++:', compilerOptions.compilers.cpp.path);
    }
    
    return compilerOptions;
};

module.exports = {
    initTempDirectory,
    getCompilerSettings
};