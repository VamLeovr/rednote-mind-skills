#!/usr/bin/env node

/**
 * RedNote-MCP Enhanced Server
 * MCP 服务器入口，支持收藏夹和图片下载
 */

// 设置 MCP 模式环境变量，禁用工具中的调试日志
process.env.MCP_MODE = 'true';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { z } from 'zod';

// MCP 要求 stdout 仅用于协议消息，这里把所有标准输出重定向到 stderr
const originalConsoleError = console.error.bind(console);
const redirectToStderr = (...args: unknown[]) => {
  originalConsoleError(...args);
};
console.log = redirectToStderr;
console.info = redirectToStderr;
console.debug = redirectToStderr;
console.warn = redirectToStderr;

// 导入工具函数
import { checkLoginStatus, loginToXiaohongshu, loadSavedCookies, hasSavedCookies } from './tools/auth';
import { searchNotesByKeyword } from './tools/search';
import { getFavoritesList } from './tools/favoritesList';
import { getNoteContent, type NoteContentOptions } from './tools/noteContent';
import { getBatchNotesFromFavorites } from './tools/batchNotes';
import { downloadNoteImages, saveImagesToLocal, type ImageDownloadOptions } from './tools/imageDownloader';
import type { NoteContentWithImages, ImageData } from './types';
import { analyzeImageWithVLM, analyzeImages, isVLMAvailable } from './tools/vlmAnalyzer';

// Cookie 存储路径
const COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json');

// 全局浏览器实例
let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

/**
 * MCP Content 类型定义
 */
type MCPContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

/**
 * 图片处理模式
 */
type ImageMode = 'original' | 'vlm';

/**
 * 将笔记内容转换为 MCP content 数组
 *
 * @param note 笔记内容（含图片）
 * @param imageMode 图片处理模式：original=返回原始图片，vlm=VLM分析文字描述
 * @returns MCP content 数组
 */
async function convertNoteToMCPContent(
  note: NoteContentWithImages,
  imageMode: ImageMode = 'original'
): Promise<MCPContent[]> {
  const content: MCPContent[] = [];

  // 1. 文本信息（标题、正文、元数据）
  let textContent = `# ${note.title}\n\n`;
  textContent += `**作者**: ${note.author.name}\n`;
  textContent += `**笔记ID**: ${note.noteId}\n`;
  textContent += `**URL**: ${note.url}\n\n`;

  if (note.tags && note.tags.length > 0) {
    textContent += `**标签**: ${note.tags.map(t => `#${t}`).join(' ')}\n\n`;
  }

  if (note.likes || note.collects || note.comments) {
    textContent += `**互动数据**:\n`;
    textContent += `- 点赞: ${note.likes || 0}\n`;
    textContent += `- 收藏: ${note.collects || 0}\n`;
    textContent += `- 评论: ${note.comments || 0}\n\n`;
  }

  textContent += `**正文**:\n${note.content}\n`;

  if (note.images && note.images.length > 0) {
    textContent += `\n**图片数量**: ${note.images.length} 张\n`;

    // 添加压缩统计信息
    const compressedImages = note.images.filter(img => img.compressionRatio !== undefined);
    if (compressedImages.length > 0) {
      const avgRatio = compressedImages.reduce((sum, img) => sum + (img.compressionRatio || 0), 0) / compressedImages.length;
      const totalOriginal = compressedImages.reduce((sum, img) => sum + (img.originalSize || 0), 0);
      const totalCompressed = compressedImages.reduce((sum, img) => sum + img.size, 0);

      textContent += `**压缩统计**:\n`;
      textContent += `- 原始总大小: ${(totalOriginal / 1024 / 1024).toFixed(2)} MB\n`;
      textContent += `- 压缩后大小: ${(totalCompressed / 1024 / 1024).toFixed(2)} MB\n`;
      textContent += `- 平均压缩率: ${avgRatio.toFixed(1)}%\n`;
    }
  }

  content.push({
    type: 'text',
    text: textContent
  });

  // 2. 图片处理：根据 imageMode 决定返回原始图片还是 VLM 分析
  if (note.images && note.images.length > 0) {
    if (imageMode === 'vlm') {
      // VLM 模式：分析所有图片并返回文字描述
      if (isVLMAvailable()) {
        try {
          console.error(`🔍 使用 VLM 分析 ${note.images.length} 张图片...`);

          const vlmResults = await analyzeImages(note.images);

          // 添加 VLM 分析结果作为文本
          let vlmText = `\n---\n## 🔍 VLM 图片分析结果\n\n`;
          vlmText += `共分析 ${note.images.length} 张图片：\n\n`;

          vlmResults.forEach((result, idx) => {
            vlmText += `### 图片 ${idx + 1}\n`;
            vlmText += `${result.description}\n\n`;

            if (result.textContent) {
              vlmText += `**提取的文字内容**:\n${result.textContent}\n\n`;
            }

            if (result.detectedObjects.length > 0) {
              vlmText += `**检测到的元素**: ${result.detectedObjects.join(', ')}\n\n`;
            }
          });

          content.push({
            type: 'text',
            text: vlmText
          });

          console.error(`✅ VLM 分析完成`);

        } catch (error: any) {
          console.error(`❌ VLM 分析失败: ${error.message}`);

          // VLM 失败时添加警告
          content.push({
            type: 'text',
            text: `\n⚠️ VLM 分析失败: ${error.message}\n`
          });
        }
      } else {
        // VLM 不可用时添加警告
        content.push({
          type: 'text',
          text: `\n⚠️ 无法使用 VLM 分析：请设置 ZZZ_API_KEY 或 ZHIPU_API_KEY 环境变量\n`
        });
      }
    } else {
      // Original 模式：返回压缩后的原始图片（Base64）
      for (const img of note.images) {
        content.push({
          type: 'image',
          data: img.base64,  // MCP 格式：直接 base64 字符串
          mimeType: img.mimeType
        });
      }

      // 添加大小统计信息
      const totalSize = note.images.reduce((sum, img) =>
        sum + Buffer.from(img.base64, 'base64').length, 0
      );
      console.error(`📊 返回图片: ${note.images.length} 张, 总大小: ${(totalSize / 1024).toFixed(1)}KB`);
    }
  }

  return content;
}

