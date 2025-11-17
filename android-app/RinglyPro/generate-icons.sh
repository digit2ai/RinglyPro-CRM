#!/bin/bash

# Script to generate Android app icons from a source image
# Usage: ./generate-icons.sh path/to/source-icon.png

SOURCE_IMAGE="$1"

if [ -z "$SOURCE_IMAGE" ]; then
    echo "❌ Error: Please provide a source image"
    echo "Usage: ./generate-icons.sh path/to/source-icon.png"
    exit 1
fi

if [ ! -f "$SOURCE_IMAGE" ]; then
    echo "❌ Error: Source image not found: $SOURCE_IMAGE"
    exit 1
fi

# Check if ImageMagick is installed
if ! command -v convert &> /dev/null; then
    echo "❌ ImageMagick not found. Installing via Homebrew..."
    brew install imagemagick
fi

echo "🎨 Generating Android app icons..."

# Define icon sizes for different densities
declare -A SIZES=(
    ["mdpi"]="48"
    ["hdpi"]="72"
    ["xhdpi"]="96"
    ["xxhdpi"]="144"
    ["xxxhdpi"]="192"
)

# Base directory for resources
RES_DIR="app/src/main/res"

# Generate launcher icons
for density in "${!SIZES[@]}"; do
    size=${SIZES[$density]}
    output_dir="$RES_DIR/mipmap-$density"

    mkdir -p "$output_dir"

    echo "  → Generating ${density} (${size}x${size}px)"
    convert "$SOURCE_IMAGE" -resize "${size}x${size}" "$output_dir/ic_launcher.png"

    # Also create round icon
    convert "$SOURCE_IMAGE" -resize "${size}x${size}" \
        \( +clone -threshold -1 -negate -fill white -draw "circle $((size/2)),$((size/2)) $((size/2)),0" \) \
        -alpha off -compose copy_opacity -composite "$output_dir/ic_launcher_round.png"
done

# Generate Play Store icon (512x512)
echo "  → Generating Play Store icon (512x512px)"
mkdir -p "play-store-assets"
convert "$SOURCE_IMAGE" -resize "512x512" "play-store-assets/ic_launcher_512.png"

# Generate feature graphic template
echo "  → Generating feature graphic template (1024x500px)"
convert -size 1024x500 gradient:"#0b1e3e"-"#87ceeb" "play-store-assets/feature_graphic_template.png"

echo "✅ Icon generation complete!"
echo ""
echo "📁 Generated files:"
echo "   - App icons: app/src/main/res/mipmap-*/"
echo "   - Play Store icon: play-store-assets/ic_launcher_512.png"
echo "   - Feature graphic template: play-store-assets/feature_graphic_template.png"
echo ""
echo "📝 Next steps:"
echo "   1. Review the generated icons"
echo "   2. Create screenshots for Play Store listing"
echo "   3. Customize the feature graphic template"
