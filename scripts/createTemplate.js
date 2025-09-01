const XLSX = require('xlsx');

// Create sample data
const sampleData = [
    {
        name: 'John Doe',
        username: 'johndoe',
        email: 'john.doe@example.com',
        teamNumber: 'Team01',
        batchYear: '2023'
    }
];

// Create workbook and worksheet
const workbook = XLSX.utils.book_new();
const worksheet = XLSX.utils.json_to_sheet(sampleData);

// Add worksheet to workbook
XLSX.utils.book_append_sheet(workbook, worksheet, 'Users');

// Write to file
XLSX.writeFile(workbook, './uploads/user_template.xlsx');