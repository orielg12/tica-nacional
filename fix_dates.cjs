const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        const dirPath = path.join(dir, f);
        const isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

walkDir('./src', (filePath) => {
    if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
        let content = fs.readFileSync(filePath, 'utf8');
        let original = content;

        // Reemplazar patron común de toISOString().split('T')[0]
        content = content.replace(/new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]/g, "getLocalISODate()");
        
        // Excepción extra de variables como today.toISOString()
        content = content.replace(/today\.toISOString\(\)\.split\('T'\)\[0\]/g, "getLocalISODate(today)");
        content = content.replace(/sevenDaysAgo\.toISOString\(\)\.split\('T'\)\[0\]/g, "getLocalISODate(sevenDaysAgo)");
        content = content.replace(/d\.toISOString\(\)\.split\('T'\)\[0\]/g, "getLocalISODate(d)");

        if (content !== original) {
            // Include import if missing
            const importStmt = "import { getLocalISODate } from '../../utils/dateUtils';";
            // Need to handle paths like '../utils/' or '../../utils/' depending on depth
            // A simple hack is to use absolute-like paths or calculate depth
            
            const depth = filePath.split(path.sep).length - 2; // src/ es 1, si es src/pages/algo es 3, depth 1 = '../', depth 2 = '../../'
            let importPath = depth === 0 ? './utils/dateUtils' : '../'.repeat(depth) + 'utils/dateUtils';
            // Exception for src/hooks/ = depth 1 
            // src/pages/vendor/ = depth 2
            
            const actualImport = `import { getLocalISODate } from '${importPath}';\n`;
            if (!content.includes('getLocalISODate')) {
               content = actualImport + content;
            } else if (!content.includes('import { getLocalISODate }')) {
               content = actualImport + content;
            }

            fs.writeFileSync(filePath, content, 'utf8');
            console.log("Updated: " + filePath);
        }
    }
});
