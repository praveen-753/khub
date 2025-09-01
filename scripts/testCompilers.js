#!/usr/bin/env node

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Testing Compiler Availability on Render...\n');

const compilers = [
    { name: 'Python', command: 'python3 --version' },
    { name: 'Node.js', command: 'node --version' },
    { name: 'GCC (C)', command: 'gcc --version' },
    { name: 'G++ (C++)', command: 'g++ --version' },
    { name: 'Java', command: 'java --version' }
];

function testCompiler(compiler) {
    return new Promise((resolve) => {
        exec(compiler.command, (error, stdout, stderr) => {
            if (error) {
                console.log(`❌ ${compiler.name}: NOT AVAILABLE`);
                resolve(false);
            } else {
                const version = stdout.split('\n')[0] || stderr.split('\n')[0];
                console.log(`✅ ${compiler.name}: ${version}`);
                resolve(true);
            }
        });
    });
}

async function testAllCompilers() {
    console.log('Environment:', process.env.NODE_ENV || 'development');
    console.log('Platform:', process.platform);
    console.log('Architecture:', process.arch);
    console.log('='.repeat(50));
    
    const results = {};
    
    for (const compiler of compilers) {
        results[compiler.name] = await testCompiler(compiler);
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 SUMMARY:');
    
    const available = Object.entries(results).filter(([_, isAvailable]) => isAvailable);
    const unavailable = Object.entries(results).filter(([_, isAvailable]) => !isAvailable);
    
    console.log(`✅ Available (${available.length}): ${available.map(([name]) => name).join(', ')}`);
    if (unavailable.length > 0) {
        console.log(`❌ Unavailable (${unavailable.length}): ${unavailable.map(([name]) => name).join(', ')}`);
    }
    
    // Test temp directory creation
    const tempDir = path.join(__dirname, '../temp');
    try {
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        console.log('✅ Temp directory: Working');
        
        // Test file write/read
        const testFile = path.join(tempDir, 'test.txt');
        fs.writeFileSync(testFile, 'Hello Render!');
        const content = fs.readFileSync(testFile, 'utf8');
        fs.unlinkSync(testFile);
        console.log('✅ File operations: Working');
        
    } catch (error) {
        console.log('❌ File system:', error.message);
    }
}

if (require.main === module) {
    testAllCompilers().catch(console.error);
}

module.exports = testAllCompilers;