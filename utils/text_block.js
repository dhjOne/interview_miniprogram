// 文本块
const TextBlock = ({ block, onUpdate, editable }) => {
  const [content, setContent] = useState(block.content || '');
  
  const handleChange = (newContent) => {
    setContent(newContent);
    onUpdate && onUpdate({
      ...block,
      content: newContent
    });
  };

  const renderContent = () => {
    if (block.content_format === 'markdown') {
      return <MarkdownView content={content} />;
    } else if (block.content_format === 'html') {
      return <HtmlView content={content} />;
    } else {
      return <TextView content={content} />;
    }
  };

  return (
    <View className={`text-block ${block.block_subtype}`}>
      {editable ? (
        <TextEditor
          content={content}
          onChange={handleChange}
          format={block.content_format}
          subtype={block.block_subtype}
        />
      ) : (
        renderContent()
      )}
    </View>
  );
};

// 代码块
const CodeBlock = ({ block, onUpdate, editable }) => {
  const [code, setCode] = useState(block.content || '');
  
  return (
    <View className="code-block">
      <View className="code-header">
        <Text className="language">{block.metadata?.language || 'text'}</Text>
        {editable && <Button onClick={handleCopy}>复制</Button>}
      </View>
      {editable ? (
        <CodeEditor
          value={code}
          language={block.metadata?.language}
          onChange={(value) => {
            setCode(value);
            onUpdate && onUpdate({ ...block, content: value });
          }}
        />
      ) : (
        <SyntaxHighlighter language={block.metadata?.language}>
          {code}
        </SyntaxHighlighter>
      )}
    </View>
  );
};

// 图片块
const ImageBlock = ({ block, onUpdate, editable }) => {
  const handleImageChange = (imageUrl) => {
    onUpdate && onUpdate({
      ...block,
      content: imageUrl,
      metadata: {
        ...block.metadata,
        url: imageUrl
      }
    });
  };

  return (
    <View className="image-block">
      {editable ? (
        <ImageUploader
          currentImage={block.content}
          onChange={handleImageChange}
          config={block.config}
        />
      ) : (
        <Image
          src={block.content}
          mode="widthFix"
          className="content-image"
          onClick={() => previewImage(block.content)}
        />
      )}
      {block.metadata?.caption && (
        <Text className="image-caption">{block.metadata.caption}</Text>
      )}
    </View>
  );
};

// 数学公式块
const FormulaBlock = ({ block, onUpdate, editable }) => {
  const [formula, setFormula] = useState(block.content || '');
  
  return (
    <View className="formula-block">
      {editable ? (
        <FormulaEditor
          value={formula}
          onChange={(value) => {
            setFormula(value);
            onUpdate && onUpdate({ ...block, content: value });
          }}
        />
      ) : (
        <MathJax formula={formula} />
      )}
    </View>
  );
};