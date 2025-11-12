# 测试指南

本文档提供所有测试场景的完整指令。

---

## 🧪 VLM API 测试

### 1. 测试智谱 GLM-4V API

```bash
# 设置环境变量并运行测试
ZHIPU_API_KEY="your_api_key_here" npx ts-node test/test-zhipu-vlm.ts
```

**预期输出**：
- ✅ VLM 可用性检查通过
- ✅ 当前提供商显示为 "智谱清言 (glm-4v)"
- ✅ API 调用成功，返回图片分析结果
- 📊 显示 token 使用量和成本估算

---

### 2. 测试 VLM 提供商优先级

```bash
# 测试多提供商优先级机制
ZHIPU_API_KEY="your_api_key_here" npx ts-node test/test-vlm-priority.ts
```

**预期输出**：
- ✅ 场景 1：仅智谱 → 使用智谱清言
- ✅ 场景 2：同时配置 → 优先使用智增增
- ✅ 场景 3：回退机制正常

---

### 3. 测试智增增 API（如果有 API Key）

```bash
# 设置智增增 API Key
ZZZ_API_KEY="your_zzz_api_key_here" npx ts-node test/test-zhipu-vlm.ts
```

**预期输出**：
- ✅ 当前提供商显示为 "智增增 (qwen3-vl-235b-a22b-thinking)"

---

## 🔧 功能集成测试

### 4. 完整工作流测试

#### 步骤 1：登录小红书

```bash
# 运行登录向导
rednote-init
```

或

```bash
rednote-mind-mcp init
```

**预期**：
1. 自动打开浏览器窗口
2. 导航到小红书首页
3. 你扫码或密码登录
4. 自动保存 cookies 到 `~/.mcp/rednote/cookies.json`
5. 自动提取并保存用户 ID 到 `~/.mcp/rednote/config.json`

#### 步骤 2：配置 MCP 客户端

在 Claude Desktop 配置文件中添加：

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "rednote": {
      "command": "npx",
      "args": ["-y", "rednote-mind-mcp"]
    }
  }
}
```

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### 步骤 3：配置 VLM 环境变量（可选）

**macOS/Linux**:
```bash
# 在 ~/.zshrc 或 ~/.bashrc 中添加
export ZHIPU_API_KEY="your_api_key_here"

# 或使用智增增
export ZZZ_API_KEY="your_zzz_api_key_here"

# 重新加载配置
source ~/.zshrc
```

**Windows**:
```cmd
setx ZHIPU_API_KEY "your_api_key_here"
```

#### 步骤 4：重启 Claude Desktop

完全退出并重启 Claude Desktop。

#### 步骤 5：在 Claude Desktop 中测试

**测试 1：获取收藏夹列表**
```
请帮我获取小红书收藏夹中最近的 5 篇笔记
```

**测试 2：批量获取内容**
```
获取我收藏夹前 3 篇笔记的完整内容（包含图片）
```

**测试 3：使用 VLM 分析图片**
```
获取笔记 [从收藏夹获取的 URL]，使用 VLM 模式分析图片中的文字
```

**测试 4：搜索功能**
```
搜索"AI论文"关键词，获取最热门的 5 条结果
```

---

## 🐛 调试工具

### 5. 使用 MCP Inspector

```bash
# 安装 MCP Inspector
npm install -g @modelcontextprotocol/inspector

# 启动调试界面
mcp-inspector rednote-mind-mcp
```

在浏览器中打开显示的 URL，你可以：
- 📋 查看所有工具定义
- 🧪 交互式测试每个工具
- 📊 查看实时日志

---

## ✅ 单元测试（开发用）

### 6. 运行所有测试

```bash
# 构建项目
npm run build

# 运行特定测试
npx ts-node test/test-favorites-api.ts
npx ts-node test/test-note-content.ts
npx ts-node test/test-batch-notes.ts
```

---

## 🔍 故障排查

### 常见问题

**问题 1: VLM 提示 "请设置 API Key"**

解决方案：
```bash
# 检查环境变量是否设置
echo $ZHIPU_API_KEY
echo $ZZZ_API_KEY

# 如果为空，设置环境变量并重启客户端
export ZHIPU_API_KEY="your_key"
```

**问题 2: 登录失败或 Cookie 过期**

解决方案：
```bash
# 重新登录
rednote-init
```

**问题 3: API 调用失败 401/403**

检查：
1. API Key 是否有效
2. API Key 是否有访问权限
3. 账户余额是否充足

**问题 4: 网络连接失败**

检查：
1. 网络连接是否正常
2. 是否需要配置代理
3. 防火墙设置

---

## 📊 性能测试

### 7. 压力测试（谨慎使用）

```bash
# 批量获取 20 篇笔记（可能触发限流）
# 仅用于测试，不建议在生产环境使用
```

---

## 🔐 安全测试

### 8. API Key 隔离测试

```bash
# 测试未设置 API Key 时的行为
unset ZHIPU_API_KEY
unset ZZZ_API_KEY

# 运行测试，应该显示友好的错误提示
npx ts-node test/test-zhipu-vlm.ts
```

**预期输出**：
```
❌ 错误: 请设置 ZHIPU_API_KEY 环境变量
   使用方法: ZHIPU_API_KEY=your_key npx ts-node test/test-zhipu-vlm.ts
```

---

## 📝 测试清单

使用以下清单确保所有功能正常：

- [ ] 登录功能正常
- [ ] Cookie 自动保存
- [ ] 用户 ID 自动提取
- [ ] 收藏夹列表获取成功
- [ ] 笔记内容获取成功（包含图片）
- [ ] 图片压缩功能正常
- [ ] VLM API 调用成功（如果配置）
- [ ] 搜索功能正常
- [ ] 批量获取功能正常
- [ ] 错误处理友好
- [ ] MCP Inspector 可以正常连接
- [ ] Claude Desktop 集成成功

---

**最后更新**: 2025-11-10
**版本**: 0.2.9
