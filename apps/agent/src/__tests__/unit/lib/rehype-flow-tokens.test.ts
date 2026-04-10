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
        children: [{ type: 'text', value: 'beta gamma' }],
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

  it('preserves single text node inside pre>code for Streamdown code extraction', () => {
    const tree: FlowTokenTree = {
      type: 'root',
      children: [
        { type: 'text', value: 'before ' },
        {
          type: 'element',
          tagName: 'pre',
          children: [
            {
              type: 'element',
              tagName: 'code',
              children: [{ type: 'text', value: 'const x = 1;\nconst y = 2;\n' }],
            },
          ],
        },
        { type: 'text', value: ' after' },
      ],
    };

    rehypeFlowTokens()(tree);

    // Code content must remain a single text node — Streamdown's CodeComponent
    // expects `typeof children === "string"`, which fails if hast-util-to-jsx-runtime
    // receives multiple text children (it passes them as an array).
    // tree.children: [flow-token("before"), " ", <pre>, " ", flow-token("after")]
    const pre = tree.children[2] as { type: 'element'; tagName: string; children: unknown[] };
    expect(pre.tagName).toBe('pre');
    const code = pre.children[0] as { type: 'element'; tagName: string; children: unknown[] };
    expect(code.children).toEqual([{ type: 'text', value: 'const x = 1;\nconst y = 2;\n' }]);

    // Words inside code still counted for stable ordinals:
    // "before"=0, code words (const,x,=,1;,const,y,=,2;)=1..8, "after"=9
    const afterToken = tree.children[4] as {
      type: 'element';
      properties: { 'data-flow-ord': number };
    };
    expect(afterToken.properties['data-flow-ord']).toBe(9);
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
