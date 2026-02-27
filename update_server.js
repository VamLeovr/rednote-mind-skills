const fs = require('fs');

let serverTs = fs.readFileSync('src/server.ts', 'utf8');

// 1. imports
serverTs = serverTs.replace(
  "import { getNoteContent, type NoteContentOptions } from './tools/noteContent';",
  "import { getNoteContent, type NoteContentOptions } from './tools/noteContent';\nimport { getBatchNotesFromUrls } from './tools/batchNotes';"
);

// 2. new tools
const compileArticleTool = `
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
  },`;

const batchGetNotesTool = `
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
  },`;

// replace tool array elements
serverTs = serverTs.replace(/\{\s*name:\s*'get_favorites_list'[\s\S]*?\},/, '');
serverTs = serverTs.replace(/\{\s*name:\s*'get_batch_notes_from_favorites'[\s\S]*?\},/, batchGetNotesTool); // replace one
serverTs = serverTs.replace(/\{\s*name:\s*'download_note_images'[\s\S]*?\}(?=\s*\];)/, compileArticleTool.trim()); // replace the last one and maintain array closure

// 3. new cases in switch statement
const batchGetNotesCase = `
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
      }`;

const compileArticleCase = `
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
      }`;

// replace cases
serverTs = serverTs.replace(/case 'get_favorites_list':[\s\S]*?(?=case 'get_note_content':)/, '');
serverTs = serverTs.replace(/case 'get_batch_notes_from_favorites':[\s\S]*?(?=case 'download_note_images':)/, batchGetNotesCase + '\n\n');
serverTs = serverTs.replace(/case 'download_note_images':[\s\S]*?(?=default:)/, compileArticleCase + '\n\n');

fs.writeFileSync('src/server.ts', serverTs);

