#!/bin/bash

# BPMN Component Copy Script
# This script helps you copy the BPMN component to other projects

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}BPMN Component Copy Tool${NC}"
echo "================================"

# Check if target directory is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: Please provide a target directory${NC}"
    echo "Usage: $0 <target-project-path>"
    echo "Example: $0 /path/to/your/project/src"
    exit 1
fi

TARGET_DIR="$1"
SOURCE_DIR="$(dirname "$0")"

# Check if target directory exists
if [ ! -d "$TARGET_DIR" ]; then
    echo -e "${RED}Error: Target directory does not exist: $TARGET_DIR${NC}"
    exit 1
fi

# Check if target already has a bpmn folder
if [ -d "$TARGET_DIR/bpmn" ]; then
    echo -e "${YELLOW}Warning: Target already has a 'bpmn' folder${NC}"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Operation cancelled"
        exit 1
    fi
    rm -rf "$TARGET_DIR/bpmn"
fi

# Copy the BPMN component
echo "Copying BPMN component to $TARGET_DIR..."
cp -r "$SOURCE_DIR" "$TARGET_DIR/bpmn"

# Remove script files from target
rm -f "$TARGET_DIR/bpmn/copy-to-project.sh"
rm -f "$TARGET_DIR/bpmn/example-integration.jsx"

echo -e "${GREEN}✓ BPMN component copied successfully!${NC}"
echo ""
echo "Next steps:"
echo "1. Install required dependencies in your project:"
echo "   npm install react reactflow lucide-react"
echo ""
echo "2. Import and use the component:"
echo "   import BPMN from './bpmn/BPMN';"
echo ""
echo "3. Use it in your JSX:"
echo "   <BPMN initialTheme=\"auto\" />"
echo ""
echo "See $TARGET_DIR/bpmn/README.md for detailed usage instructions."
