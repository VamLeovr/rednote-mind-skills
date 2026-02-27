import 'dotenv/config';
import { chromium } from 'playwright';
import { loadSavedCookies } from './src/tools/auth';
import { searchNotesByKeyword } from './src/tools/search';
import { getBatchNotesFromUrls } from './src/tools/batchNotes';
import { judgeContentSufficiency, quickJudge, type JudgeResult } from './src/tools/contentJudge';
import path from 'path';

// ============================================================================
// 配置
// ============================================================================

const CONFIG = {
  // 用户问题（可以从外部传入）
  userQuestion: '溧阳南山竹海旅游攻略（景点、美食、住宿、路线）',
  topic: '溧阳南山竹海旅游攻略',

  // 搜索关键词
  keywords: '溧阳南山竹海 旅游 攻略',

  // 动态搜索配置
  initialLimit: 5,      // 初始搜索数量
  maxLimit: 30,         // 最大搜索数量
  increment: 5,         // 每次增加的数量

  // 快速判断阈值（不  quick调用 LLM）
Check: {
    minNotes: 5,
    minContentLength: 1000,
    minImageRatio: 0.5
  },

  // 输出目录
  outputDir: '/Users/vamlevord/Documents/Base/rednote-search',
  outputFile: '溧阳南山竹海旅游攻略.md'
};

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 清理文本中的废话和模板内容
 */
function cleanContent(content: string): string {
  if (!content) return '';

  const fluffPatterns = [
    // 数码产品废话
    /赚钱再升级/g, /经济不好/g, /就不要盲目加钱/g,
    /空闲时间的娱乐主要放在游戏上/g, /主打一个效率/g, /主打一个快准狠/g,
    /说走就走/g, /重整桌面/g, /新的一年整装出发/g,
    /是给自己安排了/g, /作为一名数码爱好者/g,
    /无论是日常通勤.*假期旅行/g, /拿起数码装备说走就走/g,
    /日常通勤、出差用笔记本比较多/g, /黑色炫酷的科技感外观/g,
    /兼容多个设备/g, /日常握持手感不错/g, /还有炫酷的RGB灯带/g,
    /身临其境/g, /是小时候的偶像/g, /不仅好看充电还快/g,
    /百元级的游戏手柄/g,
    // 旅游废话
    /治愈系/g, /放空自己/g, /逃离城市/g, /重新出发/g,
    /慢节奏/g, /享受生活/g, /仪式感/g,
    /绝绝子/g, /太好看了/g, /超级出片/g,
  ];

  let cleaned = content;
  fluffPatterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });

  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned.trim();
}

/**
 * 提取内容中的关键信息
 */
function extractKeyInfo(content: string): { products: string[], prices: string[] } {
  const products: string[] = [];
  const prices: string[] = [];

  const pricePattern = /(\d+\.?\d*元|\d+\.?\d*块|\d+\.?\d*¥)/g;
  let match;
  while ((match = pricePattern.exec(content)) !== null) {
    if (!prices.includes(match[0])) prices.push(match[0]);
  }

  const productKeywords = ['扩展坞', '硬盘', '键盘', '鼠标', '显示器', '屏幕', '充电器', '网线', '数据线', '收纳包', '底座', '支架', '手柄', 'SD卡', 'U盘', '贴膜', '散热'];

  productKeywords.forEach(keyword => {
    const productPattern = new RegExp(`[^\\n]{0,30}(${keyword})[^\\n]{0,30}`, 'g');
    while ((match = productPattern.exec(content)) !== null) {
      const snippet = match[0].trim();
      if (snippet.length > 5 && snippet.length < 50) products.push(snippet);
    }
  });

  return { products: [...new Set(products)], prices: [...new Set(prices)] };
}

// ============================================================================
// 动态搜索主流程
// ============================================================================

/**
 * 动态搜索并判断内容是否足够
 */
