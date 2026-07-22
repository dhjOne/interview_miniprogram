/** 题目详情 contentBlocks 处理（从 pages/question/detail 抽出，行为保持不变） */

export function processContentBlocks(blocks) {
  if (!blocks || !Array.isArray(blocks)) {
    console.warn('内容块数据为空或不是数组:', blocks);
    return [];
  }

  const filteredBlocks = blocks
    .filter((block) => {
      if (!block.id || !block.blockType) return false;
      return block.isActive !== 0;
    })
    .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
    .map((block) => {
      // 处理 metadata 和 style 字段
      let metadata = {};
      let style = {};
      let config = {};

      try {
        metadata =
          typeof block.metadata === 'string' ? JSON.parse(block.metadata) : block.metadata || {};
      } catch (e) {
        console.warn('metadata 解析失败:', block.metadata);
      }

      try {
        style = typeof block.style === 'string' ? JSON.parse(block.style) : block.style || {};
      } catch (e) {
        console.warn('style 解析失败:', block.style);
      }

      try {
        config = typeof block.config === 'string' ? JSON.parse(block.config) : block.config || {};
      } catch (e) {
        console.warn('config 解析失败:', block.config);
      }

      const processedBlock = {
        ...block,
        metadata,
        style,
        config,
        content: block.content ? String(block.content) : '',
      };

      // 为所有块类型生成自定义样式
      processedBlock.customStyle = generateCustomStyle(style, block.blockType);
      processedBlock.customClass = style.className || '';

      // 根据块类型进行特殊处理
      return processBlockByType(processedBlock);
    });

  return filteredBlocks;
}

export function processBlockByType(block) {
  switch (block.blockType) {
    case 'code':
      return processCodeBlock(block);
    case 'image':
      return processImageBlock(block);
    case 'table':
      return processTableBlock(block);
    case 'formula':
      return processFormulaBlock(block);
    case 'file':
      return processFileBlock(block);
    case 'divider':
      return processDividerBlock(block);
    case 'video':
      return processVideoBlock(block);
    case 'text':
    default:
      return processTextBlock(block);
  }
}

export function processCodeBlock(block) {
  const language = block.metadata.language || 'plaintext';
  const showLineNumbers = block.config.lineNumbers !== false;

  return {
    ...block,
    formattedContent: {
      language,
      showLineNumbers,
      theme: block.config.theme || 'default',
    },
  };
}

export function processImageBlock(block) {
  return {
    ...block,
    imageInfo: {
      src: block.content,
      alt: block.metadata.alt || '图片',
      width: block.metadata.width || '100%',
      height: block.metadata.height || 'auto',
      caption: block.metadata.caption,
      zoomable: block.config.zoomable !== false,
    },
  };
}

export function processTableBlock(block) {
  let tableData = {
    headers: [],
    rows: [],
  };

  try {
    if (block.contentFormat === 'csv') {
      const lines = block.content.split('\n');
      if (lines.length > 0) {
        tableData.headers = lines[0].split(',').map((h) => h.trim());
        tableData.rows = lines.slice(1).map((line) => line.split(',').map((cell) => cell.trim()));
      }
    } else if (block.contentFormat === 'json') {
      tableData = JSON.parse(block.content);
    }
  } catch (e) {
    console.warn('表格数据解析失败:', e);
  }

  return {
    ...block,
    tableData,
  };
}

export function processFormulaBlock(block) {
  return {
    ...block,
    formulaInfo: {
      formula: block.content,
      format: block.metadata.format || 'latex',
      isInline: block.metadata.isInline || false,
    },
  };
}

export function processFileBlock(block) {
  return {
    ...block,
    fileInfo: {
      url: block.content,
      fileName: block.metadata.fileName || '未命名文件',
      fileSize: block.metadata.fileSize || '未知大小',
      fileType: block.metadata.fileType || 'application/octet-stream',
    },
  };
}

export function processDividerBlock(block) {
  const subtype = block.blockSubtype || 'line';
  return {
    ...block,
    dividerType: subtype, // line, dashed, dotted 等
  };
}

export function processVideoBlock(block) {
  return {
    ...block,
    videoInfo: {
      src: block.content,
      poster: block.metadata.poster,
      controls: block.config.controls !== false,
      autoplay: block.config.autoplay || false,
    },
  };
}