/**
 * 加载已保存的 cookies
 */
async function loadCookies() {
  return loadSavedCookies();
}

/**
 * 初始化浏览器
 */
async function initBrowser() {
  if (browser && page) {
    return page;
  }

  console.error('🚀 初始化浏览器...');

  browser = await chromium.launch({ headless: false }); // 使用有头模式以便调试
  context = await browser.newContext();

  // 加载 cookies
  const cookies = await loadCookies();
  if (cookies.length > 0) {
    await context.addCookies(cookies);
    console.error(`✅ 已加载 ${cookies.length} 个 cookies`);
  }

  page = await context.newPage();
  console.error('✅ 浏览器初始化完成\n');

  return page;
}

/**
 * 关闭浏览器
 */
async function closeBrowser() {
  if (page) {
    await page.close();
    page = null;
  }
  if (context) {
    await context.close();
    context = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
}

// 创建 MCP 服务器
const server = new Server(
  {
    name: 'rednote-mind-mcp',
    version: '0.2.9',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 定义工具列表
const tools: Tool[] = [
  {
    name: 'check_login_status',
    description: '检查小红书登录状态。返回是否已登录以及相关消息。',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'login',
    description: '登录小红书。会打开浏览器窗口引导用户扫码或密码登录，登录成功后会自动保存cookies供后续使用。',
    inputSchema: {
      type: 'object',
      properties: {
        timeout: {
          type: 'number',
          description: '等待用户完成登录的超时时间（毫秒），默认60秒',
          default: 60000,
          minimum: 30000,
          maximum: 120000
        }
      }
    }
  },
  {
    name: 'search_notes_by_keyword',
    description: '按关键词搜索小红书笔记。返回搜索结果列表（包含标题、URL、封面、作者）。',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: '搜索关键词'
        },
        limit: {
          type: 'number',
          description: '返回结果数量（默认 10，最大 50）',
          default: 10,
          minimum: 1,
          maximum: 50
        },
        sortType: {
          type: 'string',
          enum: ['general', 'popular', 'latest'],
          description: '排序方式：general（综合，默认）、popular（最热）、latest（最新）',
          default: 'general'
        }
      },
      required: ['keyword']
    }
  },
  {
    name: 'get_favorites_list',
    description: '从当前登录用户的收藏夹获取笔记列表。返回笔记的基本信息（标题、URL、封面等），但不包含详细内容和图片。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: '返回的笔记数量（默认 20，最大 50）',
          default: 20,
          minimum: 1,
          maximum: 50
        }
      }
    }
  },
  {
    name: 'get_note_content',
    description: '获取笔记的完整内容。可选择是否包含图片和详细数据（标签、点赞、收藏、评论）。图片处理模式：original 返回压缩后的原始图片（Base64），vlm 使用 VLM 分析图片并返回文字描述（支持智增增 ZZZ_API_KEY 或智谱 ZHIPU_API_KEY，优先使用智增增）。重要：必须使用从 get_favorites_list 或 search_notes_by_keyword 返回的带 xsec_token 参数的完整 URL，否则可能访问失败。',
    inputSchema: {
      type: 'object',
      properties: {
        noteUrl: {
          type: 'string',
          description: '笔记 URL（必须是从收藏夹或搜索结果中获取的带 xsec_token 参数的完整 URL，如：https://www.xiaohongshu.com/explore/xxx?xsec_token=...）'
        },
        includeImages: {
          type: 'boolean',
          description: '是否包含图片（默认 true）',
          default: true
        },
        includeData: {
          type: 'boolean',
          description: '是否包含详细数据（标签、点赞、收藏、评论数，默认 true）',
          default: true
        },
        imageMode: {
          type: 'string',
          description: '图片处理模式：original=返回原始图片Base64（默认），vlm=使用VLM分析并返回文字描述（支持智增增或智谱API）',
          enum: ['original', 'vlm'],
          default: 'original'
        },
        compressImages: {
          type: 'boolean',
          description: '是否压缩图片以节省传输体积（默认 true，强烈推荐）',
          default: true
        },
        imageQuality: {
          type: 'number',
          description: '图片压缩质量 50-95（默认 65，值越高质量越好但体积越大）',
          default: 65,
          minimum: 50,
          maximum: 95
        },
        maxImageSize: {
          type: 'number',
          description: '图片最大尺寸（像素，默认 1600）',
          default: 1600,
          minimum: 960,
          maximum: 2560
        }
      },
      required: ['noteUrl']
    }
  },
  {
    name: 'get_batch_notes_from_favorites',
    description: '从当前用户收藏夹批量获取笔记的完整内容（包含文本和图片）。此工具会自动调用 get_favorites_list 获取收藏列表，然后对每条笔记调用 get_note_content 获取详细内容。所有URL会自动包含 xsec_token 参数。适用于批量分析收藏的笔记。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: '获取的笔记数量（默认 10，建议不超过 20 以避免超时）',
          default: 10,
          minimum: 1,
          maximum: 20
        },
        includeImages: {
          type: 'boolean',
          description: '是否包含图片（默认 true）',
          default: true
        }
      }
    }
  },
  {
    name: 'download_note_images',
    description: '下载笔记的所有图片并保存到本地 ~/.mcp/rednote/images/{noteId}/ 目录，返回文件路径列表。包括轮播图中的所有图片。图片会自动压缩以节省存储空间。重要：必须使用从 get_favorites_list 或 search_notes_by_keyword 返回的带 xsec_token 参数的完整 URL，否则可能访问失败。',
    inputSchema: {
      type: 'object',
      properties: {
        noteUrl: {
          type: 'string',
          description: '笔记 URL（必须是从收藏夹或搜索结果中获取的带 xsec_token 参数的完整 URL）'
        },
        compressImages: {
          type: 'boolean',
          description: '是否压缩图片（默认 true）',
          default: true
        },
        imageQuality: {
          type: 'number',
          description: '图片压缩质量 50-95（默认 75）',
          default: 75,
          minimum: 50,
          maximum: 95
        },
        maxImageSize: {
          type: 'number',
          description: '图片最大尺寸（像素，默认 1920）',
          default: 1920,
          minimum: 960,
          maximum: 2560
        }
      },
      required: ['noteUrl']
    }
  }
];

