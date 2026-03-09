// ═══════════════════════════════════════════════════════════════
// CRYSNOVA PLATFORM - Cloudflare Worker
// Complete plugin marketplace with admin validation
// ═══════════════════════════════════════════════════════════════

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE, PUT",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders })
    }

    // ═══════════════════════════════════════════════════
    // 🔐 ADMIN AUTHENTICATION
    // ═══════════════════════════════════════════════════
    
    function isAdmin(request) {
      const authHeader = request.headers.get('Authorization')
      if (!authHeader) return false
      
      const token = authHeader.replace('Bearer ', '')
      return token === env.ADMIN_SECRET
    }

    // ═══════════════════════════════════════════════════
    // 🏠 HOMEPAGE
    // ═══════════════════════════════════════════════════
    
    if (path === "/" || path === "/home") {
      return new Response(getHomepage(), {
        headers: { "content-type": "text/html", ...corsHeaders }
      })
    }

    // ═══════════════════════════════════════════════════
    // 🔌 GET APPROVED PLUGINS (PUBLIC)
    // ═══════════════════════════════════════════════════
    
    if (path === "/api/plugins") {
      try {
        const list = await env.PLUGINS.list()
        const plugins = []
        
        for (const key of list.keys) {
          if (key.name.startsWith('approved_')) {
            const data = await env.PLUGINS.get(key.name)
            if (data) {
              plugins.push(JSON.parse(data))
            }
          }
        }
        
        plugins.sort((a, b) => (b.downloads || 0) - (a.downloads || 0))
        
        return new Response(JSON.stringify({
          success: true,
          plugins: plugins,
          total: plugins.length
        }), {
          headers: { "content-type": "application/json", ...corsHeaders }
        })
        
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { "content-type": "application/json", ...corsHeaders }
        })
      }
    }

    // ═══════════════════════════════════════════════════
    // 📋 GET PENDING PLUGINS (ADMIN ONLY)
    // ═══════════════════════════════════════════════════
    
    if (path === "/api/admin/pending" && request.method === "GET") {
      if (!isAdmin(request)) {
        return new Response(JSON.stringify({
          success: false,
          error: "Unauthorized"
        }), {
          status: 401,
          headers: { "content-type": "application/json", ...corsHeaders }
        })
      }
      
      try {
        const list = await env.PLUGINS.list()
        const pending = []
        
        for (const key of list.keys) {
          if (key.name.startsWith('pending_')) {
            const data = await env.PLUGINS.get(key.name)
            if (data) {
              pending.push(JSON.parse(data))
            }
          }
        }
        
        return new Response(JSON.stringify({
          success: true,
          plugins: pending,
          total: pending.length
        }), {
          headers: { "content-type": "application/json", ...corsHeaders }
        })
        
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { "content-type": "application/json", ...corsHeaders }
        })
      }
    }

    // ═══════════════════════════════════════════════════
    // ✅ APPROVE PLUGIN (ADMIN ONLY)
    // ═══════════════════════════════════════════════════
    
    if (path === "/api/admin/approve" && request.method === "POST") {
      if (!isAdmin(request)) {
        return new Response(JSON.stringify({
          success: false,
          error: "Unauthorized"
        }), {
          status: 401,
          headers: { "content-type": "application/json", ...corsHeaders }
        })
      }
      
      try {
        const { pluginId } = await request.json()
        
        const pendingData = await env.PLUGINS.get(`pending_${pluginId}`)
        
        if (!pendingData) {
          return new Response(JSON.stringify({
            success: false,
            error: "Plugin not found"
          }), {
            status: 404,
            headers: { "content-type": "application/json", ...corsHeaders }
          })
        }
        
        const plugin = JSON.parse(pendingData)
        plugin.status = 'approved'
        plugin.approvedAt = Date.now()
        
        await env.PLUGINS.put(`approved_${pluginId}`, JSON.stringify(plugin))
        await env.PLUGINS.delete(`pending_${pluginId}`)
        
        return new Response(JSON.stringify({
          success: true,
          message: "Plugin approved!"
        }), {
          headers: { "content-type": "application/json", ...corsHeaders }
        })
        
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { "content-type": "application/json", ...corsHeaders }
        })
      }
    }

    // ═══════════════════════════════════════════════════
    // ❌ REJECT PLUGIN (ADMIN ONLY)
    // ═══════════════════════════════════════════════════
    
    if (path === "/api/admin/reject" && request.method === "POST") {
      if (!isAdmin(request)) {
        return new Response(JSON.stringify({
          success: false,
          error: "Unauthorized"
        }), {
          status: 401,
          headers: { "content-type": "application/json", ...corsHeaders }
        })
      }
      
      try {
        const { pluginId } = await request.json()
        await env.PLUGINS.delete(`pending_${pluginId}`)
        
        return new Response(JSON.stringify({
          success: true,
          message: "Plugin rejected!"
        }), {
          headers: { "content-type": "application/json", ...corsHeaders }
        })
        
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { "content-type": "application/json", ...corsHeaders }
        })
      }
    }

    // ═══════════════════════════════════════════════════
    // ✉️ SUBMIT PLUGIN (Goes to PENDING)
    // ═══════════════════════════════════════════════════
    
    if (path === "/api/submit" && request.method === "POST") {
      try {
        const body = await request.json()
        
        const { name, description, category, code, author, version } = body
        
        if (!name || !description || !code) {
          return new Response(JSON.stringify({
            success: false,
            error: "Missing required fields: name, description, code"
          }), {
            status: 400,
            headers: { "content-type": "application/json", ...corsHeaders }
          })
        }

        const pluginId = name.toLowerCase().replace(/[^a-z0-9]/g, '-')
        
        const pluginData = {
          id: pluginId,
          name: name,
          description: description,
          category: category || 'general',
          code: code,
          author: author || 'Anonymous',
          version: version || '1.0.0',
          downloads: 0,
          status: 'pending',
          createdAt: Date.now(),
          installCommand: `.plugin https://crysnova.ai/plugin/${pluginId}`
        }
        
        await env.PLUGINS.put(`pending_${pluginId}`, JSON.stringify(pluginData))
        
        return new Response(JSON.stringify({
          success: true,
          plugin: pluginData,
          message: "Plugin submitted! Pending admin approval."
        }), {
          headers: { "content-type": "application/json", ...corsHeaders }
        })
        
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { "content-type": "application/json", ...corsHeaders }
        })
      }
    }

    // ═══════════════════════════════════════════════════
    // 📦 GET APPROVED PLUGIN BY ID
    // ═══════════════════════════════════════════════════
    
    if (path.startsWith("/plugin/")) {
      const pluginId = path.split("/plugin/")[1]
      
      try {
        const plugin = await env.PLUGINS.get(`approved_${pluginId}`)
        
        if (!plugin) {
          return new Response(JSON.stringify({
            success: false,
            error: "Plugin not found or not approved"
          }), {
            status: 404,
            headers: { "content-type": "application/json", ...corsHeaders }
          })
        }
        
        const pluginData = JSON.parse(plugin)
        
        pluginData.downloads = (pluginData.downloads || 0) + 1
        await env.PLUGINS.put(`approved_${pluginId}`, JSON.stringify(pluginData))
        
        return new Response(JSON.stringify({
          success: true,
          plugin: pluginData
        }), {
          headers: { "content-type": "application/json", ...corsHeaders }
        })
        
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: { "content-type": "application/json", ...corsHeaders }
        })
      }
    }

    // ═══════════════════════════════════════════════════
    // 📖 GET COMMANDS
    // ═══════════════════════════════════════════════════
    
    if (path === "/api/commands") {
      try {
        return new Response(JSON.stringify({
          success: true,
          commands: getDefaultCommands(),
          total: getDefaultCommands().length
        }), {
          headers: { "content-type": "application/json", ...corsHeaders }
        })
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          headers: { "content-type": "application/json", ...corsHeaders }
        })
      }
    }

    // ═══════════════════════════════════════════════════
    // 📥 VPS INSTALL SCRIPT
    // ═══════════════════════════════════════════════════
    
    if (path === "/install.sh") {
      return new Response(getInstallScript(), {
        headers: { "content-type": "text/plain", ...corsHeaders }
      })
    }

    // ═══════════════════════════════════════════════════
    // 🎨 PAGES
    // ═══════════════════════════════════════════════════
    
    if (path === "/admin" || path === "/admin/") {
      return new Response(getAdminDashboard(), {
        headers: { "content-type": "text/html", ...corsHeaders }
      })
    }
    
    if (path === "/plugins" || path === "/plugins/") {
      return new Response(getPluginsPage(), {
        headers: { "content-type": "text/html", ...corsHeaders }
      })
    }
    
    if (path === "/submit" || path === "/submit/") {
      return new Response(getSubmitPage(), {
        headers: { "content-type": "text/html", ...corsHeaders }
      })
    }
    
    if (path === "/deploy" || path === "/deploy/") {
      return new Response(getDeployPage(), {
        headers: { "content-type": "text/html", ...corsHeaders }
      })
    }
    
    if (path === "/commands" || path === "/commands/") {
      return new Response(getCommandsPage(), {
        headers: { "content-type": "text/html", ...corsHeaders }
      })
    }

    return new Response("Not found", { status: 404 })
  }
}

