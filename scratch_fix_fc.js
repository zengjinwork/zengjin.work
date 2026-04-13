import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetFile = path.join(__dirname, 'api', '_fc.js');
let content = fs.readFileSync(targetFile, 'utf8');

// Replace table names
content = content.replace(/game_/g, 'fc_');
content = content.replace(/FROM game /g, 'FROM fc ');
content = content.replace(/FROM game\b/g, 'FROM fc');
content = content.replace(/UPDATE game /g, 'UPDATE fc ');
content = content.replace(/INSERT INTO game /g, 'INSERT INTO fc ');
content = content.replace(/INTO game \(/g, 'INTO fc (');

// Replace column names
content = content.replace(/\"gameId\"/g, '"fcId"');
content = content.replace(/r\.gameId/g, 'r.fcId');
content = content.replace(/\.gameId/g, '.fcId');
content = content.replace(/gameId:/g, 'fcId:');

// Handle manual IDs and RETURNING fixes
content = content.replace(/INSERT INTO fc \((.*?)\)[\s\S]*?VALUES \((.*?)\) RETURNING id/g, (match, p1, p2) => {
    if (match.includes('id,')) return match; // Already replaced
    return `INSERT INTO fc (id, ${p1}) VALUES ($1, ${p2.replace(/\$(\d+)/g, (m, d) => `$${parseInt(d)+1}`)})`;
});
content = content.replace(/RETURNING id/g, ''); // Clear any remaining returning defaults

fs.writeFileSync(targetFile, content);
console.log("Replaced successfully!");