export function processTextBlock(block) {
  let formattedContent = block.content;
  let hasProcessedNumberedSections = false;
  let hasBoldText = false;
  let lines = [];
  let hasLineBreaks = false;

  // 检查是否需要处理数字分段
  if (shouldProcessNumberedContent(block.content, block.blockSubtype)) {
    formattedContent = formatNumberedContent(block.content, {
      // 配置处理规则
      symbols: ['、', '.', ':', '．'], // 需要处理的符号
      indent: '', // 两个全角空格缩进
      lineBreak: '\n', // 换行符
      processSpaces: true, // 处理空格换行
    });
    hasProcessedNumberedSections = true;
  }
  // 检查文本中是否包含加粗标记（**内容**）
  if (containsBoldMarkers(formattedContent)) {
    formattedContent = processBoldText(formattedContent);
    hasBoldText = true;
  }

  // 如果内容是markdown格式，处理其他markdown元素
  if (block.contentFormat === 'markdown') {
    formattedContent = processOtherMarkdown(formattedContent);
  }
  if (formattedContent.includes('\n')) {
    lines = formattedContent.split('\n');
    hasLineBreaks = true;
  } else {
    lines = [formattedContent];
  }

  return {
    ...block,
    textInfo: {
      content: block.content,
      formattedContent: formattedContent,
      format: block.contentFormat || 'plain',
      subtype: block.blockSubtype || 'paragraph',
      hasNumberedSections: hasProcessedNumberedSections,
      hasBoldText: block.content.includes('**'),
      processedWithNumberedFormat: hasProcessedNumberedSections,
      hasLineBreaks: hasLineBreaks,
      lines: lines, // 按行分割的内容数组
    },
  };
}

/**
 * 处理换行符 - 让下一行自动缩进两个中文字符
 */
export function processLineBreaks(content) {
  if (!content || typeof content !== 'string') return content;

  // 将换行符替换为换行+缩进
  // 使用正则表达式匹配换行符，并在其后添加两个全角空格
  return content.replace(/\n/g, '\n　　');
}

/**
 * 检查文本是否包含加粗标记
 */
export function containsBoldMarkers(content) {
  if (!content || typeof content !== 'string') return false;
  return content.includes('**');
}

export function processBoldText(content) {
  // 使用正则表达式替换 **加粗内容** 为富文本格式
  return content.replace(
    /\*\*(.*?)\*\*/g,
    '<span class="bold-text" style="font-weight: bold;">$1</span>',
  );
}

/**
 * 处理其他Markdown元素（仅当contentFormat为markdown时）
 */
export function processOtherMarkdown(content) {
  let processed = content;

  // 处理斜体文本：*斜体内容* -> 富文本格式
  processed = processed.replace(
    /\*(.*?)\*/g,
    '<span class="italic-text" style="font-style: italic;">$1</span>',
  );

  // 处理代码片段：`代码` -> 富文本格式
  processed = processed.replace(
    /`(.*?)`/g,
    '<span class="inline-code" style="background: #f6f8fa; padding: 4rpx 8rpx; border-radius: 4rpx; font-family: monospace;">$1</span>',
  );

  return processed;
}

export function generateCustomStyle(styleConfig, blockType) {
  let styleString = '';

  // 使用数据库中的 CSS
  if (styleConfig.css) {
    styleString += styleConfig.css;
  }

  // 如果没有自定义样式，提供智能默认值
  if (!styleConfig.css) {
    styleString += getDefaultStyle(blockType);
  }

  return styleString;
}

export function getDefaultStyle(blockType) {
  const defaultStyles = {
    text: 'font-size: 32rpx; line-height: 1.6; margin-bottom: 24rpx;',
    code: 'background: #f6f8fa; border-radius: 8rpx; padding: 24rpx; margin: 20rpx 0; font-family: "Monaco", "Consolas", monospace;',
    image: 'text-align: center; margin: 20rpx 0;',
    table: 'margin: 24rpx 0; border-radius: 8rpx; overflow: hidden;',
    formula:
      'text-align: center; padding: 24rpx; margin: 20rpx 0; background: #f8f9fa; border-radius: 8rpx;',
    file: 'background: #f8f9fa; padding: 24rpx; border-radius: 12rpx; margin: 20rpx 0;',
    divider: 'border-top: 1rpx solid #e0e0e0; margin: 32rpx 0;',
    video: 'width: 100%; margin: 20rpx 0; border-radius: 8rpx;',
  };

  return defaultStyles[blockType] || '';
}