// 注册工具列表处理器
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// 注册工具调用处理器
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // 登录和状态检查工具不需要浏览器初始化
    switch (name) {
      case 'check_login_status': {
        const currentPage = await initBrowser();
        const status = await checkLoginStatus(currentPage);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(status, null, 2)
            }
          ]
        };
      }

      case 'login': {
        const schema = z.object({
          timeout: z.number().min(30000).max(120000).default(60000)
        });
        const { timeout } = schema.parse(args);

        const currentPage = await initBrowser();
        const result = await loginToXiaohongshu(currentPage, timeout);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }
    }

    // 其他工具需要登录后才能使用
    if (!hasSavedCookies()) {
      throw new Error('未登录。请先使用 login 工具登录小红书');
    }

    // 确保浏览器已初始化
    const currentPage = await initBrowser();

    switch (name) {
      case 'search_notes_by_keyword': {
        const schema = z.object({
          keyword: z.string(),
          limit: z.number().min(1).max(50).default(10),
          sortType: z.enum(['general', 'popular', 'latest']).default('general')
        });
        const { keyword, limit, sortType } = schema.parse(args);

        const searchResults = await searchNotesByKeyword(currentPage, keyword, limit, sortType);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(searchResults, null, 2)
            }
          ]
        };
      }

      case 'get_favorites_list': {
        const schema = z.object({
          limit: z.number().min(1).max(50).default(20)
        });
        const { limit } = schema.parse(args);

        const favorites = await getFavoritesList(currentPage, undefined, limit);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(favorites, null, 2)
            }
          ]
        };
      }

      case 'get_note_content': {
        const schema = z.object({
          noteUrl: z.string(),
          includeImages: z.boolean().default(true),
          includeData: z.boolean().default(true),
          imageMode: z.enum(['original', 'vlm']).default('original'),
          compressImages: z.boolean().default(true),
          imageQuality: z.number().min(50).max(95).default(65),
          maxImageSize: z.number().min(960).max(2560).default(1600)
        });
        const { noteUrl, includeImages, includeData, imageMode, compressImages, imageQuality, maxImageSize } = schema.parse(args);

        const options: NoteContentOptions = {
          includeImages,
          includeData,
          compressImages,
          imageQuality,
          maxImageSize
        };

        const noteContent = await getNoteContent(currentPage, noteUrl, options);

        // 使用 MCP content 格式返回，根据 imageMode 处理图片
        return {
          content: await convertNoteToMCPContent(noteContent, imageMode as ImageMode)
        };
      }

      case 'get_batch_notes_from_favorites': {
        const schema = z.object({
          limit: z.number().min(1).max(20).default(10),
          includeImages: z.boolean().default(true)
        });
        const { limit, includeImages } = schema.parse(args);

        const result = await getBatchNotesFromFavorites(currentPage, undefined, limit, includeImages);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case 'download_note_images': {
        const schema = z.object({
          noteUrl: z.string(),
          compressImages: z.boolean().default(true),
          imageQuality: z.number().min(50).max(95).default(75),
          maxImageSize: z.number().min(960).max(2560).default(1920)
        });
        const { noteUrl, compressImages, imageQuality, maxImageSize } = schema.parse(args);

        const options: ImageDownloadOptions = {
          warmup: true,
          compressImages,
          imageQuality,
          maxImageSize
        };

        const images = await downloadNoteImages(currentPage, noteUrl, options);

        // 提取笔记 ID（从 URL 中提取 /explore/ 后面的部分）
        const noteIdMatch = noteUrl.match(/\/explore\/([a-f0-9]+)/);
        const noteId = noteIdMatch ? noteIdMatch[1] : `note_${Date.now()}`;

        // 保存图片到本地并获取文件路径
        const savedPaths = saveImagesToLocal(images, noteId);

        // 返回文件路径列表和统计信息
        let resultText = `# 图片下载完成\n\n`;
        resultText += `**笔记 ID**: ${noteId}\n`;
        resultText += `**图片数量**: ${images.length} 张\n`;
        resultText += `**保存位置**: ~/.mcp/rednote/images/${noteId}/\n\n`;

        // 添加压缩统计
        const compressedImages = images.filter(img => img.compressionRatio !== undefined);
        if (compressedImages.length > 0) {
          const totalOriginal = compressedImages.reduce((sum, img) => sum + (img.originalSize || 0), 0);
          const totalCompressed = compressedImages.reduce((sum, img) => sum + img.size, 0);
          const avgRatio = compressedImages.reduce((sum, img) => sum + (img.compressionRatio || 0), 0) / compressedImages.length;

          resultText += `**压缩统计**:\n`;
          resultText += `- 原始总大小: ${(totalOriginal / 1024 / 1024).toFixed(2)} MB\n`;
          resultText += `- 压缩后大小: ${(totalCompressed / 1024 / 1024).toFixed(2)} MB\n`;
          resultText += `- 平均压缩率: ${avgRatio.toFixed(1)}%\n\n`;
        }

        resultText += `## 文件路径列表\n\n`;
        savedPaths.forEach((filePath, idx) => {
          const img = images[idx];
          resultText += `**图片 ${idx + 1}**: \`${filePath}\`\n`;
          if (img.width && img.height) {
            resultText += `- 尺寸: ${img.width}x${img.height}\n`;
          }
          resultText += `- 大小: ${(img.size / 1024).toFixed(2)} KB\n`;
          if (img.compressionRatio) {
            resultText += `- 压缩率: ${img.compressionRatio.toFixed(1)}%\n`;
          }
          resultText += `\n`;
        });

        return {
          content: [
            {
              type: 'text',
              text: resultText
            }
          ]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
});

// 启动服务器
async function main() {
  // 检查登录状态（启动时提示，但不阻塞）
  if (!hasSavedCookies()) {
    console.error('⚠️  警告：未检测到登录凭证');
    console.error('');
    console.error('首次使用请运行以下命令登录小红书：');
    console.error('  rednote-mind-mcp init');
    console.error('  或');
    console.error('  rednote-init');
    console.error('');
    console.error('登录后，所有工具将自动可用。');
    console.error('');
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('🚀 Rednote-Mind-MCP Server 已启动');
  console.error('📦 版本: 0.2.9');
  console.error('🔧 支持的工具:');
  tools.forEach(tool => {
    console.error(`  - ${tool.name}: ${tool.description}`);
  });
  console.error('');
}

// 处理退出信号
process.on('SIGINT', async () => {
  console.error('\n正在关闭...');
  await closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('\n正在关闭...');
  await closeBrowser();
  process.exit(0);
});

// 启动
main().catch((error) => {
  console.error('启动失败:', error);
  process.exit(1);
});
