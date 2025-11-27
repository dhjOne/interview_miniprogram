// 块渲染器
const BlockRenderer = ({ blocks, onUpdate, editable = false }) => {
  return (
    <View className="block-renderer">
      {blocks.map((block, index) => (
        <BlockComponent
          key={block.id || index}
          block={block}
          index={index}
          onUpdate={onUpdate}
          editable={editable}
        />
      ))}
    </View>
  );
};

// 块组件
const BlockComponent = ({ block, index, onUpdate, editable }) => {
  const renderBlock = () => {
    switch (block.block_type) {
      case 'text':
        return <TextBlock block={block} onUpdate={onUpdate} editable={editable} />;
      case 'code':
        return <CodeBlock block={block} onUpdate={onUpdate} editable={editable} />;
      case 'image':
        return <ImageBlock block={block} onUpdate={onUpdate} editable={editable} />;
      case 'formula':
        return <FormulaBlock block={block} onUpdate={onUpdate} editable={editable} />;
      case 'table':
        return <TableBlock block={block} onUpdate={onUpdate} editable={editable} />;
      case 'video':
        return <VideoBlock block={block} onUpdate={onUpdate} editable={editable} />;
      case 'file':
        return <FileBlock block={block} onUpdate={onUpdate} editable={editable} />;
      case 'divider':
        return <DividerBlock block={block} />;
      default:
        return <TextBlock block={block} onUpdate={onUpdate} editable={editable} />;
    }
  };

  return (
    <View className={`block block-${block.block_type}`} data-block-id={block.id}>
      {renderBlock()}
    </View>
  );
};