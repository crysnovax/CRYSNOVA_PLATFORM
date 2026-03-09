// ═══════════════════════════════════════════════════════════════
// BOT COMMAND: updatebot.js
// Place in: src/Commands/Owner/updatebot.js
// ═══════════════════════════════════════════════════════════════

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: "updatebot",
    alias: ["pullupdate", "gitupdate"],
    category: "owner",
    desc: "Pull latest updates from GitHub and install",
    
    execute: async (sock, m, { reply, isOwner }) => {
        
        if (!isOwner) {
            return reply('❌ Owner only!');
        }
        
        try {
            await reply('⏳ Updating bot... This may take a minute...');
            
            // Backup current config
            const configPath = path.join(process.cwd(), 'database', 'user-config.json');
            let userConfig = null;
            
            if (fs.existsSync(configPath)) {
                userConfig = fs.readFileSync(configPath, 'utf8');
                console.log('✓ Config backed up');
            }
            
            // Pull updates
            console.log('Pulling from GitHub...');
            execSync('git pull origin main', { stdio: 'inherit' });
            
            // Restore config
            if (userConfig) {
                fs.writeFileSync(configPath, userConfig);
                console.log('✓ Config restored');
            }
            
            // Install new dependencies
            console.log('Installing dependencies...');
            execSync('npm install', { stdio: 'inherit' });
            
            await reply(`✅ *UPDATE COMPLETE!*

📦 Bot updated successfully!
🔄 New features and fixes installed!

⚠️ *IMPORTANT: Restart required!*

Restart methods:
• Panel: Restart from dashboard
• PM2: \`pm2 restart crysnova\`
• Manual: Stop and start bot again

After restart, check version:
.ping`);
            
        } catch (error) {
            await reply(`❌ Update failed!

Error: ${error.message}

💡 Try manual update:
1. Stop the bot
2. Run: git pull
3. Run: npm install
4. Start the bot

Or contact support if the issue persists.`);
        }
    }
};
