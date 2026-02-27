/**
 * 搜索工具
 * 基于小红书网页端搜索功能
 */

import type { Page } from 'playwright';
import { logger } from './logger';
import type { SearchResult, SearchResultNote } from '../types';
import { TIMING } from './constants';

/**
 * 按关键词搜索笔记
 *
 * @param page Playwright Page 实例
 * @param keyword 搜索关键词
 * @param limit 返回结果数量（默认 10）
 * @param sortType 排序方式（默认 'general'）
 * @returns 搜索结果
 *
 * @example
 * ```typescript
 * const results = await searchNotesByKeyword(page, 'AI论文', 10, 'popular');
 * logger.debug(`找到 ${results.results.length} 条结果`);
 * ```
 */
export async function searchNotesByKeyword(
  page: Page,
  keyword: string,
  limit: number = 10,
  sortType: 'general' | 'popular' | 'latest' = 'general',
  minLikes: number = 0
): Promise<SearchResult> {
  logger.debug(`\n🔍 搜索关键词: "${keyword}"`);
  logger.debug(`  📊 获取数量: ${limit} 条`);
  logger.debug(`  📈 排序方式: ${sortType}\n`);

  try {
    // 1. 访问搜索页面
    const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_search_result_notes`;
    logger.debug(`  🌐 访问搜索页面...`);

    await page.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // 2. 等待搜索结果加载
    logger.debug(`  ⏳ 等待搜索结果加载...`);
    await page.waitForTimeout(TIMING.SEARCH_RESULT_RENDER_MS); // 等待页面JavaScript渲染

    // 3. 处理排序（如果需要）
    if (sortType !== 'general') {
      logger.debug(`  🔄 切换排序方式: ${sortType}...`);
      try {
        // 根据sortType点击对应的排序按钮
        const sortMap: Record<string, string> = {
          'popular': '最热',
          'latest': '最新'
        };

        const sortText = sortMap[sortType];
        if (sortText) {
          // 查找并点击排序按钮
          await page.evaluate((text) => {
            const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
            const sortButton = buttons.find(btn => btn.textContent?.includes(text));
            if (sortButton && sortButton instanceof HTMLElement) {
              sortButton.click();
            }
          }, sortText);

          await page.waitForTimeout(TIMING.SEARCH_SORT_DELAY_MS); // 等待排序结果加载
        }
      } catch (error) {
        logger.debug(`  ⚠️ 排序切换失败，使用默认排序`);
      }
    }

    // 4. 滚动页面加载更多结果（如果需要）
    if (limit > 20) {
      logger.debug(`  📜 滚动加载更多结果...`);
      let collectedCount = await page.evaluate(() => document.querySelectorAll('section.note-item, [class*="note-item"]').length);
      const maxScrolls = Math.ceil(limit / 20); // 每屏约20条

      for (let scroll = 0; scroll < maxScrolls; scroll++) {
        await page.evaluate(() => window.scrollBy(0, 1500));
        await page.waitForTimeout(TIMING.SEARCH_SCROLL_DELAY_MS);
        collectedCount = await page.evaluate(() => document.querySelectorAll('section.note-item, [class*="note-item"]').length);
        logger.debug(`  📜 第 ${scroll + 1} 次滚动，当前加载 ${collectedCount} 条`);
      }
    }

    // 5. 查找笔记元素
    logger.debug(`  🔍 查找笔记元素...`);
    const containerSelectors = [
      'section.note-item',
      '[class*="note-item"]',
      '[class*="search-item"]',
      '[class*="feed-item"]'
    ];

    let noteElements: any[] = [];
    for (const selector of containerSelectors) {
      noteElements = await page.$$(selector);
      if (noteElements.length > 0) {
        logger.debug(`  ✅ 找到 ${noteElements.length} 个笔记元素 (选择器: ${selector})`);
        break;
      }
    }

    // 备用方案：直接查找链接
    if (noteElements.length === 0) {
      const links = await page.$$('a[href*="/explore/"]');
      noteElements = links.slice(0, limit);
      logger.debug(`  ✅ 找到 ${noteElements.length} 个笔记链接`);
    }

    // 6. 悬停触发链接加载，提取xsec_token
    logger.debug(`  🖱️  悬停笔记提取URL...`);
    const hoverCount = Math.min(noteElements.length, limit);

    for (let i = 0; i < hoverCount; i++) {
      try {
        await noteElements[i].hover();

        // 随机延迟，模拟人类行为，避免触发反爬
        const randomDelay =
          TIMING.HOVER_DELAY_MIN_MS +
          Math.random() * (TIMING.HOVER_DELAY_MAX_MS - TIMING.HOVER_DELAY_MIN_MS);
        await page.waitForTimeout(randomDelay);

        if ((i + 1) % TIMING.HOVER_BATCH_SIZE === 0) {
          // 每一批额外暂停，避免频率过高
          logger.debug(`  ⏳ 已悬停 ${i + 1}/${hoverCount}，暂停片刻...`);
          const batchPause =
            TIMING.HOVER_BATCH_PAUSE_MIN_MS +
            Math.random() * (TIMING.HOVER_BATCH_PAUSE_MAX_MS - TIMING.HOVER_BATCH_PAUSE_MIN_MS);
          await page.waitForTimeout(batchPause);
        }
      } catch (error) {
        // 继续处理下一个
      }
    }
    logger.debug(`  ✅ 已悬停 ${hoverCount} 个笔记元素\n`);

    // 7. 提取搜索结果（包含xsec_token的URL）
    logger.debug(`  📦 提取搜索结果...`);
    const rawData = await page.evaluate((maxResults) => {
      const items = Array.from(document.querySelectorAll('section.note-item, [class*="note-item"]')).slice(0, maxResults);

      return items.map((item, idx) => {
        // 查找所有链接
        const allLinks = Array.from(item.querySelectorAll('a')) as HTMLAnchorElement[];

        let noteUrl = '';
        let noteId = '';
        let xsecToken = '';

        for (const link of allLinks) {
          const href = link.href || link.getAttribute('href') || '';

          // 提取带 xsec_token 的悬停链接（搜索页面使用 /search_result/ 路径）
          if (href.includes('xsec_token=') && href.includes('/search_result/')) {
            const noteIdMatch = href.match(/\/search_result\/([a-zA-Z0-9]+)/);
            const tokenMatch = href.match(/xsec_token=([^&]+)/);

            if (noteIdMatch && noteIdMatch[1] && noteIdMatch[1].length >= 20) {
              noteId = noteIdMatch[1];
              if (tokenMatch && tokenMatch[1]) {
                xsecToken = decodeURIComponent(tokenMatch[1]);
              }
            }
          }

          // 提取带 xsec_token 的 explore 链接（备用）
          if (href.includes('xsec_token=') && href.includes('/explore/') && !noteId) {
            const noteIdMatch = href.match(/\/explore\/([a-zA-Z0-9]+)/);
            const tokenMatch = href.match(/xsec_token=([^&]+)/);

            if (noteIdMatch && noteIdMatch[1] && noteIdMatch[1].length >= 20) {
              noteId = noteIdMatch[1];
              if (tokenMatch && tokenMatch[1]) {
                xsecToken = decodeURIComponent(tokenMatch[1]);
              }
            }
          }

          // 备用：获取普通 explore 链接
          if (href.includes('/explore/') && !noteId) {
            const noteIdMatch = href.match(/\/explore\/([a-zA-Z0-9]+)/);
            if (noteIdMatch && noteIdMatch[1] && noteIdMatch[1].length >= 20) {
              noteId = noteIdMatch[1];
            }
          }
        }

        // 构造最终URL：使用 explore URL + token 参数
        if (noteId) {
          if (xsecToken) {
            // 构造带 token 的 explore URL，添加 xsec_source=pc_search
            noteUrl = `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=${encodeURIComponent(xsecToken)}&xsec_source=pc_search`;
          } else {
            // 没有token就用基本的 explore URL
            noteUrl = `https://www.xiaohongshu.com/explore/${noteId}`;
          }
        }

        // 提取标题
        const titleEl = item.querySelector('[class*="title"]') ||
                       item.querySelector('[class*="content"]') ||
                       item.querySelector('a[href*="/explore/"]');
        const title = titleEl?.textContent?.trim() || `笔记 ${idx + 1}`;

        // 提取封面
        const imgEl = item.querySelector('img') as HTMLImageElement;
        const cover = imgEl?.src || '';

        // 提取作者信息
        const authorNameEl = item.querySelector('[class*="author"]') ||
                            item.querySelector('[class*="user"]');
        const authorLinkEl = item.querySelector('a[href*="/user/profile/"]') as HTMLAnchorElement;

        const author = {
          name: authorNameEl?.textContent?.trim() || '未知作者',
          url: authorLinkEl?.href || ''
        };

        const likeCountEl = item.querySelector('[class*="like-count"], [class*="like"] span, [class*="liked-count"]');
        const likeText = likeCountEl?.textContent?.trim() || '0';
        const numericPart = likeText.replace(/[^\d.]/g, '');
        const multiplier = (likeText.includes('万') || likeText.includes('萬')) ? 10000
                         : likeText.toLowerCase().includes('k') ? 1000
                         : 1;
        const likes = Number.isFinite(parseFloat(numericPart))
          ? Math.round(parseFloat(numericPart) * multiplier)
          : 0;

        return {
          title,
          url: noteUrl,
          noteId,
          cover,
          author,
          likes
        };
      });
    }, Math.min(limit * 3, 150)); // Fetch more so we can filter and sort

    logger.debug(`\n  📊 提取结果: 共 ${rawData.length} 条`);

    // 过滤掉没有 URL 的条目，过滤 minLikes，按 likes 降序，并截取 limit
    let results = rawData.filter(note => note.url && note.noteId);
    
    // 智能过滤：如果按 minLikes 过滤后结果太少（少于请求 limit 的一半，或少于 3 条），则降低或放弃阈值
    const filteredResults = results.filter(note => note.likes >= minLikes);
    if (minLikes > 0 && filteredResults.length < Math.min(limit / 2, 3)) {
      logger.debug(`  ⚠️ 满足 minLikes=${minLikes} 的结果太少 (${filteredResults.length} 条)，将自动放宽限制`);
      // 不做 minLikes 过滤，直接使用全部有效结果
    } else {
      results = filteredResults;
    }

    results = results
      .sort((a, b) => b.likes - a.likes)
      .slice(0, limit);

    logger.debug(`  ✅ 有效笔记: ${results.length} 条\n`);

    logger.debug(`\n✅ 搜索完成！找到 ${results.length} 条结果\n`);

    return {
      keyword,
      resultCount: results.length,
      results
    };

  } catch (error: any) {
    logger.debug(`\n❌ 搜索失败: ${error.message}\n`);
    throw new Error(`搜索失败: ${error.message}`);
  }
}
