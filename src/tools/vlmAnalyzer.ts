/**
 * VLM (Vision Language Model) 图片分析模块
 * 使用智增增 API (Qwen VL) 预分析图片内容，提取文字和结构化描述
 * 这是一个可选功能，需要设置 ZZZ_API_KEY 环境变量
 */

import { logger } from './logger';
import type { VLMAnalysisResult, ImageData } from '../types';

/**
 * 智增增 API 配置
 */
const ZZZ_API_URL = 'https://api.zhizengzeng.com/v1/chat/completions';
const ZZZ_VLM_MODEL = 'qwen3-vl-235b-a22b-thinking';

/**
 * 检查 VLM 功能是否可用
 */
export function isVLMAvailable(): boolean {
  return !!process.env.ZZZ_API_KEY;
}

/**
 * 使用 VLM 分析单张图片
 *
 * @param imageBase64 图片的 Base64 编码
 * @param mimeType 图片 MIME 类型
 * @param customPrompt 自定义分析提示词（可选）
 * @returns VLM 分析结果
 */
export async function analyzeImageWithVLM(
  imageBase64: string,
  mimeType: string = 'image/jpeg',
  customPrompt?: string
): Promise<VLMAnalysisResult> {

  if (!process.env.ZZZ_API_KEY) {
    throw new Error('VLM 功能不可用：请设置 ZZZ_API_KEY 环境变量');
  }

  // 默认提示词：提取文字和描述图片内容
  const defaultPrompt = `请详细分析这张图片，并提供以下信息：

1. 图片中是否包含文字？如果有，请逐字提取所有可见文字（包括中英文）
2. 图片的主要内容和场景描述
3. 图片中的关键对象、元素或主题
4. 图片的类型（如：截图、照片、图表、设计稿等）

请以结构化的方式回答，清晰明了。`;

  const prompt = customPrompt || defaultPrompt;

  try {
    logger.debug(`🔍 使用智增增 VLM (${ZZZ_VLM_MODEL}) 分析图片...`);

    // 构建符合 OpenAI vision 格式的请求
    const requestBody = {
      model: ZZZ_VLM_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ],
      max_tokens: 1024
    };

    // 调用智增增 API
    logger.debug(`调用 API: ${ZZZ_API_URL}`);
    logger.debug(`请求体大小: ${JSON.stringify(requestBody).length} 字节`);

    const response = await fetch(ZZZ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ZZZ_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    logger.debug(`响应状态: ${response.status} ${response.statusText}`);

    const data = await response.json();

    // 调试：打印完整响应
    logger.debug('智增增 API 原始响应:', JSON.stringify(data, null, 2));

    // 检查 API 错误
    if (data.error) {
      const errorMsg = data.error.message || JSON.stringify(data.error);
      logger.error('智增增 API 错误:', errorMsg);
      throw new Error(`智增增 API 错误: ${errorMsg}`);
    }

    // 检查 HTTP 状态
    if (!response.ok) {
      throw new Error(`智增增 API 调用失败: ${response.status} ${JSON.stringify(data)}`);
    }

    // 提取响应文本
    const responseText = data.choices?.[0]?.message?.content || '';

    if (!responseText) {
      logger.error('VLM 响应结构异常:', JSON.stringify(data, null, 2));
      throw new Error('VLM 返回空响应，响应结构: ' + JSON.stringify(data));
    }

    logger.debug(`✅ VLM 分析完成 (使用 tokens: ${data.usage?.total_tokens || 'N/A'})`);

    // 解析结果
    const hasText = responseText.toLowerCase().includes('文字') ||
                    responseText.toLowerCase().includes('text') ||
                    /包含|存在|有.*文字/.test(responseText);

    // 简单提取文本内容
    const textContent = extractTextFromVLMResponse(responseText);
    const detectedObjects = extractObjectsFromVLMResponse(responseText);

    return {
      hasText,
      textContent,
      description: responseText,
      detectedObjects,
      confidence: 0.85
    };

  } catch (error: any) {
    logger.error(`VLM 分析失败: ${error.message}`);
    logger.error(`错误详情: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);

    // 提供更友好的错误提示
    if (error.message.includes('fetch failed')) {
      throw new Error(`VLM API 调用失败 (网络错误): ${error.message}. 请检查: 1) 网络连接, 2) API 端点是否正确, 3) 是否需要代理`);
    }

    throw new Error(`VLM 分析失败: ${error.message}`);
  }
}

/**
 * 批量分析图片
 *
 * @param images 图片数据数组
 * @param customPrompt 自定义分析提示词（可选）
 * @returns 分析结果数组
 */
export async function analyzeImages(
  images: ImageData[],
  customPrompt?: string
): Promise<VLMAnalysisResult[]> {
  if (!isVLMAvailable()) {
    logger.warn('VLM 功能不可用，跳过图片分析');
    return [];
  }

  const results: VLMAnalysisResult[] = [];

  for (let i = 0; i < images.length; i++) {
    try {
      logger.debug(`分析第 ${i + 1}/${images.length} 张图片...`);

      const result = await analyzeImageWithVLM(images[i].base64, images[i].mimeType, customPrompt);
      results.push(result);

      // 添加延迟以避免 API 限流
      if (i < images.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error: any) {
      logger.error(`第 ${i + 1} 张图片分析失败: ${error.message}`);
      // 添加空结果
      results.push({
        hasText: false,
        textContent: '',
        description: `分析失败: ${error.message}`,
        detectedObjects: [],
        confidence: 0
      });
    }
  }

  return results;
}

/**
 * 从 VLM 响应中提取文本内容
 * 这是一个简单的实现，实际项目中可以使用更复杂的 NLP 解析
 */
function extractTextFromVLMResponse(response: string): string {
  // 查找包含文字提取的部分
  const textMatches = response.match(/文字[：:]([\s\S]+?)(?=\n\n|\n[0-9]|\n[A-Z]|$)/);
  if (textMatches && textMatches[1]) {
    return textMatches[1].trim();
  }

  // 查找引号中的文本
  const quoteMatches = response.match(/[「『"](.*?)[」』"]/g);
  if (quoteMatches && quoteMatches.length > 0) {
    return quoteMatches.map(m => m.replace(/[「『"」』"]/g, '')).join('\n');
  }

  // 如果找不到特定格式，尝试提取包含"内容"或"文本"的段落
  const contentMatch = response.match(/(?:内容|文本|文字)[:：]\s*(.+)/);
  if (contentMatch && contentMatch[1]) {
    return contentMatch[1].trim();
  }

  return '';
}

/**
 * 从 VLM 响应中提取检测到的对象/元素
 */
function extractObjectsFromVLMResponse(response: string): string[] {
  const objects: string[] = [];

  // 常见的对象类型关键词
  const keywords = [
    '截图', 'screenshot', '照片', 'photo', '图表', 'chart',
    '代码', 'code', '文档', 'document', '设计', 'design',
    '界面', 'UI', '网页', 'webpage', '海报', 'poster',
    '公式', 'formula', '表格', 'table', '流程图', 'flowchart'
  ];

  for (const keyword of keywords) {
    if (response.toLowerCase().includes(keyword.toLowerCase())) {
      objects.push(keyword);
    }
  }

  return [...new Set(objects)];  // 去重
}

/**
 * 估算 VLM API 调用成本
 *
 * @param imageCount 图片数量
 * @param avgTokensPerImage 每张图片平均 token 数（默认约 1500）
 * @returns 估算成本（人民币元）
 */
export function estimateVLMCost(
  imageCount: number,
  avgTokensPerImage: number = 1500
): { inputCost: number; outputCost: number; totalCost: number } {
  // Qwen VL 定价（需要根据智增增实际定价调整，这里使用估算值）
  // 假设：¥0.001/1K tokens（输入），¥0.002/1K tokens（输出）
  const inputCostPerKToken = 0.001;
  const outputCostPerKToken = 0.002;

  const avgOutputTokens = 500;  // 平均输出 500 tokens

  const totalInputTokens = imageCount * avgTokensPerImage;
  const totalOutputTokens = imageCount * avgOutputTokens;

  const inputCost = (totalInputTokens / 1000) * inputCostPerKToken;
  const outputCost = (totalOutputTokens / 1000) * outputCostPerKToken;
  const totalCost = inputCost + outputCost;

  return {
    inputCost,
    outputCost,
    totalCost
  };
}

/**
 * 打印 VLM 成本估算
 */
export function printVLMCostEstimate(imageCount: number): void {
  const cost = estimateVLMCost(imageCount);

  logger.info(`\n💰 VLM API 成本估算 (${imageCount} 张图片):`);
  logger.info(`   输入成本: ¥${cost.inputCost.toFixed(4)}`);
  logger.info(`   输出成本: ¥${cost.outputCost.toFixed(4)}`);
  logger.info(`   总计: ¥${cost.totalCost.toFixed(4)}\n`);
}
