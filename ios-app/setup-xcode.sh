#!/bin/bash

echo "🔧 Setting up Xcode..."
echo ""
echo "This script will:"
echo "1. Set Xcode as the active developer directory"
echo "2. Accept Xcode license"
echo "3. Launch Xcode for new project creation"
echo ""

# Set Xcode path
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer

# Verify
echo "✅ Xcode path set to:"
xcode-select -p

# Accept license if needed
sudo xcodebuild -license accept 2>/dev/null || echo "License already accepted"

echo ""
echo "✅ Xcode setup complete!"
echo ""
echo "📱 Now launching Xcode..."
echo "   When Xcode opens, press: Shift + Command + N"
echo "   This will create a new project."
echo ""

# Close any existing Xcode instances
killall Xcode 2>/dev/null

# Wait a moment
sleep 2

# Open Xcode fresh
open -a Xcode

echo "✅ Xcode launched!"
echo ""
echo "NEXT STEPS:"
echo "1. Press: Shift + Command + N (⇧⌘N)"
echo "2. OR click: File → New → Project"
echo "3. Then come back to the terminal for next instructions"
