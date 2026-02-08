import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { success, error, formatObject } from './types.js';

export const domEnable: ToolDefinition = {
  name: 'dom_enable',
  description: 'Enable DOM domain for DOM tree access.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      await session.enableDOM();
      return success('DOM enabled');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const domDisable: ToolDefinition = {
  name: 'dom_disable',
  description: 'Disable DOM domain.',
  inputSchema: z.object({}),
  handler: async (session) => {
    try {
      await session.disableDOM();
      return success('DOM disabled');
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const getDocument: ToolDefinition = {
  name: 'get_document',
  description: 'Get the root DOM node.',
  inputSchema: z.object({
    depth: z.number().optional().describe('Maximum depth to return. -1 for full tree. Default: 2'),
    pierce: z.boolean().optional().describe('Pierce through iframes and shadow roots. Default: false'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof getDocument.inputSchema>;
    try {
      const doc = await session.getDocument(p.depth ?? 2, p.pierce);

      const formatNode = (node: typeof doc, depth: number): unknown => {
        if (depth < 0) return '...';
        return {
          nodeId: node.nodeId,
          nodeType: node.nodeType,
          nodeName: node.nodeName,
          attributes: node.attributes,
          childCount: node.childNodeCount ?? node.children?.length ?? 0,
          children: depth > 0 ? node.children?.map((c) => formatNode(c, depth - 1)) : undefined,
        };
      };

      return success(formatObject(formatNode(doc, 2)));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const querySelector: ToolDefinition = {
  name: 'query_selector',
  description: 'Find an element by CSS selector.',
  inputSchema: z.object({
    selector: z.string().describe('CSS selector'),
    nodeId: z.number().optional().describe('Node ID to search within. Uses document root if not specified.'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof querySelector.inputSchema>;
    try {
      let nodeId = p.nodeId;
      if (!nodeId) {
        const doc = await session.getDocument(1);
        nodeId = doc.nodeId;
      }

      const result = await session.querySelector(nodeId, p.selector);
      if (result === 0) {
        return success(formatObject({ found: false, selector: p.selector }));
      }

      return success(formatObject({
        found: true,
        nodeId: result,
        selector: p.selector,
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const querySelectorAll: ToolDefinition = {
  name: 'query_selector_all',
  description: 'Find all elements matching a CSS selector.',
  inputSchema: z.object({
    selector: z.string().describe('CSS selector'),
    nodeId: z.number().optional().describe('Node ID to search within. Uses document root if not specified.'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof querySelectorAll.inputSchema>;
    try {
      let nodeId = p.nodeId;
      if (!nodeId) {
        const doc = await session.getDocument(1);
        nodeId = doc.nodeId;
      }

      const results = await session.querySelectorAll(nodeId, p.selector);

      return success(formatObject({
        count: results.length,
        nodeIds: results,
        selector: p.selector,
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const getOuterHTML: ToolDefinition = {
  name: 'get_outer_html',
  description: 'Get the outer HTML of an element.',
  inputSchema: z.object({
    nodeId: z.number().describe('Node ID from querySelector'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof getOuterHTML.inputSchema>;
    try {
      const html = await session.getOuterHTML(p.nodeId);
      return success(html);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const getAttributes: ToolDefinition = {
  name: 'get_attributes',
  description: 'Get attributes of an element.',
  inputSchema: z.object({
    nodeId: z.number().describe('Node ID from querySelector'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof getAttributes.inputSchema>;
    try {
      const attrs = await session.getAttributes(p.nodeId);

      // Convert flat array to object
      const attrObj: Record<string, string> = {};
      for (let i = 0; i < attrs.length; i += 2) {
        attrObj[attrs[i]] = attrs[i + 1];
      }

      return success(formatObject(attrObj));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const getBoxModel: ToolDefinition = {
  name: 'get_box_model',
  description: 'Get the box model (dimensions and position) of an element.',
  inputSchema: z.object({
    nodeId: z.number().describe('Node ID from querySelector'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof getBoxModel.inputSchema>;
    try {
      const model = await session.getBoxModel(p.nodeId);
      return success(formatObject({
        width: model.width,
        height: model.height,
        content: model.content,
        padding: model.padding,
        border: model.border,
        margin: model.margin,
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const resolveNode: ToolDefinition = {
  name: 'resolve_node',
  description: 'Get a JavaScript object reference for a DOM node.',
  inputSchema: z.object({
    nodeId: z.number().describe('Node ID from querySelector'),
  }),
  handler: async (session, params) => {
    const p = params as z.infer<typeof resolveNode.inputSchema>;
    try {
      const obj = await session.resolveNode(p.nodeId);
      return success(formatObject({
        type: obj.type,
        subtype: obj.subtype,
        className: obj.className,
        description: obj.description,
        objectId: obj.objectId,
      }));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e));
    }
  },
};

export const domTools: ToolDefinition[] = [
  domEnable,
  domDisable,
  getDocument,
  querySelector,
  querySelectorAll,
  getOuterHTML,
  getAttributes,
  getBoxModel,
  resolveNode,
];
