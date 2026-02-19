#!/bin/bash

# 秘匿情報がステージングされていないかチェックするスクリプト

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "Checking for sensitive files in git staging..."
STAGED_FILES=$(git diff --cached --name-only)
echo "Staged files identified: $STAGED_FILES"

# チェック対象のファイル
SENSITIVE_FILES=("src/config/.env" "src/config/config.json")

FAILED=0

for file in "${SENSITIVE_FILES[@]}"; do
    if echo "$STAGED_FILES" | grep -q "^$file$"; then
        echo -e "${RED}[WARNING] $file is staged for commit!${NC}"
        FAILED=1
    fi
done

if [ $FAILED -eq 1 ]; then
    echo -e "${RED}Commit aborted. Please unstage sensitive files.${NC}"
    exit 1
else
    echo -e "${GREEN}No sensitive files detected in staging.${NC}"
    exit 0
fi
