/**
 * VLM (Vision Language Model) 图片分析模块
 * 支持多个 VLM API 提供商：智增增 Qwen VL、Jina AI、智谱清言 GLM-4V、MiniMax
 * 用户可选择配置任意一个 API Key：ZZZ_API_KEY、JINA_API_KEY、ZHIPU_API_KEY 或 MINIMAX_API_KEY
 * 优先级：MiniMax > 智增增 > Jina > 智谱清言
 */

import 'dotenv/config';
import { logger } from './logger';
import type { VLMAnalysisResult, ImageData } from '../types';

/**
 * VLM 提供商配置
 */
interface VLMProvider {
  name: string;
  apiUrl: string;
  model: string;
  envKey: string;
  inputCostPerKToken: number;
  outputCostPerKToken: number;
}

/**
 * 支持的 VLM 提供商列表（按优先级排序）
 * 注意：MiniMax 用于纯文本对话，图片分析需要使用其他 VLM 提供商
 */
const VLM_PROVIDERS: VLMProvider[] = [
  {
    name: '智增增',
    apiUrl: 'https://api.zhizengzeng.com/v1/chat/completions',
    model: 'qwen3-vl-235b-a22b-thinking',
    envKey: 'ZZZ_API_KEY',
    inputCostPerKToken: 0.001,
    outputCostPerKToken: 0.002
  },
  {
    name: 'Jina',
    apiUrl: 'https://api.jina.ai/v1/chat/completions',
    model: 'jina-clip-v2',
    envKey: 'JINA_API_KEY',
    inputCostPerKToken: 0.002,
    outputCostPerKToken: 0.002
  },
  {
    name: '智谱清言',
    apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model: 'glm-4v',
    envKey: 'ZHIPU_API_KEY',
    inputCostPerKToken: 0.005,
    outputCostPerKToken: 0.005
  }
];

/**
 * 纯文本 LLM 提供商列表（用于内容判断、对话等）
 * 优先级：MiniMax > 智增增 > 智谱清言
 */
const TEXT_LLM_PROVIDERS: VLMProvider[] = [
  {
    name: 'MiniMax',
    apiUrl: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
    model: 'abab8.5-sft-01',
    envKey: 'MINIMAX_API_KEY',
    inputCostPerKToken: 0.001,
    outputCostPerKToken: 0.001
  },
  {
    name: '智增增',
    apiUrl: 'https://api.zhizengzeng.com/v1/chat/completions',
    model: 'qwen3-235b-a22b',
    envKey: 'ZZZ_API_KEY',
    inputCostPerKToken: 0.001,
    outputCostPerKToken: 0.002
  },
  {
    name: '智谱清言',
    apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model: 'glm-4',
    envKey: 'ZHIPU_API_KEY',
    inputCostPerKToken: 0.005,
    outputCostPerKToken: 0.005
  }
];

/**
 * 默认测试 API Key（仅用于演示和测试）
 * 用户应配置自己的 API Key 以获得更好的体验
 */
const DEFAULT_ZHIPU_API_KEY = '14832a226ca5432a83cdae0092ecb77a.tM9KN8Xlf18QCkEz';

/**
 * 获取当前可用的 VLM 提供商
 * 优先级：智增增 > 智谱清言（含默认测试 Key）
 */
function getAvailableProvider(): VLMProvider | null {
  for (const provider of VLM_PROVIDERS) {
    if (process.env[provider.envKey]) {
      return provider;
    }
  }

  // 如果没有配置环境变量，使用智谱的默认测试 API Key
  const zhipuProvider = VLM_PROVIDERS.find(p => p.envKey === 'ZHIPU_API_KEY');
  if (zhipuProvider) {
    // 临时设置默认 Key（仅当前进程有效）
    process.env.ZHIPU_API_KEY = DEFAULT_ZHIPU_API_KEY;
    logger.debug('使用默认测试 API Key（智谱 GLM-4V）');
    return zhipuProvider;
  }

  return null;
}

/**
 * 检查 VLM 功能是否可用
 */
export function isVLMAvailable(): boolean {
  return getAvailableProvider() !== null;
}

/**
 * 获取当前可用的文本 LLM 提供商（用于内容判断、对话等）
 * 优先级：MiniMax > 智增增 > 智谱清言
 */
function getAvailableTextProvider(): VLMProvider | null {
  for (const provider of TEXT_LLM_PROVIDERS) {
    if (process.env[provider.envKey]) {
      return provider;
    }
  }
  return null;
}

/**
 * 检查文本 LLM 功能是否可用
 */
export function isTextLLMAvailable(): boolean {
  return getAvailableTextProvider() !== null;
}

/**
 * 获取当前使用的 VLM 提供商信息
 */