// ═══════════════════════════════════════════════════
// 📖 DEFAULT COMMANDS
// ═══════════════════════════════════════════════════

function getDefaultCommands() {
  return [
    { name: "menu", category: "general", description: "Display main menu", usage: ".menu" },
    { name: "ai", category: "general", description: "Ask Claude AI", usage: ".ai <question>" },
    { name: "ping", category: "general", description: "Check bot speed", usage: ".ping" },
    { name: "sticker", category: "media", description: "Create sticker", usage: ".sticker" },
    { name: "plugin", category: "owner", description: "Install plugin", usage: ".plugin <url>", ownerOnly: true },
    { name: "bash", category: "owner", description: "Execute shell command", usage: ".bash <cmd>", ownerOnly: true }
  ]
}

// Continue in next file due to length...





// ═══════════════════════════════════════════════════════════════
// CRYSNOVA PLATFORM - All HTML Pages
// Copy these functions into worker.js
// ═══════════════════════════════════════════════════════════════

function getHomepage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CRYSNOVA AI - WhatsApp Bot Platform</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    
    nav {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      padding: 20px 0;
      position: sticky;
      top: 0;
      z-index: 1000;
    }
    .nav-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .logo {
      font-size: 1.8rem;
      font-weight: 800;
    }
    .nav-links {
      display: flex;
      gap: 30px;
    }
    .nav-links a {
      color: white;
      text-decoration: none;
      font-weight: 600;
      transition: opacity 0.2s;
    }
    .nav-links a:hover {
      opacity: 0.8;
    }
    
    .hero {
      text-align: center;
      padding: 100px 20px;
      max-width: 900px;
      margin: 0 auto;
    }
    h1 {
      font-size: 4rem;
      margin-bottom: 20px;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
    }
    .tagline {
      font-size: 1.5rem;
      opacity: 0.9;
      margin-bottom: 40px;
    }
    .cta-buttons {
      display: flex;
      gap: 20px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .btn {
      padding: 18px 40px;
      border-radius: 12px;
      text-decoration: none;
      font-weight: 600;
      font-size: 1.1rem;
      transition: all 0.3s;
      display: inline-block;
    }
    .btn-primary {
      background: white;
      color: #667eea;
      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    }
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(0,0,0,0.3);
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border: 2px solid white;
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    
    .features {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      padding: 80px 20px;
    }
    .features-container {
      max-width: 1200px;
      margin: 0 auto;
    }
    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 30px;
      margin-top: 50px;
    }
    .feature-card {
      background: rgba(255, 255, 255, 0.1);
      padding: 30px;
      border-radius: 15px;
      text-align: center;
    }
    .feature-icon {
      font-size: 3rem;
      margin-bottom: 15px;
    }
    .feature-card h3 {
      font-size: 1.5rem;
      margin-bottom: 10px;
    }
    .feature-card p {
      opacity: 0.9;
      line-height: 1.6;
    }
    
    .stats {
      padding: 80px 20px;
      text-align: center;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 40px;
      max-width: 1000px;
      margin: 50px auto 0;
    }
    .stat {
      text-align: center;
    }
    .stat-number {
      font-size: 3rem;
      font-weight: 800;
      margin-bottom: 10px;
    }
    .stat-label {
      font-size: 1.1rem;
      opacity: 0.8;
    }
    
    .community {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      padding: 80px 20px;
      text-align: center;
    }
    .community-buttons {
      display: flex;
      gap: 20px;
      justify-content: center;
      margin-top: 40px;
      flex-wrap: wrap;
    }
    
    @media (max-width: 768px) {
      h1 { font-size: 2.5rem; }
      .tagline { font-size: 1.2rem; }
      .nav-links { display: none; }
    }
  </style>
