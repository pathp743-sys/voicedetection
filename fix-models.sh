#!/bin/bash
# Run this once in your voicesense-pro repo root:
# bash fix-models.sh

echo "Fixing all model strings..."

# Replace every old model string with the correct one
find . -type f \( -name "*.ts" -o -name "*.tsx" \) \
  ! -path "*/node_modules/*" \
  ! -path "*/.next/*" \
  -exec sed -i \
    -e 's/claude-sonnet-4-20250514/claude-sonnet-4-6/g' \
    -e 's/claude-opus-4-20250514/claude-opus-4-6/g' \
    -e 's/claude-sonnet-4-0[^-]/claude-sonnet-4-6/g' \
    -e 's/claude-opus-4-0[^-]/claude-opus-4-6/g' \
  {} +

echo ""
echo "Current model strings in use:"
grep -rn "model: 'claude-" src/app/api/ 2>/dev/null || grep -rn "model: 'claude-" app/api/ 2>/dev/null

echo ""
echo "Committing and pushing..."
git add .
git commit -m "fix: replace all old model strings with claude-sonnet-4-6"
git push

echo ""
echo "Done! Vercel will redeploy automatically."
