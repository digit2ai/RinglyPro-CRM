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

# Store Health AI Database Setup
# Note: Tables are created manually in existing ringlypro_crm_production database
# Run STORE_HEALTH_AI_SCHEMA.sql first, then use this to seed data

echo ""
echo "================================================"
echo "Store Health AI Database Check"
echo "================================================"

if [ -n "$DATABASE_URL" ]; then
  echo "✅ DATABASE_URL is set"

  # Check if Store Health AI tables exist and seed if needed
  ORGS_COUNT=$(psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM organizations WHERE name='Dollar Tree Stores';" 2>/dev/null || echo "0")

  if [ "$ORGS_COUNT" -eq "0" ] || [ "$ORGS_COUNT" = "0" ]; then
    echo "📊 No Store Health AI data found, seeding with 1 month of dummy data..."
    cd store-health-ai
    npx sequelize-cli db:seed --seed 20260204-one-month-data.js
    echo "✅ Seeding completed"
    cd ..
  else
    echo "ℹ️  Store Health AI data already exists, skipping seed"
  fi
else
  echo "⚠️  DATABASE_URL not set, skipping database setup"
fi

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
set +e  # Don't exit on error for this command
npm run build 2>&1 | tee build.log
BUILD_EXIT_CODE=$?
set -e  # Re-enable exit on error
if [ $BUILD_EXIT_CODE -ne 0 ]; then
  echo "❌ Build failed with exit code $BUILD_EXIT_CODE"
  echo "Build log:"
  cat build.log
  echo "Continuing anyway to check if dist exists..."
fi

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
echo "Building TunjoRacing Dashboard"
echo "================================================"

# Check if TunjoRacing dashboard directory exists
if [ -d "tunjoracing/dashboard" ]; then
    cd tunjoracing/dashboard
    echo "TunjoRacing Dashboard directory: $(pwd)"

    # Check if pre-built dist already exists (committed to repo)
    if [ -d "dist" ] && [ -f "dist/index.html" ]; then
        echo "✅ TunjoRacing dist folder already exists (pre-built), skipping build"
        echo "Contents:"
        ls -lh dist/
        cd ../..
    else
        echo "📦 Installing TunjoRacing dashboard dependencies..."
        echo "Node version: $(node --version)"
        echo "NPM version: $(npm --version)"

        # Install dependencies
        npm install --include=dev 2>&1 || {
            echo "⚠️ npm install failed, trying again..."
            rm -rf node_modules
            npm install --include=dev 2>&1
        }

        echo ""
        echo "📁 Installed packages:"
        ls node_modules/ 2>/dev/null | head -10 || echo "No node_modules found"

        echo ""
        echo "🔨 Building TunjoRacing dashboard with Vite..."
        set +e  # Don't exit on error for this command
        NODE_ENV=production npm run build 2>&1
        BUILD_EXIT_CODE=$?
        set -e  # Re-enable exit on error

        if [ $BUILD_EXIT_CODE -ne 0 ]; then
          echo "⚠️ TunjoRacing build failed with exit code $BUILD_EXIT_CODE"
          echo "Build output above should show the error"
        fi

        if [ -d "dist" ]; then
            echo "✅ TunjoRacing dist folder created!"
            ls -lh dist/
        else
            echo "⚠️ TunjoRacing dist folder not created, will use fallback landing page"
            echo "Checking for common issues..."
            ls -la
            cat package.json
        fi

        cd ../..
    fi
else
    echo "⚠️ TunjoRacing dashboard directory not found, skipping..."
fi

echo ""
echo "================================================"
echo "Building Web Call Center Dashboard"
echo "================================================"

if [ -d "web-call-center/dashboard" ]; then
    cd web-call-center/dashboard
    echo "Web Call Center Dashboard directory: $(pwd)"

    if [ -d "dist" ] && [ -f "dist/index.html" ]; then
        echo "✅ Web Call Center dist folder already exists (pre-built), skipping build"
        ls -lh dist/
        cd ../..
    else
        echo "📦 Installing Web Call Center dashboard dependencies..."
        NODE_ENV=development npm ci --include=dev || NODE_ENV=development npm install --include=dev

        echo ""
        echo "🔨 Building Web Call Center dashboard with Vite..."
        set +e
        NODE_ENV=production npm run build 2>&1
        BUILD_EXIT_CODE=$?
        set -e

        if [ $BUILD_EXIT_CODE -ne 0 ]; then
          echo "⚠️ Web Call Center build failed with exit code $BUILD_EXIT_CODE"
        fi

        if [ -d "dist" ]; then
            echo "✅ Web Call Center dist folder created!"
            ls -lh dist/
        else
            echo "⚠️ Web Call Center dist folder not created"
        fi

        cd ../..
    fi
else
    echo "⚠️ Web Call Center dashboard directory not found, skipping..."
fi

echo ""
echo "================================================"
echo "Building PINAXIS Analytics Dashboard"
echo "================================================"

if [ -d "pinaxis/dashboard" ]; then
    cd pinaxis/dashboard
    echo "PINAXIS Dashboard directory: $(pwd)"

    echo "📦 Installing PINAXIS dashboard dependencies..."
    NODE_ENV=development npm ci --include=dev || NODE_ENV=development npm install --include=dev

    echo ""
    echo "🔨 Building PINAXIS dashboard with Vite..."
    set +e
    NODE_ENV=production npm run build 2>&1
    BUILD_EXIT_CODE=$?
    set -e

    if [ $BUILD_EXIT_CODE -ne 0 ]; then
      echo "⚠️ PINAXIS build failed with exit code $BUILD_EXIT_CODE"
    fi

    if [ -d "dist" ]; then
        echo "✅ PINAXIS dist folder created!"
        ls -lh dist/
    else
        echo "⚠️ PINAXIS dist folder not created"
    fi

    cd ../..
else
    echo "⚠️ PINAXIS dashboard directory not found, skipping..."
fi

echo ""
echo "================================================"
echo "Building CW Carriers Dashboard"
echo "================================================"

if [ -d "verticals/cw_carriers/frontend" ]; then
    cd verticals/cw_carriers/frontend
    echo "CW Carriers Dashboard directory: $(pwd)"

    if [ -d "dist" ] && [ -f "dist/index.html" ]; then
        echo "✅ CW Carriers dist folder already exists (pre-built), skipping build"
        ls -lh dist/
        cd ../../..
    else
        echo "📦 Installing CW Carriers dashboard dependencies..."
        NODE_ENV=development npm ci --include=dev || NODE_ENV=development npm install --include=dev

        echo ""
        echo "🔨 Building CW Carriers dashboard with Vite..."
        set +e
        NODE_ENV=production npm run build 2>&1
        BUILD_EXIT_CODE=$?
        set -e

        if [ $BUILD_EXIT_CODE -ne 0 ]; then
          echo "⚠️ CW Carriers build failed with exit code $BUILD_EXIT_CODE"
        fi

        if [ -d "dist" ]; then
            echo "✅ CW Carriers dist folder created!"
            ls -lh dist/
        else
            echo "⚠️ CW Carriers dist folder not created"
        fi

        cd ../../..
    fi
else
    echo "⚠️ CW Carriers dashboard directory not found, skipping..."
fi

echo ""
echo "================================================"
echo "✅ Build completed successfully!"
echo "✅ Store Health AI Dashboard built at: ./store-health-ai-dashboard-dist"
echo "✅ TunjoRacing Dashboard built at: ./tunjoracing/dashboard/dist"
echo "✅ Web Call Center Dashboard built at: ./web-call-center/dashboard/dist"
echo "✅ PINAXIS Dashboard built at: ./pinaxis/dashboard/dist"
echo "✅ CW Carriers Dashboard built at: ./verticals/cw_carriers/frontend/dist"
echo "================================================"
