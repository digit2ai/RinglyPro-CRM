#!/bin/bash

echo "🚀 Deploying RinglyPro MCP Integration to Render"
echo "=================================================="
echo ""

# Check if we're in a git repo
if [ ! -d .git ]; then
    echo "❌ Error: Not a git repository!"
    echo "Please run this script from the root of your RinglyPro-CRM repository."
    exit 1
fi

# Check if there are uncommitted changes
if [[ -n $(git status -s) ]]; then
    echo "📝 You have uncommitted changes. Let's commit them first."
    echo ""
    echo "Changed files:"
    git status -s
    echo ""
    read -p "Do you want to commit these changes? (y/n) " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        read -p "Enter commit message: " commit_message

        if [ -z "$commit_message" ]; then
            commit_message="Add MCP AI Copilot integration for HubSpot and GoHighLevel"
        fi

        echo ""
        echo "📦 Staging files..."
        git add .

        echo "💾 Committing changes..."
        git commit -m "$commit_message

🤖 Generated with Claude Code (https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

        echo "✅ Changes committed!"
    else
        echo "⚠️  Skipping commit. You'll need to commit manually before deploying."
        exit 1
    fi
fi

echo ""
echo "🔍 Checking remote repository..."
git_remote=$(git remote get-url origin 2>/dev/null)

if [ -z "$git_remote" ]; then
    echo "❌ No remote repository configured!"
    echo "Please add a remote repository first:"
    echo "  git remote add origin <your-repo-url>"
    exit 1
fi

echo "✅ Remote repository: $git_remote"
echo ""

# Get current branch
current_branch=$(git branch --show-current)
echo "📍 Current branch: $current_branch"
echo ""

read -p "Do you want to push to remote repository? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "⬆️  Pushing to $current_branch..."

    if git push origin "$current_branch"; then
        echo ""
        echo "✅ Successfully pushed to GitHub!"
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "🎉 DEPLOYMENT READY!"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "Next steps to deploy on Render:"
        echo ""
        echo "1. Go to https://dashboard.render.com"
        echo ""
        echo "2. Click 'New +' → 'Web Service'"
        echo ""
        echo "3. Connect your GitHub repository:"
        echo "   Repository: $git_remote"
        echo "   Branch: $current_branch"
        echo ""
        echo "4. Render will auto-detect your render.yaml config!"
        echo "   Service Name: ringlypro-mcp-api"
        echo "   Build Command: cd mcp-integrations && npm install"
        echo "   Start Command: cd mcp-integrations && npm start"
        echo ""
        echo "5. Add Environment Variables in Render dashboard:"
        echo "   Required (at least one):"
        echo "   - HUBSPOT_ACCESS_TOKEN=your-hubspot-token"
        echo "   - GHL_API_KEY=your-ghl-api-key"
        echo "   - GHL_LOCATION_ID=your-location-id"
        echo ""
        echo "   Optional:"
        echo "   - ANTHROPIC_API_KEY=your-claude-key"
        echo "   - OPENAI_API_KEY=your-openai-key"
        echo "   - ELEVENLABS_API_KEY=your-elevenlabs-key"
        echo ""
        echo "6. Click 'Create Web Service'"
        echo ""
        echo "7. Wait for deployment (2-3 minutes)"
        echo ""
        echo "8. Your API will be live at:"
        echo "   https://ringlypro-mcp-api.onrender.com"
        echo ""
        echo "9. Test your deployment:"
        echo "   https://ringlypro-mcp-api.onrender.com/api/mcp/health"
        echo "   https://ringlypro-mcp-api.onrender.com/mcp-copilot/"
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "📚 For more details, see:"
        echo "   - QUICK-START-MCP.md"
        echo "   - MCP-INTEGRATION-COMPLETE.md"
        echo ""
    else
        echo ""
        echo "❌ Failed to push to remote repository."
        echo "Please check your git configuration and try again."
        exit 1
    fi
else
    echo ""
    echo "⚠️  Skipping push. You can manually push later with:"
    echo "   git push origin $current_branch"
    echo ""
fi

echo "✨ Done!"