</head>
<body>
  <nav>
    <div class="nav-container">
      <div class="logo">⚉ CRYSNOVA AI</div>
      <div class="nav-links">
        <a href="/">Home</a>
        <a href="/deploy">Deploy</a>
        <a href="/plugins">Plugins</a>
        <a href="/commands">Commands</a>
        <a href="/submit">Submit Plugin</a>
      </div>
    </div>
  </nav>

  <section class="hero">
    <h1>CRYSNOVA AI</h1>
    <p class="tagline">The Most Advanced WhatsApp Bot Platform</p>
    <div class="cta-buttons">
      <a href="/deploy" class="btn btn-primary">Deploy Now</a>
      <a href="/plugins" class="btn btn-secondary">Browse Plugins</a>
    </div>
  </section>

  <section class="features">
    <div class="features-container">
      <h2 style="text-align: center; font-size: 2.5rem; margin-bottom: 20px;">Why CRYSNOVA AI?</h2>
      
      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon">🚀</div>
          <h3>Easy Deploy</h3>
          <p>One-click deployment to panels or VPS. Get your bot running in minutes!</p>
        </div>
        
        <div class="feature-card">
          <div class="feature-icon">🔌</div>
          <h3>Plugin System</h3>
          <p>Install plugins with a simple command. Extend your bot instantly!</p>
        </div>
        
        <div class="feature-card">
          <div class="feature-icon">🤖</div>
          <h3>AI Powered</h3>
          <p>Claude 4.5 integration for intelligent, context-aware responses.</p>
        </div>
        
        <div class="feature-card">
          <div class="feature-icon">⚡</div>
          <h3>Super Fast</h3>
          <p>Optimized performance. Lightning-fast command execution.</p>
        </div>
        
        <div class="feature-card">
          <div class="feature-icon">🛡️</div>
          <h3>Secure</h3>
          <p>Built-in security features. Owner-only commands. Safe to use.</p>
        </div>
        
        <div class="feature-card">
          <div class="feature-icon">🌍</div>
          <h3>Open Source</h3>
          <p>Free forever. Community-driven. Contribute and grow together!</p>
        </div>
      </div>
    </div>
  </section>

  <section class="stats">
    <h2 style="font-size: 2.5rem; margin-bottom: 20px;">Trusted by Thousands</h2>
    <div class="stats-grid">
      <div class="stat">
        <div class="stat-number">10K+</div>
        <div class="stat-label">Active Bots</div>
      </div>
      <div class="stat">
        <div class="stat-number">150+</div>
        <div class="stat-label">Plugins</div>
      </div>
      <div class="stat">
        <div class="stat-number">50K+</div>
        <div class="stat-label">Users</div>
      </div>
      <div class="stat">
        <div class="stat-number">24/7</div>
        <div class="stat-label">Support</div>
      </div>
    </div>
  </section>

  <section class="community">
    <h2 style="font-size: 2.5rem; margin-bottom: 20px;">Join Our Community</h2>
    <p style="font-size: 1.2rem; opacity: 0.9;">Get help, share ideas, and connect with other bot creators!</p>
    <div class="community-buttons">
      <a href="https://whatsapp.com/channel/0029Vb6pe77K0IBn48HLKb38" class="btn btn-primary" target="_blank">📢 Join Channel</a>
      <a href="https://chat.whatsapp.com/Besbj8VIle1GwxKKZv1lax" class="btn btn-secondary" target="_blank">💬 Join Group</a>
    </div>
  </section>
