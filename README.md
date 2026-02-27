# Rednote-Search-MCP (旅游攻略聚合器)

这是一个基于小红书（RedNote）的智能内容搜索与聚合 MCP (Model Context Protocol) 服务器。

它专为生成**图文并茂、结论先行的高质量旅游攻略/信息总结**而设计，能够自动搜索小红书笔记、按点赞量智能筛选高质量内容、批量抓取笔记的图文详情，并最终让大语言模型（如 Claude）将其编排为结构化呈现的 Markdown 攻略文章。

## 🌟 核心能力 (Core Features)

- **`search_notes_by_keyword`**: 小红书关键词高级搜索。不只是简单抓链接，它会智能滚动加载、提取笔记真实的"点赞量"(Likes)，并支持按最低点赞数 `minLikes` 过滤（带小众话题自适应降级），最终返回高质量候选池。
- **`batch_get_notes`**: 笔记批量抓取引擎。给定一组笔记 URL，自动突破反爬限制，批量获取含有图文、标签、互动数据的完整详情。
- **`compile_article`**: 攻略合成器。将批量获取到的零散笔记详情，自动合称为一篇结构化的 Markdown：
  - **结论先行**：提炼最核心结论
  - **图文并茂**：利用 Base64 或原文直链嵌入小红书原始图片作为 Evidence
  - **清晰溯源**：保留原作者及互动数据(赞/藏/评)作为高质量来源凭证

---

## 🚀 快速开始

### 1. 前置要求

- **Node.js**: >= 18
- **Claude Desktop** 或任何支持 MCP 生态的大模型客户端平台

### 2. 编译与运行

由于本项目是在原 `rednote-mind-mcp` 基础上迭代修改出的**专注搜索聚合版本**，你不需要走 NPM 全局安装安装，可以直接在本地目录里构建跑起来。

```bash
# 1. 安装依赖
npm install

# 2. 编译项目
npm run build
```

**首次使用必须建立扫码登录记录（获取 Cookie）：**

```bash
# 启动内置的登录向导
npm run start -- init
```
*在弹出的 Chrome 窗口中用小红书 APP 扫码登录。登录成功后，Cookies 会被自动保存在 `~/.mcp/rednote/cookies.json` 中供之后无头形式的搜索抓取使用。*

### 3. 在 Claude Desktop 中配置

修改你的 Claude Desktop 配置文件：
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

将本项目配置进 `mcpServers`，请确保将下面 args 数组里的 `/绝对路径/` 替换为你电脑上的实际位置：

```json
{
  "mcpServers": {
    "rednote-search": {
      "command": "node",
      "args": [
        "/Users/vamlevord/Developer/rednote-search/dist/server.js"
      ]
    }
  }
}
```

保存后，**完全退出并重启 Claude Desktop**。

---

## 🎯 最佳提问姿势 (Prompts)

在 Claude 中，你可以直接下达这种高复杂度的任务要求，Claude 会利用我们编写好的 3 个工具形成自动化流水线：

> "请帮我制定一份东京 5 日游的旅游攻略。请先在小红书搜索『东京旅游攻略 5天』，设定 minLikes 为 1000 以过滤掉低质量水贴，然后挑选排名前 3 的热门笔记批量获取详细内容，最后根据获取的内容，结合 compile_article 为我输出一篇图文并茂、结论先行的攻略文章。"

### 工具底层接力流转过程：
1. Claude 自动调用 `search_notes_by_keyword`，驱动底层 Playwright 滑动搜索页获取多条卡片，摘抄并按 Likes 排序过滤。
2. Claude 从结果里摘出优质资源的 URL，塞给 `batch_get_notes` 读取全量正文和多张大图。
3. Claude 将上一步返回的庞大数据 JSON 给到 `compile_article`，立刻输出格式精美的 Markdown 旅游攻略。

---

## 🔐 进阶配置与安全

- **访问频率约束（反爬兜底）**：工具中已经内置了严格且带随机延迟 (`1000ms - 3000ms`) 的爬取间隔。建议你在提示词里不要要求一次性处理超过 10 篇以上的笔记，以免你的真实小红书账号受到风控拦截。
- **自适应降级过滤**：如果你搜索了非常小众的话题（例如某偏门景点的历史），导致满足点赞数 `minLikes` 设定的帖子不足，引擎会自动报警并放弃该严苛阈值，保证你依然能拿到当前相对最好的那几篇内容来编排文章。
- **环境隔离**：运行该 MCP Server 不会强制接管你的本地社交媒体，只借助独立存储的 Cookie 临时通信。

---

> 基于 [@CopeeeTang 的 rednote-mind-mcp 项目](https://github.com/CopeeeTang/rednote-mind-mcp) 精简并彻底重构而成，去除了闲杂的推特与本地仓库知识库功能，重组聚焦于"信息搜索并生产高质图文排版文章"这一工作流。