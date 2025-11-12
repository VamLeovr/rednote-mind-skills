/**
 * 测试智谱 GLM-4V API 集成
 */

import { analyzeImageWithVLM, isVLMAvailable, getVLMProviderInfo } from '../src/tools/vlmAnalyzer';

// 从环境变量读取智谱 API Key（请在运行前设置 ZHIPU_API_KEY 环境变量）
if (!process.env.ZHIPU_API_KEY) {
  console.error('❌ 错误: 请设置 ZHIPU_API_KEY 环境变量');
  console.error('   使用方法: ZHIPU_API_KEY=your_key npx ts-node test/test-zhipu-vlm.ts');
  process.exit(1);
}

async function testZhipuVLM() {
  console.log('='.repeat(80));
  console.log('🧪 测试智谱 GLM-4V API 集成');
  console.log('='.repeat(80));
  console.log('');

  // 检查 VLM 是否可用
  console.log('1️⃣ 检查 VLM 可用性...');
  const available = isVLMAvailable();
  console.log(`   ✅ VLM 可用: ${available}`);

  if (available) {
    const providerInfo = getVLMProviderInfo();
    console.log(`   📡 当前提供商: ${providerInfo}`);
  }
  console.log('');

  // 创建一个简单的测试图片（红色方块）
  console.log('2️⃣ 创建测试图片...');
  const testImageBase64 = createTestImage();
  console.log(`   ✅ 测试图片创建成功 (大小: ${testImageBase64.length} 字符)`);
  console.log('');

  // 测试 VLM 分析
  console.log('3️⃣ 调用智谱 GLM-4V API 分析图片...');
  console.log('');

  try {
    const result = await analyzeImageWithVLM(
      testImageBase64,
      'image/png',
      '请描述这张图片的内容，包括颜色、形状等。'
    );

    console.log('');
    console.log('='.repeat(80));
    console.log('✅ API 调用成功！');
    console.log('='.repeat(80));
    console.log('');
    console.log('📊 分析结果：');
    console.log('');
    console.log('  包含文字:', result.hasText ? '是' : '否');
    console.log('  描述:', result.description);
    console.log('  提取的文本:', result.textContent || '(无)');
    console.log('  检测到的元素:', result.detectedObjects.join(', ') || '(无)');
    console.log('  置信度:', result.confidence);
    console.log('');

  } catch (error: any) {
    console.error('');
    console.error('='.repeat(80));
    console.error('❌ API 调用失败');
    console.error('='.repeat(80));
    console.error('');
    console.error('错误信息:', error.message);
    console.error('');

    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.error('💡 提示: API Key 可能无效或已过期');
    } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
      console.error('💡 提示: API Key 没有访问权限');
    } else if (error.message.includes('429') || error.message.includes('rate limit')) {
      console.error('💡 提示: API 请求频率超限');
    } else if (error.message.includes('fetch failed')) {
      console.error('💡 提示: 网络连接失败，请检查网络或代理设置');
    }
    console.error('');
    process.exit(1);
  }
}

/**
 * 创建一个简单的测试图片（红色方块的 Base64）
 * 这是一个 100x100 的红色 PNG 图片
 */
function createTestImage(): string {
  // 这是一个最小的 100x100 红色 PNG 图片的 Base64
  // 使用在线工具生成的测试图片
  return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
}

// 运行测试
testZhipuVLM().catch(error => {
  console.error('测试失败:', error);
  process.exit(1);
});
