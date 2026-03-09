// ═══════════════════════════════════════════════════════════════
// BOT COMMAND: update.js
// Place in: src/Commands/Owner/update.js
// ═══════════════════════════════════════════════════════════════

const axios = require('axios');

module.exports = {
    name: "update",
    alias: ["upgrade", "checkupdate"],
    category: "owner",
    desc: "Check for bot updates from CRYSNOVA platform",
    
    execute: async (sock, m, { reply, isOwner }) => {
        
        if (!isOwner) {
            return reply('⚉ _*Owner only!*_');
        }
        
        try {
            await reply('✪ _*Checking for updates...*_');
            
            // Get current version
            const packageJson = require('../../../package.json');
            const currentVersion = packageJson.version || '1.0.0';
            
            // Check GitHub for latest version
            const response = await axios.get('https://api.github.com/repos/crysnovax/CRYSNOVA_AI/releases/latest');
            const latestVersion = response.data.tag_name.replace('v', '');
            const changelog = response.data.body || 'No changelog available';
            
            let msg = `╭─❍ *UPDATE CHECK* 🔄
│
│ 📦 Current: v${currentVersion}
│ 🆕 Latest: v${latestVersion}
│
`;
            
            if (latestVersion > currentVersion) {
                msg += `│ ✦ Update available!
│
│ 📝 Changelog:
│ ${changelog.substring(0, 200)}${changelog.length > 200 ? '...' : ''}
│
│ 🚀 To update, run:
│ .updatebot
`;
            } else {
                msg += `│ ✓ *You're up to date!*
│ 🎉 _Running latest version!_
`;
            }
            
            msg += `│
╰────────────────`;
            
            await reply(msg);
            
        } catch (error) {
            await reply(`✘ Error checking updates!

Error: ${error.message}

💡 Try again later or check manually at:
https://github.com/crysnovax/CRYSNOVA_AI`);
        }
    }
};
