// ═══════════════════════════════════════════════════════════════
// BOT COMMAND: plugin.js
// Place in: src/Commands/Owner/plugin.js
// ═══════════════════════════════════════════════════════════════

const axios = require('axios');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: "plugin",
    alias: ["install", "addplugin"],
    category: "owner",
    desc: "Install plugins from CRYSNOVA marketplace",
    
    execute: async (sock, m, { args, reply, isOwner }) => {
        
        if (!isOwner) {
            return reply('✘ Owner only command!');
        }
        
        if (!args[0]) {
            return reply(`╭─❍ *PLUGIN SYSTEM* 🔌
│
│ Install plugins instantly!
│
│ Usage:
│ .plugin <url>
│
│ Example:
│ .plugin https://crysnova.ai/plugin/bash
│
│ Browse plugins:
│ https://crysnova.ai/plugins
│
╰────────────────`);
        }
        
        const url = args[0];
        
        try {
            await reply('✪ Installing plugin...');
            
            // Fetch plugin data
            const response = await axios.get(url);
            const pluginData = response.data;
            
            if (!pluginData.success || !pluginData.plugin) {
                return reply('✘ Invalid plugin URL or plugin not found!');
            }
            
            const plugin = pluginData.plugin;
            
            // Determine installation path
            const categoryPath = path.join(
                __dirname,
                '..',
                plugin.category || 'General'
            );
            
            // Create directory if doesn't exist
            if (!fs.existsSync(categoryPath)) {
                fs.mkdirSync(categoryPath, { recursive: true });
            }
            
            // Create plugin file
            const pluginFileName = `${plugin.id}.js`;
            const pluginFilePath = path.join(categoryPath, pluginFileName);
            
            // Write plugin code
            fs.writeFileSync(pluginFilePath, plugin.code);
            
            let msg = `╭─❍ *PLUGIN INSTALLED* ✅
│
│ 📦 Name: ${plugin.name}
│ 📁 Category: ${plugin.category}
│ 👤 Author: ${plugin.author}
│ 📌 Version: ${plugin.version}
│
│ 💾 Installed to:
│ ${pluginFilePath}
│
│ ⚠️ Restart bot to activate!
│
╰────────────────`;
            
            await reply(msg);
            
        } catch (error) {
            await reply(`✘ Installation failed!

Error: ${error.message}

💡 Make sure the URL is correct and the plugin is approved.`);
        }
    }
};
