import { randomUUID } from 'crypto';
import type { GuideBlock, GuideBlockType } from './types';

function uid(): string {
  return randomUUID();
}

function makeBlock(type: GuideBlockType, content: string, meta?: GuideBlock['meta']): GuideBlock {
  return { id: uid(), type, content, ...(meta ? { meta } : {}) };
}

// ── Parse markdown string → GuideBlock[] ─────────────────────────────────────

export function parseMarkdownToBlocks(md: string): GuideBlock[] {
  if (!md.trim()) return [makeBlock('paragraph', '')];

  const lines = md.split('\n');
  const blocks: GuideBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code fence
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim() || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing fence
      blocks.push(makeBlock('code', codeLines.join('\n'), lang ? { language: lang } : undefined));
      continue;
    }

    // Divider
    if (/^---+$/.test(line.trim())) {
      blocks.push(makeBlock('divider', ''));
      i++;
      continue;
    }

    // Headings
    if (line.startsWith('### ')) {
      blocks.push(makeBlock('h3', line.slice(4)));
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push(makeBlock('h2', line.slice(3)));
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      blocks.push(makeBlock('h1', line.slice(2)));
      i++;
      continue;
    }

    // Callout (blockquote lines starting with >)
    if (line.startsWith('> ')) {
      const calloutLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        calloutLines.push(lines[i].slice(2));
        i++;
      }
      const text = calloutLines.join('\n');
      let variant: string | undefined;
      if (/^\[!info\]/i.test(text))    variant = 'info';
      if (/^\[!warning\]/i.test(text)) variant = 'warning';
      if (/^\[!tip\]/i.test(text))     variant = 'tip';
      const content = variant ? text.replace(/^\[!\w+\]\s*/i, '') : text;
      blocks.push(makeBlock('callout', content, { variant: variant ?? 'info' }));
      continue;
    }

    // Unordered list
    if (/^[-*] /.test(line)) {
      blocks.push(makeBlock('list', line.replace(/^[-*] /, '')));
      i++;
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      blocks.push(makeBlock('ordered', line.replace(/^\d+\.\s/, '')));
      i++;
      continue;
    }

    // Empty line → empty paragraph
    if (line.trim() === '') {
      blocks.push(makeBlock('paragraph', ''));
      i++;
      continue;
    }

    // Default → paragraph
    blocks.push(makeBlock('paragraph', line));
    i++;
  }

  return blocks.length ? blocks : [makeBlock('paragraph', '')];
}

// ── Serialize GuideBlock[] → markdown string ─────────────────────────────────

export function serializeBlocksToMarkdown(blocks: GuideBlock[]): string {
  const parts: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    switch (block.type) {
      case 'h1':
        parts.push(`# ${block.content}`);
        break;
      case 'h2':
        parts.push(`## ${block.content}`);
        break;
      case 'h3':
        parts.push(`### ${block.content}`);
        break;
      case 'paragraph':
        parts.push(block.content);
        break;
      case 'code': {
        const lang = block.meta?.language ?? '';
        parts.push(`\`\`\`${lang}`);
        parts.push(block.content);
        parts.push('```');
        break;
      }
      case 'list':
        parts.push(`- ${block.content}`);
        break;
      case 'ordered': {
        // count consecutive ordered blocks ending at this one
        let num = 1;
        let j = i - 1;
        while (j >= 0 && blocks[j].type === 'ordered') { num++; j--; }
        parts.push(`${num}. ${block.content}`);
        break;
      }
      case 'divider':
        parts.push('---');
        break;
      case 'callout': {
        const variant = block.meta?.variant;
        const prefix = variant && variant !== 'info' ? `[!${variant}] ` : '';
        const lines = block.content.split('\n');
        for (let li = 0; li < lines.length; li++) {
          parts.push(`> ${li === 0 ? prefix : ''}${lines[li]}`);
        }
        break;
      }
    }
  }

  return parts.join('\n');
}
