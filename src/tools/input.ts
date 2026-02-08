import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { success, error } from './types.js';

export const click: ToolDefinition = {
  name: 'click',
  description: 'Click at coordinates. Async - use is_paused to check if breakpoint was hit.',
  inputSchema: z.object({
    x: z.number().describe('X coordinate'),
    y: z.number().describe('Y coordinate'),
    button: z.enum(['left', 'middle', 'right']).optional().describe('Mouse button. Default: left'),
    clickCount: z.number().optional().describe('Number of clicks. Default: 1'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof click.inputSchema>;
    try {
      await session.dispatchMouseEvent('mousePressed', p.x, p.y, {
        button: p.button ?? 'left',
        clickCount: p.clickCount ?? 1,
      });
      await session.dispatchMouseEvent('mouseReleased', p.x, p.y, {
        button: p.button ?? 'left',
        clickCount: p.clickCount ?? 1,
      });
      return success(`Clicked at (${p.x}, ${p.y})`);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const clickElement: ToolDefinition = {
  name: 'click_element',
  description: 'Click on an element by node ID (clicks at center). Async - use is_paused to check if breakpoint was hit.',
  inputSchema: z.object({
    nodeId: z.number().describe('Node ID from querySelector'),
    button: z.enum(['left', 'middle', 'right']).optional().describe('Mouse button. Default: left'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof clickElement.inputSchema>;
    try {
      const model = await session.getBoxModel(p.nodeId);
      const x = (model.content[0] + model.content[2] + model.content[4] + model.content[6]) / 4;
      const y = (model.content[1] + model.content[3] + model.content[5] + model.content[7]) / 4;

      await session.dispatchMouseEvent('mousePressed', x, y, {
        button: p.button ?? 'left',
        clickCount: 1,
      });
      await session.dispatchMouseEvent('mouseReleased', x, y, {
        button: p.button ?? 'left',
        clickCount: 1,
      });
      return success(`Clicked element at (${Math.round(x)}, ${Math.round(y)})`);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const typeText: ToolDefinition = {
  name: 'type_text',
  description: 'Type text into the focused element.',
  inputSchema: z.object({
    text: z.string().describe('Text to type'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof typeText.inputSchema>;
    try {
      await session.insertText(p.text);
      return success(`Typed "${p.text}"`);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const pressKey: ToolDefinition = {
  name: 'press_key',
  description: 'Press a key or key combination.',
  inputSchema: z.object({
    key: z.string().describe('Key name (e.g., Enter, Tab, Escape, ArrowDown)'),
    modifiers: z.array(z.enum(['Alt', 'Control', 'Meta', 'Shift'])).optional().describe('Modifier keys'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof pressKey.inputSchema>;
    try {
      let modifierBits = 0;
      if (p.modifiers) {
        if (p.modifiers.includes('Alt')) modifierBits |= 1;
        if (p.modifiers.includes('Control')) modifierBits |= 2;
        if (p.modifiers.includes('Meta')) modifierBits |= 4;
        if (p.modifiers.includes('Shift')) modifierBits |= 8;
      }

      await session.dispatchKeyEvent('keyDown', {
        key: p.key,
        code: `Key${p.key.toUpperCase()}`,
        modifiers: modifierBits,
      });
      await session.dispatchKeyEvent('keyUp', {
        key: p.key,
        code: `Key${p.key.toUpperCase()}`,
        modifiers: modifierBits,
      });
      return success(`Pressed ${p.modifiers?.join('+') || ''}${p.modifiers ? '+' : ''}${p.key}`);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const scroll: ToolDefinition = {
  name: 'scroll',
  description: 'Scroll the page or an element.',
  inputSchema: z.object({
    x: z.number().describe('X coordinate to scroll from'),
    y: z.number().describe('Y coordinate to scroll from'),
    deltaX: z.number().optional().describe('Horizontal scroll distance'),
    deltaY: z.number().optional().describe('Vertical scroll distance (negative = up, positive = down)'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof scroll.inputSchema>;
    try {
      await session.synthesizeScrollGesture(p.x, p.y, {
        xDistance: p.deltaX,
        yDistance: p.deltaY,
      });
      return success(`Scrolled at (${p.x}, ${p.y})`);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const moveMouse: ToolDefinition = {
  name: 'move_mouse',
  description: 'Move the mouse to a position.',
  inputSchema: z.object({
    x: z.number().describe('X coordinate'),
    y: z.number().describe('Y coordinate'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof moveMouse.inputSchema>;
    try {
      await session.dispatchMouseEvent('mouseMoved', p.x, p.y);
      return success(`Mouse moved to (${p.x}, ${p.y})`);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const inputTools: ToolDefinition[] = [
  click,
  clickElement,
  typeText,
  pressKey,
  scroll,
  moveMouse,
];
