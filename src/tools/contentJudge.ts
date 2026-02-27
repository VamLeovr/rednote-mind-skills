/**
 * 内容质量判断模块
 * 使用 LLM 判断收集的素材是否足够回答用户问题
 */

import { chatWithLLM } from './vlmAnalyzer';
import { logger } from './logger';
import type { NoteContentWithImages } from '../types';

/**
 * 判断结果
 */
export interface JudgeResult {
  /** 是否足够 */
  isSufficient: boolean;
  /** 判断理由 */
  reason: string;
  /** 缺少的方面 */
  missingAspects: string[];
  /** 建议 */
  suggestions: string[];
}

/**
 * 判断内容是否足够回答用户问题
 *
 * @param question 用户问题
 * @param notes 收集到的笔记内容
 * @returns 判断结果
 */
export async function judgeContentSufficiency(
  question: string,
  notes: NoteContentWithImages[]
): Promise<JudgeResult> {
  logger.debug(`\n🔍 开始判断内容是否足够 (问题: ${question}, 笔记数: ${notes.length})`);

  // 构建上下文摘要
  const contextSummary = buildContextSummary(notes);

  const systemPrompt = `你是一个内容质量评估专家。你的任务是判断收集到的素材是否足够回答用户的问题。

评估标准：
1. 是否有足够多的参考来源（至少 5 篇以上不同角度的内容）
2. 内容是否覆盖用户问题的关键点
3. 是否有重复或低质量内容
4. 是否包含具体的推荐产品、价格、优缺点等实用信息

请基于以下标准给出判断。`;

  const userPrompt = `用户问题: ${question}

收集到的素材摘要:
${contextSummary}

请判断这些素材是否足够回答用户的问题。

请以 JSON 格式返回判断结果，格式如下：
{
  "isSufficient": true/false,
  "reason": "判断理由（50字以内）",
  "missingAspects": ["缺少的方面1", "缺少的方面2"],
  "suggestions": ["建议1", "建议2"]
}`;

  try {
    const response = await chatWithLLM(userPrompt, systemPrompt);

    // 解析 JSON 响应
    const result = parseJudgeResponse(response);

    logger.debug(`✅ 内容判断结果: ${result.isSufficient ? '足够' : '不足'}`);
    logger.debug(`   理由: ${result.reason}`);
    if (result.missingAspects.length > 0) {
      logger.debug(`   缺少: ${result.missingAspects.join(', ')}`);
    }

    return result;
  } catch (error: any) {
    logger.error(`内容判断失败: ${error.message}`);
    // 如果判断失败，返回保守结果（不够）
    return {
      isSufficient: notes.length >= 8, // 至少 8 篇才算足够
      reason: '判断失败，使用默认阈值',
      missingAspects: ['无法判断'],
      suggestions: ['增加更多参考内容']
    };
  }
}

/**
 * 构建笔记内容的摘要（用于发送给 LLM）
 */
function buildContextSummary(notes: NoteContentWithImages[]): string {
  const summaries: string[] = [];

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    const title = note.title || '无标题';
    const content = (note.content || '').substring(0, 300); // 限制长度
    const likes = note.likes || 0;
    const collects = note.collects || 0;

    // 提取提到的产品（简单关键词匹配）
    const products = extractProducts(content);

    summaries.push(`
--- 笔记 ${i + 1}: ${title} ---
热度: ❤️${likes} ⭐${collects}
产品: ${products.join(', ') || '未识别'}
内容: ${content}...
`);
  }

  return summaries.join('\n');
}

/**
 * 简单提取内容中的产品关键词
 */
function extractProducts(content: string): string[] {
  const productKeywords = [
    '扩展坞', '硬盘', '固态硬盘', '键盘', '鼠标', '显示器', '屏幕',
    '充电器', '网线', '数据线', '收纳包', '底座', '支架', '手柄',
    'SD卡', 'U盘', '贴膜', '散热', 'Hub', 'Dock', '贝尔金', '绿联',
    '阿卡西斯', '妙控', '触摸板', '小米', '三星', '西部数据'
  ];

  const found: string[] = [];
  for (const keyword of productKeywords) {
    if (content.includes(keyword)) {
      found.push(keyword);
    }
  }

  return [...new Set(found)].slice(0, 5); // 最多 5 个
}

/**
 * 解析 LLM 返回的判断结果
 */
function parseJudgeResponse(response: string): JudgeResult {
  try {
    // 尝试提取 JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        isSufficient: parsed.isSufficient === true,
        reason: parsed.reason || '无',
        missingAspects: parsed.missingAspects || [],
        suggestions: parsed.suggestions || []
      };
    }
  } catch (e) {
    logger.debug(`JSON 解析失败，尝试其他方式: ${e}`);
  }

  // 降级解析：根据关键词判断
  const isSufficient = response.includes('"isSufficient": true') ||
                       response.includes('"isSufficient":true') ||
                       response.toLowerCase().includes('sufficient') ||
                       response.toLowerCase().includes('足够');

  return {
    isSufficient,
    reason: '基于关键词解析',
    missingAspects: [],
    suggestions: []
  };
}

/**
 * 快速判断（不调用 LLM）
 * 用于初步筛选
 */
export function quickJudge(
  question: string,
  notes: NoteContentWithImages[]
): { pass: boolean; reason: string } {
  // 至少需要 5 篇笔记
  if (notes.length < 5) {
    return { pass: false, reason: `笔记数量不足 (${notes.length}/5)` };
  }

  // 检查内容长度
  const totalContentLength = notes.reduce((sum, n) => sum + (n.content?.length || 0), 0);
  if (totalContentLength < 1000) {
    return { pass: false, reason: `内容总长度不足 (${totalContentLength}/1000)` };
  }

  // 检查是否有图片
  const notesWithImages = notes.filter(n => n.images && n.images.length > 0);
  if (notesWithImages.length < notes.length * 0.5) {
    return { pass: false, reason: '缺少足够的图片证据' };
  }

  return { pass: true, reason: '快速检查通过' };
}
