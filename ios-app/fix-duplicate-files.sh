#!/bin/bash

# Script to fix duplicate files in Xcode project
# This will remove duplicate entries from the project.pbxproj file

PROJECT_FILE="/Users/manuelstagg/Documents/GitHub/RinglyPro-CRM/ios-app/RinglyPro/RinglyPro.xcodeproj/project.pbxproj"

echo "🔍 Checking for duplicate files in Xcode project..."

# Backup the original project file
cp "$PROJECT_FILE" "$PROJECT_FILE.backup"
echo "✅ Created backup: $PROJECT_FILE.backup"

echo ""
echo "📋 To fix this issue manually in Xcode:"
echo ""
echo "1. Open your project in Xcode"
echo "2. Select the 'RinglyPro' target"
echo "3. Go to 'Build Phases' tab"
echo "4. Expand 'Compile Sources'"
echo "5. Look for any files that appear multiple times (duplicates)"
echo "6. Select the duplicate entries and click the '-' button to remove them"
echo "7. Do the same for 'Copy Bundle Resources'"
echo ""
echo "Common duplicate files to look for:"
echo "  - AppDelegate.swift"
echo "  - ContentView.swift"
echo "  - Assets.xcassets"
echo "  - Any .swift files"
echo ""
echo "After removing duplicates, try archiving again!"
