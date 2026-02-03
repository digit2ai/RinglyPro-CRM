#!/bin/bash
set -e  # Exit on error

echo "================================================"
echo "Starting RinglyPro CRM Build Process"
echo "================================================"

# Install root dependencies
echo "📦 Installing root dependencies..."
npm install

# Build Store Health AI Dashboard
echo ""
echo "================================================"
echo "Building Store Health AI Dashboard"
echo "================================================"

cd store-health-ai/dashboard

echo "📦 Installing dashboard dependencies (including devDependencies)..."
npm install --include=dev

echo ""
echo "🔨 Building dashboard with Vite..."
npm run build

echo ""
echo "✅ Checking if dist folder was created..."
if [ -d "dist" ]; then
    echo "✅ dist folder exists!"
    ls -lh dist/
else
    echo "❌ ERROR: dist folder was not created!"
    exit 1
fi

cd ../..

echo ""
echo "================================================"
echo "✅ Build completed successfully!"
echo "================================================"