/**
 * 判断是否需要处理数字分段内容
 */
export function shouldProcessNumberedContent(content, subtype) {
  if (!content) return false;

  // 如果是明确的编号项类型，直接处理
  if (subtype === 'numbered_item') {
    return true;
  }

  // 检查是否包含数字+符号模式
  const numberSymbolPattern = /\b\d+[、.:．]\s/;
  return numberSymbolPattern.test(content);
}

/**
 * 精确的数字分段内容格式化
 * 只处理数字+特定符号的模式，不影响其他文本
 */
export function formatNumberedContent(content, options = {}) {
  const config = {
    symbols: ['、', '.', ':', '．'],
    indent: '　　',
    lineBreak: '\n',
    processSpaces: true,
    ...options,
  };

  // 构建正则表达式模式
  const symbolPattern = config.symbols.map((s) => escapeRegExp(s)).join('|');
  const numberPattern = `(\\b\\d+)[${symbolPattern}]\\s*`;

  // 分割内容，但保留分隔符
  const segments = [];
  let lastIndex = 0;
  let match;

  // 使用正则表达式查找所有匹配
  const regex = new RegExp(numberPattern, 'g');

  match = regex.exec(content);
  while (match !== null) {
    // 找到匹配前的文本
    const beforeMatch = content.substring(lastIndex, match.index);
    if (beforeMatch.trim()) {
      segments.push(beforeMatch);
    }

    // 添加匹配到的数字分段（包括数字和符号）
    const numberedSection = match[0];
    segments.push(numberedSection);

    lastIndex = match.index + numberedSection.length;
    match = regex.exec(content);
  }

  // 添加剩余文本
  const remainingText = content.substring(lastIndex);
  if (remainingText.trim()) {
    segments.push(remainingText);
  }

  // 如果没有找到数字分段，返回原内容
  if (segments.length <= 1) {
    return content;
  }

  // 格式化分段
  return formatNumberedSegments(segments, config);
}

/**
 * 格式化数字分段
 */
export function formatNumberedSegments(segments, config) {
  let result = '';
  let inNumberedSection = false;

  segments.forEach((segment, index) => {
    // 检查是否是数字分段
    const isNumbered = isNumberedSegment(segment, config.symbols);

    if (isNumbered) {
      // 如果是数字分段，添加缩进和换行
      if (index > 0) {
        result += config.lineBreak;
      }
      result += config.indent + segment;
      inNumberedSection = true;
    } else {
      // 如果不是数字分段，根据上下文决定是否换行
      if (inNumberedSection && config.processSpaces && segment.trim() === '') {
        // 空格处理：在数字分段后的空格处换行
        result += config.lineBreak + config.indent;
      } else {
        result += segment;
      }
      inNumberedSection = false;
    }
  });

  return result;
}

/**
 * 判断是否是数字分段
 */
export function isNumberedSegment(text, symbols) {
  if (!text || typeof text !== 'string') return false;

  const trimmed = text.trim();
  if (!trimmed) return false;

  // 检查是否匹配数字+符号模式
  const symbolPattern = symbols.map((s) => escapeRegExp(s)).join('|');
  const numberPattern = new RegExp(`^\\b\\d+[${symbolPattern}]\\s*`);

  return numberPattern.test(trimmed);
}

/**
 * 转义正则表达式特殊字符
 */
export function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 处理Markdown内容
 */
export function processMarkdownContent(content) {
  let processed = content;

  // 处理加粗文本：**加粗内容** -> 富文本格式
  processed = processed.replace(/\*\*(.*?)\*\*/g, '<text class="bold-text">$1</text>');

  // 处理斜体文本：*斜体内容* -> 富文本格式
  processed = processed.replace(/\*(.*?)\*/g, '<text class="italic-text">$1</text>');

  // 处理代码片段：`代码` -> 富文本格式
  processed = processed.replace(/`(.*?)`/g, '<text class="inline-code">$1</text>');

  return processed;
}
