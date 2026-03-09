#!/bin/bash

# ═══════════════════════════════════════════════════════════════
# CRYSNOVA PLATFORM - Automated Deployment Script
# Run this to deploy everything automatically
# ═══════════════════════════════════════════════════════════════

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║         🚀 CRYSNOVA PLATFORM AUTO DEPLOY 🚀                 ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if wrangler is installed
echo -e "${YELLOW}[1/7] Checking prerequisites...${NC}"
if ! command -v wrangler &> /dev/null; then
    echo -e "${YELLOW}Installing Wrangler...${NC}"
    npm install -g wrangler
fi
echo -e "${GREEN}✓ Wrangler installed${NC}"

# Login to Cloudflare
echo -e "${YELLOW}[2/7] Logging into Cloudflare...${NC}"
wrangler login
echo -e "${GREEN}✓ Logged in${NC}"

# Create KV namespace
echo -e "${YELLOW}[3/7] Creating KV namespace...${NC}"
KV_OUTPUT=$(wrangler kv:namespace create PLUGINS)
KV_ID=$(echo "$KV_OUTPUT" | grep -oP 'id = "\K[^"]+')

if [ -z "$KV_ID" ]; then
    echo -e "${RED}Failed to create KV namespace!${NC}"
    exit 1
fi

echo -e "${GREEN}✓ KV namespace created: $KV_ID${NC}"

# Update wrangler.toml
echo -e "${YELLOW}[4/7] Updating configuration...${NC}"
cd cloudflare-worker

# Create backup
cp wrangler.toml wrangler.toml.backup

# Update KV ID
sed -i "s/YOUR_KV_NAMESPACE_ID/$KV_ID/" wrangler.toml

echo -e "${GREEN}✓ Configuration updated${NC}"

# Set admin secret
echo -e "${YELLOW}[5/7] Setting admin password...${NC}"
echo -e "${CYAN}Please enter your admin password (for /admin dashboard):${NC}"
wrangler secret put ADMIN_SECRET

echo -e "${GREEN}✓ Admin password set${NC}"

# Deploy worker
echo -e "${YELLOW}[6/7] Deploying to Cloudflare...${NC}"
wrangler publish

echo -e "${GREEN}✓ Worker deployed!${NC}"

# Seed database
echo -e "${YELLOW}[7/7] Seeding database...${NC}"
cd ..

# Get worker URL
WORKER_URL=$(grep "route =" cloudflare-worker/wrangler.toml | cut -d'"' -f2 | sed 's/\/\*$//')

if [ -z "$WORKER_URL" ]; then
    WORKER_URL="https://crysnova-platform.workers.dev"
fi

# Create seed script
cat > temp-seed.js << 'EOF'
const WORKER_URL = process.argv[2];

const plugins = [
  {
    name: "Bash Shell Access",
    description: "Execute shell commands from WhatsApp with safety checks",
    category: "utility",
    author: "CRYSNOVA",
    version: "2.0.0",
    code: `const { execSync } = require('child_process');
module.exports = {
  name: "bash",
  category: "owner",
  execute: async (sock, m, { args, reply, isOwner }) => {
    if (!isOwner) return reply('❌ Owner only!');
    if (!args[0]) return reply('Usage: .bash <command>');
    try {
      const output = execSync(args.join(' '), { timeout: 30000 }).toString();
      await reply(output || '✅ Done!');
    } catch (err) {
      await reply('❌ Error: ' + err.message);
    }
  }
}`
  }
];

async function seed() {
  for (const plugin of plugins) {
    try {
      const response = await fetch(`${WORKER_URL}/api/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plugin)
      });
      
      const result = await response.json();
      console.log(`✅ Seeded: ${plugin.name}`);
    } catch (error) {
      console.error(`❌ Failed: ${plugin.name}`, error.message);
    }
  }
}

seed().then(() => process.exit(0));
EOF

node temp-seed.js "$WORKER_URL"
rm temp-seed.js

echo -e "${GREEN}✓ Database seeded${NC}"

# Success message
echo ""
echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║                 ✅ DEPLOYMENT COMPLETE! ✅                   ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${CYAN}Your platform is now live!${NC}"
echo ""
echo -e "${YELLOW}📋 Platform URLs:${NC}"
echo -e "   Homepage:    ${GREEN}https://$WORKER_URL${NC}"
echo -e "   Marketplace: ${GREEN}https://$WORKER_URL/plugins${NC}"
echo -e "   Admin Panel: ${GREEN}https://$WORKER_URL/admin${NC}"
echo -e "   Submit:      ${GREEN}https://$WORKER_URL/submit${NC}"
echo ""
echo -e "${YELLOW}🔑 Next Steps:${NC}"
echo -e "   1. Visit ${GREEN}https://$WORKER_URL/admin${NC}"
echo -e "   2. Login with your admin password"
echo -e "   3. Approve the pending plugins"
echo -e "   4. Share ${GREEN}https://$WORKER_URL/plugins${NC} with users!"
echo ""
echo -e "${CYAN}For bot integration, see docs/DEPLOYMENT.md${NC}"
echo ""
echo -e "${GREEN}🎉 Happy coding!${NC}"
