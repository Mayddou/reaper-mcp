import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * This test ensures every CommandType defined in the protocol has a
 * corresponding handler in mcp_bridge.lua. It prevents the bug where
 * new MCP tools are added in TypeScript but forgotten in Lua, causing
 * "Unknown command type" errors at runtime.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

function getCommandTypes(): string[] {
  const commandsPath = join(__dirname, '../../../libs/protocol/src/commands.ts');
  const content = readFileSync(commandsPath, 'utf-8');

  // Extract all string literals from the CommandType union
  const typeMatch = content.match(/export type CommandType\s*=\s*([\s\S]*?);/);
  if (!typeMatch) throw new Error('Could not find CommandType in commands.ts');

  const types: string[] = [];
  for (const match of typeMatch[1].matchAll(/'([^']+)'/g)) {
    types.push(match[1]);
  }
  return types;
}

function getLuaHandlers(): string[] {
  const luaPath = join(__dirname, '../../../reaper/mcp_bridge.lua');
  const content = readFileSync(luaPath, 'utf-8');

  const handlers: string[] = [];
  for (const match of content.matchAll(/function handlers\.(\w+)\s*\(/g)) {
    handlers.push(match[1]);
  }
  return handlers;
}

function getMcpToolNames(): string[] {
  const cliPath = join(__dirname, 'cli.ts');
  const content = readFileSync(cliPath, 'utf-8');

  const arrayMatch = content.match(/export const MCP_TOOL_NAMES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!arrayMatch) throw new Error('Could not find MCP_TOOL_NAMES in cli.ts');

  const names: string[] = [];
  for (const match of arrayMatch[1].matchAll(/'([^']+)'/g)) {
    names.push(match[1]);
  }
  return names;
}

describe('bridge coverage', () => {
  const commandTypes = getCommandTypes();
  const luaHandlers = new Set(getLuaHandlers());
  const mcpToolNames = new Set(getMcpToolNames());

  it('should have CommandType entries defined', () => {
    expect(commandTypes.length).toBeGreaterThan(0);
  });

  it('every CommandType must have a Lua handler in mcp_bridge.lua', () => {
    const missing = commandTypes.filter(t => !luaHandlers.has(t));
    expect(missing, `Missing Lua handlers for these CommandTypes: ${missing.join(', ')}`).toEqual([]);
  });

  it('every Lua handler must have a matching CommandType', () => {
    const commandSet = new Set(commandTypes);
    const extra = [...luaHandlers].filter(h => !commandSet.has(h));
    expect(extra, `Lua handlers without CommandType: ${extra.join(', ')}`).toEqual([]);
  });

  it('every CommandType must be in MCP_TOOL_NAMES in cli.ts', () => {
    const missing = commandTypes.filter(t => !mcpToolNames.has(t));
    expect(missing, `Missing from MCP_TOOL_NAMES: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('FX parameter value contract', () => {
  // Tools document `value` as normalized 0.0–1.0. TrackFX_SetParam takes native
  // units (e.g. ReaComp threshold is 0..2), so setters must use the Normalized API.
  const lua = readFileSync(join(__dirname, '../../../reaper/mcp_bridge.lua'), 'utf-8');
  const body = (name: string) => {
    const m = lua.match(new RegExp(`function handlers\\.${name}\\s*\\([\\s\\S]*?\\nend\\n`));
    if (!m) throw new Error(`handler ${name} not found`);
    return m[0];
  };

  it.each(['set_fx_parameter', 'set_multiple_fx_parameters', 'setup_fx_chain'])(
    '%s writes normalized values',
    (name) => {
      expect(body(name)).toContain('TrackFX_SetParamNormalized(');
      expect(body(name)).not.toMatch(/TrackFX_SetParam\(/);
    },
  );

  it.each(['get_fx_parameters', 'analyze_fx'])('%s reports normalized value + nativeValue', (name) => {
    expect(body(name)).toContain('TrackFX_GetParamNormalized(');
    expect(body(name)).toMatch(/value = norm,\s*nativeValue = val,/);
  });
});
