import { chromium, type BrowserContext, type Page } from 'playwright';
import { searchNotesByKeyword } from '../src/tools/search';
import { getBatchNotesFromUrls } from '../src/tools/batchNotes';
import { loadSavedCookies } from '../src/tools/auth';
import os from 'os';
import path from 'path';

async function main() {
  console.log('🧪 开始端到端测试: 搜索 -> 批量获取 -> 编译文章\n');
  
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  
  try {
    const cookies = await loadSavedCookies();
    if (cookies.length > 0) {
      await context.addCookies(cookies);
      console.log(`✅ 加载了 ${cookies.length} 个 Cookies`);
    } else {
      console.log('⚠️ 没找到 Cookies，可能导致只能搜到少部分内容');
    }
    
    const page = await context.newPage();
    
    // 1. 测试搜索并提取高赞
    console.log('\n🔍 [阶段 1] 搜索关键词 "AI论文"，目标 5 条...');
    const searchRes = await searchNotesByKeyword(page, 'AI论文', 5, 'popular', 10);
    console.log(`✅ 搜索完毕！实际获取: ${searchRes.results.length} 条`);
    searchRes.results.forEach((r, i) => {
      console.log(`  ${i+1}. ${r.title} (❤️ ${r.likes})`);
      console.log(`     URL: ${r.url}`);
    });
    
    if (searchRes.results.length === 0) {
      throw new Error('没有搜索到满足条件的笔记。');
    }

    // 只取最前面的 2 条来做批量获取测试，避免测试跑太久或被反爬封禁
    const targetUrls = searchRes.results.slice(0, 2).map(r => r.url);

    // 2. 测试批量获取
    console.log(`\n📦 [阶段 2] 批量获取 ${targetUrls.length} 篇笔记详情...`);
    const batchRes = await getBatchNotesFromUrls(page, targetUrls, true);
    console.log(`✅ 批量获取完成！成功: ${batchRes.successCount}, 失败: ${batchRes.failedCount}`);
    
    // 3. 测试文章编排逻辑 (Mock tool handler logic)
    console.log('\n📝 [阶段 3] 模拟 compile_article 拼接...');
    let article = `# AI论文 深度测试\n\n`;
    article += `> 本文整理自 ${batchRes.notes.length} 篇高质量小红书笔记\n\n`;
    article += `## 💡 核心结论 (Conclusion First)\n\n`;
    batchRes.notes.forEach((n: any) => {
      article += `- **${n.title || '重点'}**：${(n.content || '').substring(0, 50)}...\n`;
    });
    console.log('✅ 文章编译前序预览:');
    console.log('---');
    console.log(article);
    console.log('...');
    console.log('---\n✅ 测试全链路顺利跑通！');
    
  } catch (err) {
    console.error('❌ 测试出错:', err);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
