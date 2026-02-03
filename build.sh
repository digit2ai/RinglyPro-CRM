#!/bin/bash
set -e  # Exit on error

echo "================================================"
echo "Starting RinglyPro CRM Build Process"
echo "================================================"
echo "Current directory: $(pwd)"
echo "NODE_ENV: $NODE_ENV"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo ""

# Install root dependencies
echo "📦 Installing root dependencies..."
npm install

# Build Store Health AI Dashboard
echo ""
echo "================================================"
echo "Building Store Health AI Dashboard"
echo "================================================"

# Check if dashboard directory exists
if [ ! -d "store-health-ai/dashboard" ]; then
    echo "❌ ERROR: store-health-ai/dashboard directory not found!"
    echo "Current directory contents:"
    ls -la
    exit 1
fi

cd store-health-ai/dashboard
echo "Dashboard directory: $(pwd)"

echo "📦 Installing dashboard dependencies with NODE_ENV=development..."
NODE_ENV=development npm ci --include=dev || NODE_ENV=development npm install --include=dev

echo ""
echo "📦 Checking installed packages..."
npm list --depth=0 | grep -E "(vite|react)" || echo "Warning: Key packages not found in list"

echo "📦 Verifying vite executable..."
if [ -f "node_modules/.bin/vite" ]; then
    echo "✅ vite executable exists!"
    ls -lh node_modules/.bin/vite
else
    echo "❌ vite executable NOT found! Checking node_modules/vite..."
    if [ -d "node_modules/vite" ]; then
        echo "vite package exists but executable missing"
        ls -la node_modules/vite/
    else
        echo "vite package not installed at all!"
        echo "Installing vite manually..."
        npm install vite@latest @vitejs/plugin-react@latest --save-dev
    fi
fi

echo ""
echo "🔨 Building dashboard with Vite..."
echo "Running: npm run build"
export NODE_ENV=production
npm run build 2>&1 | tee build.log || (echo "Build failed, here's the log:" && cat build.log && exit 1)

echo ""
echo "✅ Checking if dist folder was created..."
if [ -d "dist" ]; then
    echo "✅ dist folder exists!"
    echo "Contents:"
    ls -lhR dist/
    echo ""
    echo "Disk usage:"
    du -sh dist/
else
    echo "❌ ERROR: dist folder was not created!"
    echo "Current directory contents:"
    ls -la
    exit 1
fi

echo ""
echo "📦 Copying dist folder to ensure deployment..."
cp -r dist ../../store-health-ai-dashboard-dist
echo "✅ Copied dist to: $(pwd)/../../store-health-ai-dashboard-dist"
ls -la ../../store-health-ai-dashboard-dist

cd ../..

echo ""
echo "================================================"
echo "✅ Build completed successfully!"
echo "✅ Dashboard built at: ./store-health-ai-dashboard-dist"
echo "================================================"
