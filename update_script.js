const fs = require('fs');

let serverTs = fs.readFileSync('src/server.ts', 'utf8');

// 1. imports
serverTs = serverTs.replace(
  "import { getNoteContent, type NoteContentOptions } from './tools/noteContent';",
  "import { getNoteContent, type NoteContentOptions } from './tools/noteContent';\nimport { getBatchNotesFromUrls } from './tools/batchNotes';"
);
serverTs = serverTs.replace(/import { getFavoritesList } from '\.\/tools\/favoritesList';\n/, '');
serverTs = serverTs.replace(/import { getBatchNotesFromFavorites } from '\.\/tools\/batchNotes';\n/, '');
serverTs = serverTs.replace(/import { downloadNoteImages, saveImagesToLocal, type ImageDownloadOptions } from '\.\/tools\/imageDownloader';\n/, '');

// 2. tools definition replacement
let toolsBlockStart = serverTs.indexOf('const tools: Tool[] = [');
let toolsBlockEnd = serverTs.indexOf('];', toolsBlockStart) + 2;
let beforeTools = serverTs.substring(0, toolsBlockStart);
let afterTools = serverTs.substring(toolsBlockEnd);

const newToolsDef = `const tools: Tool[] = [
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
    name: 'get_note_content',
    description: '获取笔记的完整内容。可选择是否包含图片和详细数据（标签、点赞、收藏、评论）。图片处理模式：original 返回压缩后的原始图片（Base64），vlm 使用 VLM 分析图片并返回文字描述（支持智增增 ZZZ_API_KEY、Jina JINA_API_KEY 或智谱 ZHIPU_API_KEY，按此优先级选择）。重要：必须使用从 get_favorites_list 或 search_notes_by_keyword 返回的带 xsec_token 参数的完整 URL，否则可能访问失败。',
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
    name: 'batch_get_notes',
    description: '批量获取多篇笔记的完整内容（文本+图片+互动数据）。输入搜索结果中的URL列表。',
    inputSchema: {
      type: 'object',
      properties: {
        noteUrls: { type: 'array', items: { type: 'string' } },
        includeImages: { type: 'boolean', default: true }
      },
      required: ['noteUrls']
    }
  },
  {
    name: 'compile_article',
    description: '将多篇笔记的内容和图片编排成一篇结构化的图文Markdown文章。生成"结论先行、层次清晰、层层递进"的内容，同时嵌入小红书的图片作为evidence。',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: '文章主题（如：东京旅游攻略）' },
        notesStr: { type: 'string', description: '笔记内容的JSON字符串（传入batch_get_notes的结果）' }
      },
      required: ['topic', 'notesStr']
    }
  }
];`;

serverTs = beforeTools + newToolsDef + afterTools;

// 3. switch case replacing
// get_favorites_list replace
serverTs = serverTs.replace(/case 'get_favorites_list':[\s\S]*?case 'get_note_content':/g, "case 'get_note_content':");

let switchContent = `
      case 'batch_get_notes': {
        const schema = z.object({
          noteUrls: z.array(z.string()),
          includeImages: z.boolean().default(true)
        });
        const { noteUrls, includeImages } = schema.parse(args);
        
        const result = await getBatchNotesFromUrls(currentPage, noteUrls, includeImages);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case 'compile_article': {
        const schema = z.object({
          topic: z.string(),
          notesStr: z.string()
        });
        const { topic, notesStr } = schema.parse(args);
        
        let notes;
        try {
          const parsed = JSON.parse(notesStr);
          notes = parsed.notes || parsed;
          if (!Array.isArray(notes)) notes = [notes];
        } catch (e) {
          throw new Error('解析 notesStr 失败，必须是有效的 JSON: ' + e);
        }

        let article = \`# \${topic}\\n\\n\`;
        article += \`> 本文整理自 \${notes.length} 篇高质量小红书笔记\\n\\n\`;
        
        article += \`## 💡 核心结论 (Conclusion First)\\n\\n\`;
        // Extract a brief summary dynamically based on titles/content
        notes.slice(0, 3).forEach((n: any) => {
          article += \`- **\${n.title || '重点'}**：\${(n.content || '').substring(0, 50)}...\\n\`;
        });
        article += \`\\n\`;

        article += \`## 📚 详细内容与 Evidence\\n\\n\`;
        
        notes.forEach((note: any, index: number) => {
          article += \`### 推荐 \${index + 1}: \${note.title || '无标题'}\\n\\n\`;
          
          // 互动数据
          article += \`**互动数据**: ❤️ \${note.likes || 0} | ⭐ \${note.collects || 0} | 💬 \${note.comments || 0}\\n\\n\`;
          
          // 内容
          const cleanContent = (note.content || '').replace(/\\n/g, '\\n> ');
          article += \`> \${cleanContent}\\n\\n\`;
          
          // 图片渲染 (Evidence)
          if (note.images && note.images.length > 0) {
            article += \`**Evidence Images:**\\n\\n\`;
            // Pick top 2 images to embed
            const imgsToEmbed = note.images.slice(0, 2);
            imgsToEmbed.forEach((img: any) => {
              if (img.url) { 
                if (img.base64) {
                   article += \`![图片](data:\${img.mimeType || 'image/jpeg'};base64,\${img.base64})\\n\\n\`;
                } else {
                   article += \`![图片](\${img.url})\\n\\n\`;
                }
              }
            });
          }
          
          article += \`---\\n\\n\`;
        });

        article += \`## 🔗 引用来源\\n\\n\`;
        notes.forEach((note: any, index: number) => {
          const authorName = note.author?.name || '未知作者';
          article += \`[\${index + 1}] [\${note.title}](\${note.url}) - 作者: \${authorName}\\n\`;
        });
        
        return {
          content: [{ type: 'text', text: article }]
        };
      }
`;

serverTs = serverTs.replace(/case 'get_batch_notes_from_favorites':[\s\S]*?default:/, switchContent + "\n      default:");

fs.writeFileSync('src/server.ts', serverTs);

let pkgJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkgJson.name = "rednote-search-mcp";
pkgJson.description = "小红书文章合成及搜索 MCP，专注搜索高赞笔记并排版出图文攻略";
pkgJson.version = "1.0.0";
fs.writeFileSync('package.json', JSON.stringify(pkgJson, null, 2));
