// 块编辑器
const BlockEditor = ({ initialBlocks = [], onChange, templates = [] }) => {
  const [blocks, setBlocks] = useState(initialBlocks);
  const [selectedBlock, setSelectedBlock] = useState(null);

  // 添加新块
  const addBlock = (type, subtype, position = 'end') => {
    const newBlock = {
      id: Date.now(),
      block_type: type,
      block_subtype: subtype,
      content: '',
      content_format: 'markdown',
      sequence: position === 'end' ? blocks.length : position,
      metadata: {},
      style: {}
    };

    const newBlocks = position === 'end' 
      ? [...blocks, newBlock]
      : [
          ...blocks.slice(0, position),
          newBlock,
          ...blocks.slice(position)
        ];

    setBlocks(newBlocks);
    onChange(newBlocks);
  };

  // 更新块
  const updateBlock = (index, updatedBlock) => {
    const newBlocks = blocks.map((block, i) => 
      i === index ? { ...block, ...updatedBlock } : block
    );
    setBlocks(newBlocks);
    onChange(newBlocks);
  };

  // 删除块
  const deleteBlock = (index) => {
    const newBlocks = blocks.filter((_, i) => i !== index);
    setBlocks(newBlocks);
    onChange(newBlocks);
  };

  // 移动块
  const moveBlock = (fromIndex, toIndex) => {
    const newBlocks = [...blocks];
    const [movedBlock] = newBlocks.splice(fromIndex, 1);
    newBlocks.splice(toIndex, 0, movedBlock);
    
    // 更新序列号
    const updatedBlocks = newBlocks.map((block, index) => ({
      ...block,
      sequence: index
    }));
    
    setBlocks(updatedBlocks);
    onChange(updatedBlocks);
  };

  // 应用模板
  const applyTemplate = (template) => {
    const templateBlocks = template.blocks_template;
    setBlocks(templateBlocks);
    onChange(templateBlocks);
  };

  return (
    <View className="block-editor">
      {/* 工具栏 */}
      <BlockToolbar 
        onAddBlock={addBlock}
        onApplyTemplate={applyTemplate}
        templates={templates}
      />
      
      {/* 块列表 */}
      <View className="blocks-container">
        {blocks.map((block, index) => (
          <View key={block.id} className="block-wrapper">
            <BlockComponent
              block={block}
              index={index}
              onUpdate={(updated) => updateBlock(index, updated)}
              editable={true}
            />
            
            {/* 块操作栏 */}
            <View className="block-actions">
              <Button onClick={() => addBlock('text', 'paragraph', index + 1)}>
                ➕
              </Button>
              <Button onClick={() => moveBlock(index, index - 1)} disabled={index === 0}>
                ⬆️
              </Button>
              <Button onClick={() => moveBlock(index, index + 1)} disabled={index === blocks.length - 1}>
                ⬇️
              </Button>
              <Button onClick={() => deleteBlock(index)} className="delete-btn">
                🗑️
              </Button>
            </View>
          </View>
        ))}
      </View>
      
      {/* 空状态 */}
      {blocks.length === 0 && (
        <View className="empty-editor">
          <Text>点击上方工具栏添加内容块</Text>
        </View>
      )}
    </View>
  );
};