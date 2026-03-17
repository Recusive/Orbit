import { rehypeFlowTokens } from '@/lib/rehype-flow-tokens';

type FlowTokenTree = Parameters<ReturnType<typeof rehypeFlowTokens>>[0];

describe('rehypeFlowTokens', () => {
  it('adds stable ordinals to visible words while counting skipped content', () => {
    const tree: FlowTokenTree = {
      type: 'root',
      children: [
        { type: 'text', value: 'alpha ' },
        {
          type: 'element',
          tagName: 'code',
          children: [{ type: 'text', value: 'beta gamma' }],
        },
        { type: 'text', value: ' delta' },
      ],
    };

    rehypeFlowTokens()(tree);

    expect(tree.children).toEqual([
      {
        type: 'element',
        tagName: 'span',
        properties: { className: ['flow-token'], 'data-flow-ord': 0 },
        children: [{ type: 'text', value: 'alpha' }],
      },
      { type: 'text', value: ' ' },
      {
        type: 'element',
        tagName: 'code',
        children: [
          { type: 'text', value: 'beta' },
          { type: 'text', value: ' ' },
          { type: 'text', value: 'gamma' },
        ],
      },
      { type: 'text', value: ' ' },
      {
        type: 'element',
        tagName: 'span',
        properties: { className: ['flow-token'], 'data-flow-ord': 3 },
        children: [{ type: 'text', value: 'delta' }],
      },
    ]);
  });

  it('keeps ordinals stable through nested non-skipped elements', () => {
    const tree: FlowTokenTree = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'p',
          children: [
            { type: 'text', value: 'one ' },
            {
              type: 'element',
              tagName: 'strong',
              children: [{ type: 'text', value: 'two three' }],
            },
          ],
        },
      ],
    };

    rehypeFlowTokens()(tree);

    const paragraph = tree.children[0];
    expect(paragraph).toMatchObject({
      type: 'element',
      tagName: 'p',
      children: [
        {
          type: 'element',
          properties: { 'data-flow-ord': 0 },
          children: [{ type: 'text', value: 'one' }],
        },
        { type: 'text', value: ' ' },
        {
          type: 'element',
          tagName: 'strong',
          children: [
            {
              type: 'element',
              properties: { 'data-flow-ord': 1 },
              children: [{ type: 'text', value: 'two' }],
            },
            { type: 'text', value: ' ' },
            {
              type: 'element',
              properties: { 'data-flow-ord': 2 },
              children: [{ type: 'text', value: 'three' }],
            },
          ],
        },
      ],
    });
  });
});