export function getVLMProviderInfo(): string {
  const provider = getAvailableProvider();
  if (!provider) {
    return '未配置 VLM API Key';
  }
  return `${provider.name} (${provider.model})`;
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

  const provider = getAvailableProvider();

  if (!provider) {
    throw new Error('VLM 功能不可用：请设置 ZZZ_API_KEY、JINA_API_KEY 或 ZHIPU_API_KEY 环境变量');
  }

  const apiKey = process.env[provider.envKey];

  // 默认提示词：提取文字和描述图片内容
  const defaultPrompt = `请详细分析这张图片，并提供以下信息：

1. 图片中是否包含文字？如果有，请逐字提取所有可见文字（包括中英文）
2. 图片的主要内容和场景描述
3. 图片中的关键对象、元素或主题
4. 图片的类型（如：截图、照片、图表、设计稿等）

请以结构化的方式回答，清晰明了。`;

  const prompt = customPrompt || defaultPrompt;

  try {
    logger.debug(`🔍 使用 ${provider.name} VLM (${provider.model}) 分析图片...`);

    // 构建符合 OpenAI vision 格式的请求
    const requestBody = {
      model: provider.model,
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
      max_tokens: 1024,
      stream: false
    };

    // 调用 VLM API
    logger.debug(`调用 API: ${provider.apiUrl}`);
    logger.debug(`请求体大小: ${JSON.stringify(requestBody).length} 字节`);

    const response = await fetch(provider.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    logger.debug(`响应状态: ${response.status} ${response.statusText}`);

    const data = await response.json();

    // 调试：打印完整响应
    logger.debug(`${provider.name} API 原始响应:`, JSON.stringify(data, null, 2));

    // 检查 API 错误
    if (data.error) {
      const errorMsg = data.error.message || JSON.stringify(data.error);
      logger.error(`${provider.name} API 错误:`, errorMsg);
      throw new Error(`${provider.name} API 错误: ${errorMsg}`);
    }

    // 检查 HTTP 状态
    if (!response.ok) {
      throw new Error(`${provider.name} API 调用失败: ${response.status} ${JSON.stringify(data)}`);
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
): { inputCost: number; outputCost: number; totalCost: number; provider: string } {
  const provider = getAvailableProvider();

  if (!provider) {
    return {
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      provider: '未配置'
    };
  }

  const avgOutputTokens = 500;  // 平均输出 500 tokens

  const totalInputTokens = imageCount * avgTokensPerImage;
  const totalOutputTokens = imageCount * avgOutputTokens;

  const inputCost = (totalInputTokens / 1000) * provider.inputCostPerKToken;
  const outputCost = (totalOutputTokens / 1000) * provider.outputCostPerKToken;
  const totalCost = inputCost + outputCost;

  return {
    inputCost,
    outputCost,
    totalCost,
    provider: provider.name
  };
}

/**
 * 打印 VLM 成本估算
 */
export function printVLMCostEstimate(imageCount: number): void {
  const cost = estimateVLMCost(imageCount);

  logger.info(`\n💰 VLM API 成本估算 (${imageCount} 张图片, 提供商: ${cost.provider}):`);
  logger.info(`   输入成本: ¥${cost.inputCost.toFixed(4)}`);
  logger.info(`   输出成本: ¥${cost.outputCost.toFixed(4)}`);
  logger.info(`   总计: ¥${cost.totalCost.toFixed(4)}\n`);
}

// ============================================================================
// 纯文本 LLM 调用（用于内容判断、总结等）
// ============================================================================

/**
 * 使用 LLM 进行纯文本对话（不包含图片）
 * 可用于内容质量判断、摘要生成等场景
 *
 * @param prompt 用户提示词
 * @param systemPrompt 系统提示词（可选）
 * @returns LLM 响应文本
 */
export async function chatWithLLM(
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  const provider = getAvailableTextProvider();

  if (!provider) {
    throw new Error('LLM 功能不可用：请设置 MINIMAX_API_KEY、ZZZ_API_KEY 或 ZHIPU_API_KEY 环境变量');
  }

  const apiKey = process.env[provider.envKey];

  try {
    logger.debug(`💬 使用 ${provider.name} LLM 进行文本对话...`);

    const messages: any[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({ role: 'user', content: prompt });

    // MiniMax 使用不同的请求格式
    let requestBody: any;
    if (provider.name === 'MiniMax') {
      requestBody = {
        model: provider.model,
        messages,
        max_tokens: 2048,
        temperature: 0.7
      };
    } else {
      requestBody = {
        model: provider.model,
        messages,
        max_tokens: 2048,
        stream: false
      };
    }

    const response = await fetch(provider.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(`${provider.name} API 错误: ${data.error.message || JSON.stringify(data.error)}`);
    }

    if (!response.ok) {
      throw new Error(`${provider.name} API 调用失败: ${response.status} ${JSON.stringify(data)}`);
    }

    // 不同提供商的响应格式可能不同
    let responseText = '';
    if (provider.name === 'MiniMax') {
      // MiniMax: data.choices[0].message.content
      responseText = data.choices?.[0]?.message?.content || '';
      // MiniMax 可能返回数组格式
      if (Array.isArray(responseText)) {
        responseText = responseText.map((t: any) => t.text || t.content || '').join('');
      }
    } else {
      responseText = data.choices?.[0]?.message?.content || '';
    }

    logger.debug(`✅ LLM 对话完成 (使用 tokens: ${data.usage?.total_tokens || 'N/A'})`);

    return responseText;

  } catch (error: any) {
    logger.error(`LLM 对话失败: ${error.message}`);
    throw new Error(`LLM 对话失败: ${error.message}`);
  }
}