</body>
</html>`
}

function getAdminDashboard() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Dashboard - CRYSNOVA AI</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f5f5f5;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .container {
      max-width: 1200px;
      margin: 30px auto;
      padding: 0 20px;
    }
    .login-card {
      background: white;
      border-radius: 15px;
      padding: 40px;
      max-width: 400px;
      margin: 100px auto;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    }
    .login-card h2 {
      margin-bottom: 20px;
      color: #333;
    }
    input {
      width: 100%;
      padding: 12px;
      border: 2px solid #ddd;
      border-radius: 8px;
      margin-bottom: 15px;
      font-size: 1rem;
    }
    .btn {
      width: 100%;
      padding: 15px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      font-size: 1rem;
    }
    .btn:hover {
      opacity: 0.9;
    }
    .dashboard {
      display: none;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: white;
      padding: 25px;
      border-radius: 15px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .stat-number {
      font-size: 2.5rem;
      font-weight: 800;
      color: #667eea;
    }
    .stat-label {
      color: #666;
      margin-top: 5px;
    }
    .plugins-section {
      background: white;
      border-radius: 15px;
      padding: 30px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .plugin-item {
      border: 2px solid #f0f0f0;
      padding: 20px;
      border-radius: 10px;
      margin-bottom: 15px;
    }
    .plugin-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .plugin-name {
      font-size: 1.3rem;
      font-weight: 600;
      color: #333;
    }
    .plugin-meta {
      color: #666;
      font-size: 0.9rem;
      margin-bottom: 10px;
    }
    .code-preview {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 0.85rem;
      max-height: 200px;
      overflow-y: auto;
      margin: 10px 0;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .actions {
      display: flex;
      gap: 10px;
    }
    .btn-approve {
      background: #28a745;
      color: white;
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
    }
    .btn-reject {
      background: #dc3545;
      color: white;
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🛡️ Admin Dashboard</h1>
    <p>CRYSNOVA AI Plugin Management</p>
  </div>

  <div id="loginForm" class="login-card">
    <h2>🔐 Admin Login</h2>
    <input type="password" id="adminToken" placeholder="Enter admin token">
    <button class="btn" onclick="login()">Login</button>
  </div>

  <div id="dashboard" class="dashboard">
    <div class="container">
      <div class="stats">
        <div class="stat-card">
          <div class="stat-number" id="totalPlugins">0</div>
          <div class="stat-label">Total Plugins</div>
        </div>
        <div class="stat-card">
          <div class="stat-number" id="pendingCount">0</div>
          <div class="stat-label">Pending Approval</div>
        </div>
        <div class="stat-card">
          <div class="stat-number" id="approvedCount">0</div>
          <div class="stat-label">Approved</div>
        </div>
      </div>

      <div class="plugins-section">
        <h2 style="margin-bottom: 20px;">⏳ Pending Plugins</h2>
        <div id="pendingPlugins"></div>
      </div>
    </div>
  </div>

  <script>
    let adminToken = '';

    function login() {
      adminToken = document.getElementById('adminToken').value;
      if (!adminToken) return alert('Enter token!');
      
      loadDashboard();
    }

    async function loadDashboard() {
      try {
        const response = await fetch('/api/admin/pending', {
          headers: {
            'Authorization': 'Bearer ' + adminToken
          }
        });
        
        const data = await response.json();
        
        if (!data.success) {
          alert('Invalid token!');
          return;
        }
        
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        
        document.getElementById('pendingCount').textContent = data.total;
        
        displayPlugins(data.plugins);
        
      } catch (error) {
        alert('Login failed: ' + error.message);
      }
    }

    function displayPlugins(plugins) {
      const container = document.getElementById('pendingPlugins');
      
      if (plugins.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">No pending plugins</p>';
        return;
      }
      
      container.innerHTML = plugins.map(plugin => \`
        <div class="plugin-item">
          <div class="plugin-header">
            <div class="plugin-name">\${plugin.name}</div>
            <span style="background:#ffc107;color:#000;padding:5px 12px;border-radius:20px;font-size:0.85rem;font-weight:600;">PENDING</span>
          </div>
          
          <div class="plugin-meta">
            📁 Category: \${plugin.category} | 👤 Author: \${plugin.author} | 📌 Version: \${plugin.version}
          </div>
          
          <p style="margin:10px 0;color:#666;">\${plugin.description}</p>
          
          <details>
            <summary style="cursor:pointer;color:#667eea;font-weight:600;margin:10px 0;">View Code</summary>
            <div class="code-preview">\${plugin.code}</div>
          </details>
          
          <div class="actions">
            <button class="btn-approve" onclick="approvePlugin('\${plugin.id}')">✅ Approve</button>
            <button class="btn-reject" onclick="rejectPlugin('\${plugin.id}')">❌ Reject</button>
          </div>
        </div>
      \`).join('');
    }

    async function approvePlugin(pluginId) {
      if (!confirm('Approve this plugin?')) return;
      
      try {
        const response = await fetch('/api/admin/approve', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + adminToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ pluginId })
        });
        
        const data = await response.json();
        
        if (data.success) {
          alert('✅ Plugin approved!');
          loadDashboard();
        } else {
          alert('Error: ' + data.error);
        }
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }

    async function rejectPlugin(pluginId) {
      if (!confirm('Reject this plugin?')) return;
      
      try {
        const response = await fetch('/api/admin/reject', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + adminToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ pluginId })
        });
        
        const data = await response.json();
        
        if (data.success) {
          alert('❌ Plugin rejected!');
          loadDashboard();
        } else {
          alert('Error: ' + data.error);
        }
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }
  </script>
</body>
</html>`
}