async function dynamicSearchAndJudge(
  page: any,
  question: string,
  keywords: string
): Promise<any[]> {
  let currentLimit = CONFIG.initialLimit;
  let allNotes: any[] = [];
  let iteration = 0;
  const maxIterations = Math.ceil((CONFIG.maxLimit - CONFIG.initialLimit) / CONFIG.increment) + 1;

  while (iteration < maxIterations) {
    iteration++;
    console.log(`\n📊 第 ${iteration} 轮搜索 (搜索数量: ${currentLimit})...`);

    // 1. 搜索
    const searchRes = await searchNotesByKeyword(
      page,
      keywords,
      currentLimit,
      'popular',
      20 // minLikes
    );

    if (searchRes.results.length === 0) {
      console.log('⚠️ 搜索结果为 0');
      break;
    }

    // 2. 获取内容
    const urls = searchRes.results.slice(0, currentLimit).map((r: any) => r.url);
    const batchRes = await getBatchNotesFromUrls(page, urls, true);
    const notes = batchRes.notes;

    console.log(`   获取到 ${notes.length} 篇笔记`);

    // 3. 快速判断（不调用 LLM）
    const quickResult = quickJudge(question, notes);
    console.log(`   快速检查: ${quickResult.pass ? '通过' : '失败'} - ${quickResult.reason}`);

    if (!quickResult.pass) {
      // 快速检查未通过，增加数量重试
      currentLimit = Math.min(currentLimit + CONFIG.increment, CONFIG.maxLimit);
      allNotes = notes;
      console.log(`   ⚠️ 快速检查未通过，增加搜索数量重试...`);
      continue;
    }

    // 4. LLM 判断（深度判断）
    console.log(`   🔍 调用 LLM 进行深度判断...`);
    try {
      const judgeResult = await judgeContentSufficiency(question, notes);
      console.log(`   LLM 判断: ${judgeResult.isSufficient ? '足够' : '不足'}`);
      console.log(`   理由: ${judgeResult.reason}`);

      if (judgeResult.isSufficient) {
        console.log(`   ✅ 内容足够，停止搜索`);
        return notes;
      } else {
        // LLM 判断不够，增加数量重试
        console.log(`   ⚠️ LLM 判断内容不足，增加搜索数量重试...`);
        if (judgeResult.missingAspects.length > 0) {
          console.log(`   缺少: ${judgeResult.missingAspects.join(', ')}`);
        }
        currentLimit = Math.min(currentLimit + CONFIG.increment, CONFIG.maxLimit);
        allNotes = notes;
      }
    } catch (error: any) {
      console.log(`   ⚠️ LLM 判断失败: ${error.message}，使用当前结果继续`);
      return notes;
    }
  }

  console.log(`\n⚠️ 已达到最大搜索次数 (${CONFIG.maxLimit})，使用当前收集的内容`);
  return allNotes;
}

// ============================================================================
// 文章生成
// ============================================================================

