#!/bin/bash

# 自动化发布脚本
# 用法: ./release.sh [patch|minor|major]

set -e  # 遇到错误立即退出

VERSION_TYPE=${1:-patch}  # 默认 patch 版本

echo "======================================================================"
echo "Rednote-Mind-MCP 自动化发布脚本"
echo "======================================================================"
echo ""

# 检查是否有未提交的更改
if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️  警告: 有未提交的更改"
  git status --short
  echo ""
  read -p "是否继续？(y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ 取消发布"
    exit 1
  fi
fi

# 步骤 1: 编译项目
echo "📦 步骤 1: 编译项目"
echo "----------------------------------------------------------------------"
npm run build
echo "✅ 编译完成"
echo ""

# 步骤 2: 测试 VLM 功能
echo "🧪 步骤 2: 测试 VLM 功能"
echo "----------------------------------------------------------------------"
if [ -z "$ZZZ_API_KEY" ]; then
  echo "⚠️  警告: ZZZ_API_KEY 未设置，跳过 VLM 测试"
  echo "提示: 如需测试 VLM，请先设置环境变量:"
  echo "  export ZZZ_API_KEY=\"your_api_key_here\""
  echo ""
else
  npx ts-node test/test-vlm-api.ts
  echo "✅ VLM 测试通过"
  echo ""
fi

# 步骤 3: 更新版本号
echo "🔢 步骤 3: 更新版本号 ($VERSION_TYPE)"
echo "----------------------------------------------------------------------"
npm version $VERSION_TYPE -m "chore: bump version to %s - 智能图片大小控制和 VLM 集成"
NEW_VERSION=$(node -p "require('./package.json').version")
echo "✅ 版本已更新至: $NEW_VERSION"
echo ""

# 步骤 4: 推送到 GitHub
echo "📤 步骤 4: 推送到 GitHub"
echo "----------------------------------------------------------------------"
git push && git push --tags
echo "✅ 已推送到 GitHub"
echo ""

# 步骤 5: 发布到 npm
echo "🚀 步骤 5: 发布到 npm"
echo "----------------------------------------------------------------------"
npm whoami > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "❌ 错误: 未登录 npm"
  echo "请先运行: npm login"
  exit 1
fi

npm publish
echo "✅ 已发布到 npm"
echo ""

# 完成
echo "======================================================================"
echo "🎉 发布成功！"
echo "======================================================================"
echo ""
echo "版本: $NEW_VERSION"
echo "npm: https://www.npmjs.com/package/rednote-mind-mcp"
echo ""
echo "验证安装:"
echo "  npm install -g rednote-mind-mcp@latest"
echo "  rednote-mind-mcp --version"
echo ""