// Continue with more pages...
function getPluginsPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Plugins - CRYSNOVA AI</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    .back-link {
      display: inline-block;
      color: white;
      text-decoration: none;
      margin-bottom: 20px;
      padding: 10px 20px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 8px;
    }
    .header {
      text-align: center;
      color: white;
      margin-bottom: 40px;
    }
    h1 {
      font-size: 3rem;
      margin-bottom: 15px;
    }
    .search-bar {
      max-width: 600px;
      margin: 0 auto 40px;
    }
    .search-bar input {
      width: 100%;
      padding: 15px 20px;
      border: none;
      border-radius: 12px;
      font-size: 1rem;
    }
    .filters {
      display: flex;
      gap: 15px;
      justify-content: center;
      margin-bottom: 40px;
      flex-wrap: wrap;
    }
    .filter-btn {
      padding: 10px 20px;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s;
    }
    .filter-btn:hover, .filter-btn.active {
      background: white;
      color: #667eea;
    }
    .plugins-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 25px;
    }
    .plugin-card {
      background: rgba(255, 255, 255, 0.95);
      border-radius: 20px;
      padding: 25px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      transition: transform 0.3s;
    }
    .plugin-card:hover {
      transform: translateY(-5px);
    }
    .plugin-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 15px;
    }
    .plugin-icon {
      font-size: 2.5rem;
    }
    .plugin-category {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .plugin-card h3 {
      color: #333;
      font-size: 1.4rem;
      margin-bottom: 10px;
    }
    .plugin-description {
      color: #666;
      margin-bottom: 15px;
      line-height: 1.6;
    }
    .plugin-meta {
      display: flex;
      gap: 15px;
      margin-bottom: 15px;
      font-size: 0.9rem;
      color: #999;
    }
    .install-section {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 10px;
      margin-top: 15px;
    }
    .install-section label {
      display: block;
      color: #333;
      font-weight: 600;
      margin-bottom: 8px;
      font-size: 0.9rem;
    }
    .install-command {
      display: flex;
      gap: 10px;
    }
    .install-command input {
      flex: 1;
      padding: 10px;
      border: 2px solid #ddd;
      border-radius: 6px;
      font-family: monospace;
      font-size: 0.85rem;
    }
    .copy-btn {
      padding: 10px 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    }
    .copy-btn:hover {
      opacity: 0.9;
    }
    .loading {
      text-align: center;
      color: white;
      font-size: 1.2rem;
      padding: 40px;
    }
    @media (max-width: 768px) {
      h1 { font-size: 2rem; }
      .plugins-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <a href="/" class="back-link">← Back to Home</a>
    
    <div class="header">
      <h1>🔌 Plugin Marketplace</h1>
      <p style="font-size: 1.2rem; opacity: 0.9;">Extend your bot with powerful plugins</p>
    </div>
    
    <div class="search-bar">
      <input type="text" id="searchInput" placeholder="🔍 Search plugins...">
    </div>
    
    <div class="filters">
      <button class="filter-btn active" data-category="all">All</button>
      <button class="filter-btn" data-category="utility">Utility</button>
      <button class="filter-btn" data-category="fun">Fun</button>
      <button class="filter-btn" data-category="admin">Admin</button>
      <button class="filter-btn" data-category="media">Media</button>
      <button class="filter-btn" data-category="ai">AI</button>
    </div>
    
    <div class="plugins-grid" id="pluginsGrid">
      <div class="loading">Loading plugins...</div>
    </div>
  </div>

  <script>
    let allPlugins = [];
    let currentCategory = 'all';
    
    async function loadPlugins() {
      try {
        const response = await fetch('/api/plugins');
        const data = await response.json();
        
        if (data.success) {
          allPlugins = data.plugins;
          displayPlugins(allPlugins);
        } else {
          document.getElementById('pluginsGrid').innerHTML = 
            '<div class="loading">No plugins found. Be the first to submit one!</div>';
        }
      } catch (error) {
        document.getElementById('pluginsGrid').innerHTML = 
          '<div class="loading" style="color: #ff6b6b;">Error loading plugins. Please try again.</div>';
      }
    }
    
    function displayPlugins(plugins) {
      const grid = document.getElementById('pluginsGrid');
      
      if (plugins.length === 0) {
        grid.innerHTML = '<div class="loading">No plugins found</div>';
        return;
      }
      
      grid.innerHTML = plugins.map(plugin => \`
        <div class="plugin-card" data-category="\${plugin.category}">
          <div class="plugin-header">
            <span class="plugin-icon">\${getCategoryIcon(plugin.category)}</span>
            <span class="plugin-category">\${plugin.category}</span>
          </div>
          
          <h3>\${plugin.name}</h3>
          <p class="plugin-description">\${plugin.description}</p>
          
          <div class="plugin-meta">
            <span>👤 \${plugin.author}</span>
            <span>📦 v\${plugin.version}</span>
            <span>⬇️ \${plugin.downloads || 0}</span>
          </div>
          
          <div class="install-section">
            <label>📋 Install Command:</label>
            <div class="install-command">
              <input type="text" value="\${plugin.installCommand}" readonly>
              <button class="copy-btn" onclick="copyCommand('\${plugin.installCommand}')">Copy</button>
            </div>
          </div>
        </div>
      \`).join('');
    }
    
    function getCategoryIcon(category) {
      const icons = {
        utility: '🛠️',
        fun: '🎮',
        admin: '👑',
        media: '🎨',
        ai: '🤖',
        general: '📦'
      };
      return icons[category] || '📦';
    }
    
    function copyCommand(command) {
      navigator.clipboard.writeText(command);
      
      const btn = event.target;
      const originalText = btn.textContent;
      btn.textContent = '✅ Copied!';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    }
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        currentCategory = btn.dataset.category;
        filterPlugins();
      });
    });
    
    document.getElementById('searchInput').addEventListener('input', (e) => {
      filterPlugins();
    });
    
    function filterPlugins() {
      const searchTerm = document.getElementById('searchInput').value.toLowerCase();
      
      let filtered = allPlugins;
      
      if (currentCategory !== 'all') {
        filtered = filtered.filter(p => p.category === currentCategory);
      }
      
      if (searchTerm) {
        filtered = filtered.filter(p => 
          p.name.toLowerCase().includes(searchTerm) ||
          p.description.toLowerCase().includes(searchTerm)
        );
      }
      
      displayPlugins(filtered);
    }
    
    loadPlugins();
  </script>
</body>
</html>`
}

// I'll create more pages in the next file due to length...
// ═══════════════════════════════════════════════════════════════
// REMAINING HTML PAGES - Add to pages.js or worker.js
// ═══════════════════════════════════════════════════════════════

function getSubmitPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Submit Plugin - CRYSNOVA AI</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    .back-link {
      display: inline-block;
      color: white;
      text-decoration: none;
      margin-bottom: 20px;
      padding: 10px 20px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 8px;
    }
    .header {
      text-align: center;
      color: white;
      margin-bottom: 40px;
    }
    h1 {
      font-size: 3rem;
      margin-bottom: 15px;
    }
    .form-card {
      background: rgba(255, 255, 255, 0.95);
      border-radius: 20px;
      padding: 40px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    }
    .form-group {
      margin-bottom: 25px;
    }
    label {
      display: block;
      color: #333;
      font-weight: 600;
      margin-bottom: 8px;
    }
    input, select, textarea {
      width: 100%;
      padding: 12px;
      border: 2px solid #ddd;
      border-radius: 8px;
      font-size: 1rem;
      font-family: inherit;
    }
    textarea {
      min-height: 150px;
      font-family: monospace;
      resize: vertical;
    }
    .submit-btn {
      width: 100%;
      padding: 16px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 12px;
      font-weight: 600;
      font-size: 1.1rem;
      cursor: pointer;
      transition: transform 0.2s;
    }
    .submit-btn:hover:not(:disabled) {
      transform: translateY(-2px);
    }
    .submit-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .hint {
      font-size: 0.9rem;
      color: #666;
      margin-top: 5px;
    }
    .success, .error {
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: none;
    }
    .success {
      background: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
    }
    .error {
      background: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }
    .success.show, .error.show {
      display: block;
    }
  </style>
</head>
<body>
  <div class="container">
    <a href="/plugins" class="back-link">← Back to Plugins</a>
    
    <div class="header">
      <h1>✉️ Submit Plugin</h1>
      <p style="font-size: 1.2rem; opacity: 0.9;">Share your plugin with the community</p>
    </div>
    
    <div class="form-card">
      <div class="success" id="successMsg"></div>
      <div class="error" id="errorMsg"></div>
      
      <form id="submitForm">
        <div class="form-group">
          <label>Plugin Name *</label>
          <input type="text" name="name" required placeholder="e.g., Advanced Sticker Maker">
          <div class="hint">A clear, descriptive name for your plugin</div>
        </div>
        
        <div class="form-group">
          <label>Description *</label>
          <textarea name="description" required placeholder="Describe what your plugin does..."></textarea>
          <div class="hint">Explain the features and benefits</div>
        </div>
        
        <div class="form-group">
          <label>Category *</label>
          <select name="category" required>
            <option value="">Select category...</option>
            <option value="utility">Utility</option>
            <option value="fun">Fun</option>
            <option value="admin">Admin</option>
            <option value="media">Media</option>
            <option value="ai">AI</option>
            <option value="general">General</option>
          </select>
        </div>
        
        <div class="form-group">
          <label>Plugin Code *</label>
          <textarea name="code" required placeholder="module.exports = { ... }"></textarea>
          <div class="hint">Paste your complete plugin code (JavaScript)</div>
        </div>
        
        <div class="form-group">
          <label>Author Name</label>
          <input type="text" name="author" placeholder="Your name">
          <div class="hint">Optional - defaults to "Anonymous"</div>
        </div>
        
        <div class="form-group">
          <label>Version</label>
          <input type="text" name="version" placeholder="1.0.0">
          <div class="hint">Optional - defaults to "1.0.0"</div>
        </div>
        
        <button type="submit" class="submit-btn" id="submitBtn">Submit Plugin</button>
      </form>
    </div>
  </div>

  <script>
    document.getElementById('submitForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const btn = document.getElementById('submitBtn');
      const successMsg = document.getElementById('successMsg');
      const errorMsg = document.getElementById('errorMsg');
      
      successMsg.classList.remove('show');
      errorMsg.classList.remove('show');
      
      btn.disabled = true;
      btn.textContent = '⏳ Submitting...';
      
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData);
      
      try {
        const response = await fetch('/api/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
          successMsg.textContent = '✅ ' + result.message;
          successMsg.classList.add('show');
          e.target.reset();
        } else {
          errorMsg.textContent = '❌ ' + result.error;
          errorMsg.classList.add('show');
        }
      } catch (error) {
        errorMsg.textContent = '❌ Error: ' + error.message;
        errorMsg.classList.add('show');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Submit Plugin';
      }
    });
  </script>
</body>
</html>`
}

function getDeployPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Deploy - CRYSNOVA AI</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
    }
    .back-link {
      display: inline-block;
      color: white;
      text-decoration: none;
      margin-bottom: 20px;
      padding: 10px 20px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 8px;
    }
    .header {
      text-align: center;
      color: white;
      margin-bottom: 50px;
    }
    h1 {
      font-size: 3rem;
      margin-bottom: 15px;
    }
    .deploy-options {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 30px;
    }
    .deploy-card {
      background: rgba(255, 255, 255, 0.95);
      border-radius: 20px;
      padding: 40px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    }
    .deploy-card h2 {
      color: #333;
      font-size: 2rem;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 15px;
    }
    .icon {
      font-size: 2.5rem;
    }
    .description {
      color: #666;
      margin-bottom: 25px;
      line-height: 1.6;
    }
    .deploy-link {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 10px;
      margin: 20px 0;
      border: 2px solid #ddd;
    }
    .deploy-link label {
      display: block;
      color: #333;
      font-weight: 600;
      margin-bottom: 10px;
    }
    .link-box {
      display: flex;
      gap: 10px;
    }
    input[type="text"] {
      flex: 1;
      padding: 12px;
      border: 2px solid #ddd;
      border-radius: 8px;
      font-family: monospace;
      font-size: 0.9rem;
    }
    .copy-btn {
      padding: 12px 25px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
    }
    .copy-btn:hover {
      opacity: 0.9;
    }
    .steps {
      margin-top: 25px;
    }
    .step {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 10px;
      border-left: 4px solid #667eea;
    }
    .step-number {
      color: #667eea;
      font-weight: 800;
      margin-right: 10px;
    }
    @media (max-width: 768px) {
      .deploy-options { grid-template-columns: 1fr; }
      h1 { font-size: 2rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <a href="/" class="back-link">← Back to Home</a>
    
    <div class="header">
      <h1>🚀 Deploy CRYSNOVA AI</h1>
      <p style="font-size: 1.2rem; opacity: 0.9;">Choose your deployment method</p>
    </div>
    
    <div class="deploy-options">
      <div class="deploy-card">
        <h2><span class="icon">☁️</span> Panel Deploy</h2>
        <p class="description">Deploy to hosting panels like Pterodactyl, Railway, Render, etc.</p>
        
        <div class="deploy-link">
          <label>📋 Deployment Link:</label>
          <div class="link-box">
            <input type="text" id="panelLink" value="https://github.com/crysnovax/CRYSNOVA_AI.git" readonly>
            <button class="copy-btn" onclick="copyText('panelLink')">Copy</button>
          </div>
        </div>
        
        <div class="steps">
          <div class="step">
            <span class="step-number">1.</span> Go to your panel dashboard
          </div>
          <div class="step">
            <span class="step-number">2.</span> Create new server (Node.js 20)
          </div>
          <div class="step">
            <span class="step-number">3.</span> Paste the GitHub link
          </div>
          <div class="step">
            <span class="step-number">4.</span> Set start command: <code>npm start</code>
          </div>
          <div class="step">
            <span class="step-number">5.</span> Deploy and scan QR code!
          </div>
        </div>
      </div>
      
      <div class="deploy-card">
        <h2><span class="icon">🖥️</span> VPS Deploy</h2>
        <p class="description">Deploy to your own VPS (Ubuntu, Debian, CentOS, etc.)</p>
        
        <div class="deploy-link">
          <label>📋 Quick Install Command:</label>
          <div class="link-box">
            <input type="text" id="vpsCommand" value="bash <(curl -s https://crysnova.ai/install.sh)" readonly>
            <button class="copy-btn" onclick="copyText('vpsCommand')">Copy</button>
          </div>
        </div>
        
        <div class="steps">
          <div class="step">
            <span class="step-number">1.</span> SSH into your VPS
          </div>
          <div class="step">
            <span class="step-number">2.</span> Paste the install command
          </div>
          <div class="step">
            <span class="step-number">3.</span> Follow the prompts
          </div>
          <div class="step">
            <span class="step-number">4.</span> Scan QR code
          </div>
          <div class="step">
            <span class="step-number">5.</span> Bot is live! 🎉
          </div>
        </div>
        
        <div style="margin-top: 25px; padding: 15px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
          <strong>⚠️ Requirements:</strong><br>
          • Node.js 20 or higher<br>
          • 1GB RAM minimum<br>
          • Ubuntu 20.04+ recommended
        </div>
      </div>
    </div>
  </div>

  <script>
    function copyText(id) {
      const input = document.getElementById(id);
      input.select();
      document.execCommand('copy');
      
      const btn = event.target;
      const originalText = btn.textContent;
      btn.textContent = '✅ Copied!';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    }
  </script>
</body>
</html>`
}

function getCommandsPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Commands - CRYSNOVA AI</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
    }
    .back-link {
      display: inline-block;
      color: white;
      text-decoration: none;
      margin-bottom: 20px;
      padding: 10px 20px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 8px;
    }
    .header {
      text-align: center;
      color: white;
      margin-bottom: 40px;
    }
    h1 {
      font-size: 3rem;
      margin-bottom: 15px;
    }
    .commands-card {
      background: rgba(255, 255, 255, 0.95);
      border-radius: 20px;
      padding: 40px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    }
    .category {
      margin-bottom: 35px;
    }
    .category h2 {
      color: #667eea;
      font-size: 1.8rem;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .command-list {
      display: grid;
      gap: 15px;
    }
    .command-item {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 12px;
      border-left: 4px solid #667eea;
    }
    .command-name {
      font-family: monospace;
      font-size: 1.1rem;
      color: #667eea;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .command-desc {
      color: #666;
      line-height: 1.6;
    }
    .command-example {
      margin-top: 10px;
      padding: 10px;
      background: white;
      border-radius: 6px;
      font-family: monospace;
      font-size: 0.9rem;
      color: #333;
    }
  </style>
</head>
<body>
  <div class="container">
    <a href="/" class="back-link">← Back to Home</a>
    
    <div class="header">
      <h1>📖 Commands</h1>
      <p style="font-size: 1.2rem; opacity: 0.9;">Complete command reference</p>
    </div>
    
    <div class="commands-card">
      <div class="category">
        <h2>🤖 General Commands</h2>
        <div class="command-list">
          <div class="command-item">
            <div class="command-name">.menu</div>
            <div class="command-desc">Display the main bot menu</div>
          </div>
          <div class="command-item">
            <div class="command-name">.help</div>
            <div class="command-desc">Show all available commands</div>
          </div>
          <div class="command-item">
            <div class="command-name">.ping</div>
            <div class="command-desc">Check bot response time</div>
          </div>
          <div class="command-item">
            <div class="command-name">.ai &lt;question&gt;</div>
            <div class="command-desc">Ask Claude AI anything</div>
            <div class="command-example">Example: .ai What is quantum physics?</div>
          </div>
        </div>
      </div>
      
      <div class="category">
        <h2>🔌 Plugin System</h2>
        <div class="command-list">
          <div class="command-item">
            <div class="command-name">.plugin &lt;url&gt;</div>
            <div class="command-desc">Install a plugin from URL</div>
            <div class="command-example">Example: .plugin https://crysnova.ai/plugin/sticker-maker</div>
          </div>
          <div class="command-item">
            <div class="command-name">.plugins</div>
            <div class="command-desc">List installed plugins</div>
          </div>
          <div class="command-item">
            <div class="command-name">.uninstall &lt;name&gt;</div>
            <div class="command-desc">Remove a plugin</div>
          </div>
        </div>
      </div>
      
      <div class="category">
        <h2>🎨 Media Commands</h2>
        <div class="command-list">
          <div class="command-item">
            <div class="command-name">.sticker</div>
            <div class="command-desc">Convert image/video to sticker (reply to media)</div>
          </div>
          <div class="command-item">
            <div class="command-name">.toimg</div>
            <div class="command-desc">Convert sticker back to image</div>
          </div>
          <div class="command-item">
            <div class="command-name">.download &lt;url&gt;</div>
            <div class="command-desc">Download video from YouTube, Instagram, TikTok</div>
          </div>
        </div>
      </div>
      
      <div class="category">
        <h2>👑 Admin Commands</h2>
        <div class="command-list">
          <div class="command-item">
            <div class="command-name">.kick @user</div>
            <div class="command-desc">Remove member from group</div>
          </div>
          <div class="command-item">
            <div class="command-name">.promote @user</div>
            <div class="command-desc">Make user an admin</div>
          </div>
          <div class="command-item">
            <div class="command-name">.tagall</div>
            <div class="command-desc">Mention everyone in the group</div>
          </div>
          <div class="command-item">
            <div class="command-name">.antilink on/off</div>
            <div class="command-desc">Toggle anti-link protection</div>
          </div>
        </div>
      </div>
      
      <div class="category">
        <h2>💻 Owner Commands</h2>
        <div class="command-list">
          <div class="command-item">
            <div class="command-name">.bash &lt;command&gt;</div>
            <div class="command-desc">Execute shell commands (owner only)</div>
          </div>
          <div class="command-item">
            <div class="command-name">𓄄&lt;cmd&gt;</div>
            <div class="command-desc">Execute command on all bots</div>
          </div>
          <div class="command-item">
            <div class="command-name">.update</div>
            <div class="command-desc">Check for bot updates</div>
          </div>
          <div class="command-item">
            <div class="command-name">.updatebot</div>
            <div class="command-desc">Pull latest updates from GitHub</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`
}

function getInstallScript() {
  return `#!/bin/bash

# CRYSNOVA AI - VPS Auto Install Script
# curl -sL https://crysnova.ai/install.sh | bash

set -e

RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
CYAN='\\033[0;36m'
NC='\\033[0m'

echo -e "\${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║         🚀 CRYSNOVA AI - VPS AUTO INSTALLER 🚀              ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "\${NC}"

if [ "$EUID" -eq 0 ]; then 
   echo -e "\${RED}Please don't run as root!\${NC}"
   exit 1
fi

if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo -e "\${RED}Cannot detect OS!\${NC}"
    exit 1
fi

echo -e "\${GREEN}✓ Detected OS: $OS\${NC}"

echo -e "\${YELLOW}[1/5] Installing Node.js 20...\${NC}"

if ! command -v node &> /dev/null; then
    if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ]; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
        sudo yum install -y nodejs
    fi