function generateArticle(topic: string, notes: any[]): string {
  const sortedNotes = [...notes].sort((a, b) => (b.likes || 0) - (a.likes || 0));

  // 收集产品信息
  const allProducts: { name: string, count: number, prices: string[] }[] = [];
  const allPrices: string[] = [];

  sortedNotes.forEach((note: any) => {
    const keyInfo = extractKeyInfo(cleanContent(note.content || ''));
    keyInfo.products.forEach(p => {
      const existing = allProducts.find(item => item.name === p);
      if (existing) {
        existing.count++;
        keyInfo.prices.forEach(price => {
          if (!existing.prices.includes(price)) existing.prices.push(price);
        });
      } else {
        allProducts.push({ name: p, count: 1, prices: keyInfo.prices });
      }
    });
    keyInfo.prices.forEach(price => {
      if (!allPrices.includes(price)) allPrices.push(price);
    });
  });

  const topProducts = allProducts.sort((a, b) => b.count - a.count).slice(0, 10);

  let article = `# ${topic}\n\n`;
  article += `> 本文整理自 ${notes.length} 篇高质量小红书笔记\n\n`;

  // 核心结论
  article += `## 💡 核心结论 (Conclusion First)\n\n`;

  if (topProducts.length > 0) {
    article += `### 热门配件推荐\n\n`;
    topProducts.forEach((p, idx) => {
      const priceStr = p.prices.length > 0 ? ` (${p.prices.join(', ')})` : '';
      article += `${idx + 1}. **${p.name}**${priceStr} - ${p.count} 篇笔记推荐\n`;
    });
    article += `\n`;
  }

  if (allPrices.length > 0) {
    article += `### 价格参考\n\n`;
    article += `预算范围参考: ${allPrices.slice(0, 8).join(', ')}\n\n`;
  }

  article += `---\n\n`;
  article += `## 📚 外设清单与详细解析\n\n`;

  // 详细推荐
  sortedNotes.forEach((note: any, index: number) => {
    const noteNum = index + 1;
    const authorName = note.author?.name || '未知作者';
    const likes = note.likes || 0;
    const collects = note.collects || 0;
    const comments = note.comments || 0;
    const noteUrl = note.url || '';

    const cleanedText = cleanContent(note.content || '');
    const keyInfo = extractKeyInfo(cleanedText);

    article += `### 推荐 ${noteNum}: ${note.title || '无标题'}\n`;
    article += `> 来源: [小红书](${noteUrl}) | 热度: ❤️${likes} ⭐${collects} 💬${comments} | 作者: ${authorName}\n\n`;

    if (keyInfo.products.length > 0) {
      article += `**涉及产品**: ${keyInfo.products.slice(0, 5).join(' | ')}\n\n`;
    }

    if (keyInfo.prices.length > 0) {
      article += `**价格参考**: ${keyInfo.prices.join(', ')}\n\n`;
    }

    if (cleanedText.length > 0) {
      const summary = cleanedText.length > 500 ? cleanedText.substring(0, 500) + '...' : cleanedText;
      article += `> ${summary.replace(/\n/g, '\n> ')}\n\n`;
    }

    if (note.images && note.images.length > 0) {
      article += `**实拍分享 (Evidence):**\n\n`;
      const imgsToEmbed = note.images.slice(0, 2);
      imgsToEmbed.forEach((img: any) => {
        let imgPath = img.localPath || img.url;
        if (imgPath) {
          if (imgPath.startsWith('/')) {
            const pathModule = require('path');
            const displayPath = pathModule.relative(CONFIG.outputDir, imgPath);
            imgPath = displayPath.startsWith('..') ? imgPath : displayPath;
          }
          article += `![图片](${imgPath})\n\n`;
        }
      });
    }

    article += `---\n\n`;
  });

  return article;
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  console.log('🔄 开始动态内容收集与判断...');
  console.log(`📝 用户问题: ${CONFIG.userQuestion}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  const cookies = await loadSavedCookies();
  if (cookies.length > 0) {
    await context.addCookies(cookies);
    console.log(`✅ 已加载登录凭证`);
  } else {
    throw new Error('未检测到登录凭据，请先登录小红书');
  }

  const page = await context.newPage();

  // 动态搜索与判断
  const notes = await dynamicSearchAndJudge(page, CONFIG.userQuestion, CONFIG.keywords);

  if (notes.length === 0) {
    throw new Error('未能收集到任何有效内容');
  }

  console.log(`\n📦 最终收集到 ${notes.length} 篇笔记，开始生成文章...`);

  // 生成文章
  const article = generateArticle(CONFIG.topic, notes);

  // 写入文件
  const fs = require('fs');
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }

  const outputPath = path.join(CONFIG.outputDir, CONFIG.outputFile);
  fs.writeFileSync(outputPath, article);
  console.log(`\n🎉 攻略已自动生成: ${outputPath}`);
  console.log(`📊 参考了 ${notes.length} 篇小红书笔记`);

  await browser.close();
}

main().catch(console.error);
