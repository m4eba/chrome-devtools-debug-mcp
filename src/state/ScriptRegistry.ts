import type { ScriptInfo } from '../utils/types.js';

export class ScriptRegistry {
  private scripts = new Map<string, ScriptInfo>();
  private urlToScriptIds = new Map<string, Set<string>>();
  private sourceCache = new Map<string, string>();

  addScript(script: ScriptInfo): void {
    this.scripts.set(script.scriptId, script);

    if (script.url) {
      let ids = this.urlToScriptIds.get(script.url);
      if (!ids) {
        ids = new Set();
        this.urlToScriptIds.set(script.url, ids);
      }
      ids.add(script.scriptId);
    }
  }

  getScript(scriptId: string): ScriptInfo | undefined {
    return this.scripts.get(scriptId);
  }

  getScriptsByUrl(url: string): ScriptInfo[] {
    const ids = this.urlToScriptIds.get(url);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.scripts.get(id))
      .filter((s): s is ScriptInfo => s !== undefined);
  }

  findScriptsByUrlPattern(pattern: string): ScriptInfo[] {
    const results: ScriptInfo[] = [];
    const regex = this.patternToRegex(pattern);

    for (const script of this.scripts.values()) {
      if (script.url && regex.test(script.url)) {
        results.push(script);
      }
    }

    return results;
  }

  getAllScripts(): ScriptInfo[] {
    return Array.from(this.scripts.values());
  }

  getScriptCount(): number {
    return this.scripts.size;
  }

  // Source caching
  setSource(scriptId: string, source: string): void {
    this.sourceCache.set(scriptId, source);
  }

  getSource(scriptId: string): string | undefined {
    return this.sourceCache.get(scriptId);
  }

  hasSource(scriptId: string): boolean {
    return this.sourceCache.has(scriptId);
  }

  // URL matching utilities
  matchesUrl(url: string, pattern: string): boolean {
    const regex = this.patternToRegex(pattern);
    return regex.test(url);
  }

  private patternToRegex(pattern: string): RegExp {
    // Support glob-like patterns and exact matches
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      // Already a regex
      return new RegExp(pattern.slice(1, -1));
    }

    // Convert glob pattern to regex
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    return new RegExp(`^${escaped}$`);
  }

  // Find script ID for a URL and line
  findScriptForLocation(url: string, lineNumber: number): ScriptInfo | undefined {
    const scripts = this.getScriptsByUrl(url);
    if (scripts.length === 0) return undefined;

    // If multiple scripts at same URL, find one containing the line
    for (const script of scripts) {
      if (lineNumber >= script.startLine && lineNumber <= script.endLine) {
        return script;
      }
    }

    // Fallback to first script
    return scripts[0];
  }

  clear(): void {
    this.scripts.clear();
    this.urlToScriptIds.clear();
    this.sourceCache.clear();
  }

  // Get summary for debugging
  getSummary(): { total: number; withUrl: number; modules: number } {
    let withUrl = 0;
    let modules = 0;

    for (const script of this.scripts.values()) {
      if (script.url) withUrl++;
      if (script.isModule) modules++;
    }

    return {
      total: this.scripts.size,
      withUrl,
      modules,
    };
  }
}