fi

echo -e "\${GREEN}✓ Node.js $(node -v) installed\${NC}"

echo -e "\${YELLOW}[2/5] Installing Git...\${NC}"

if ! command -v git &> /dev/null; then
    if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
        sudo apt-get install -y git
    elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ]; then
        sudo yum install -y git
    fi
fi

echo -e "\${GREEN}✓ Git installed\${NC}"

echo -e "\${YELLOW}[3/5] Cloning CRYSNOVA AI...\${NC}"

if [ -d "CRYSNOVA_AI" ]; then
    echo -e "\${YELLOW}Directory exists, pulling latest...\${NC}"
    cd CRYSNOVA_AI
    git pull
else
    git clone https://github.com/crysnovax/CRYSNOVA_AI.git
    cd CRYSNOVA_AI
fi

echo -e "\${GREEN}✓ Repository ready\${NC}"

echo -e "\${YELLOW}[4/5] Installing dependencies...\${NC}"
npm install

echo -e "\${GREEN}✓ Dependencies installed\${NC}"

echo -e "\${YELLOW}[5/5] Installing PM2...\${NC}"

if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
fi

echo -e "\${GREEN}✓ PM2 installed\${NC}"

echo ""
echo -e "\${GREEN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║                 ✅ INSTALLATION COMPLETE! ✅                 ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "\${NC}"

echo -e "\${CYAN}Next steps:\${NC}"
echo -e "\${YELLOW}1. Configure your bot:\${NC}"
echo "   npm start"
echo ""
echo -e "\${YELLOW}2. OR use PM2:\${NC}"
echo "   pm2 start main.js --name crysnova"
echo ""
echo -e "\${YELLOW}3. View logs:\${NC}"
echo "   pm2 logs crysnova"
echo ""
echo -e "\${GREEN}For help: https://crysnova.ai\${NC}"
`
}
