#!/bin/bash
# OpenJaws Launcher Script
# Launches an installed OpenJaws binary from your local bin directory
# Run this once to verify the installation path, then use openjaws directly

SOURCE_DIR="$HOME/.local/bin"
SOURCE="$SOURCE_DIR/openjaws"
TARGET="$SOURCE_DIR/openjaws"
CONFIG_DIR="$HOME/.openjaws"

# Check if source exists
if [ ! -f "$SOURCE" ]; then
    echo "Error: OpenJaws binary not found at $SOURCE"
    echo "Please install OpenJaws first: https://openjaws.dev/install"
    exit 1
fi

chmod +x "$TARGET"
echo "OpenJaws binary ready: $TARGET"

# Create config directory if needed
if [ ! -d "$CONFIG_DIR" ]; then
    echo "Creating config directory: $CONFIG_DIR"
    mkdir -p "$CONFIG_DIR"
fi

echo ""
echo "OpenJaws is ready!"
echo ""
echo "To run OpenJaws:"
echo "  $TARGET [options]"
echo ""
echo "Config directory: $CONFIG_DIR"
echo ""
echo "To customize the config directory, set OPENJAWS_CONFIG_DIR if your build supports it."
echo "For example: export OPENJAWS_CONFIG_DIR=\$HOME/.openjaws-custom"
echo ""
echo "Note: OpenJaws can run from any shell session that can read this config directory."
