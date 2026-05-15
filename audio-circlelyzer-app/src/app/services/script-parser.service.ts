import { CONTEXT_KEY } from '../models/types';

export interface ParsedOperation {
  key: CONTEXT_KEY;
  type: string;           // Operation type (FFT, IFFT, VIS_ABSSPEC, etc.)
  args: CONTEXT_KEY[];    // Dependencies
  isVisualization: boolean;
  argSettings?: any;      // Optional settings from arg= parameter
}

export interface ArgDefinition {
  key: string;
  value: any;
}

export interface ParsedScript {
  operations: Map<CONTEXT_KEY, ParsedOperation>;
  executionOrder: CONTEXT_KEY[];
  argDefinitions: Map<string, any>;  // arg variable definitions
}

/**
 * Pure utility class for parsing calculation scripts.
 * Intentionally NOT decorated with @Injectable so it can be safely imported
 * by the calculation web worker (the worker bundle is not processed by
 * Angular's AOT compiler, so any @Injectable decorator in worker-imported
 * code would trigger "JIT compiler unavailable" at runtime in production).
 */
export class ScriptParserService {
  parse(script: string): ParsedScript {
    const lines = this.splitIntoStatements(script);
    
    const operations = new Map<CONTEXT_KEY, ParsedOperation>();
    const argDefinitions = new Map<string, any>();

    // First pass: collect arg definitions
    for (const line of lines) {
      const argDef = this.parseArgDefinition(line);
      if (argDef) {
        argDefinitions.set(argDef.key, argDef.value);
      }
    }

    // Second pass: parse operations (skip arg definitions)
    for (const line of lines) {
      if (this.isArgDefinition(line)) continue;
      
      const parsed = this.parseLine(line, argDefinitions);
      if (parsed) {
        operations.set(parsed.key, parsed);
      }
    }

    const executionOrder = this.getExecutionOrder(operations);

    return { operations, executionOrder, argDefinitions };
  }

  private splitIntoStatements(script: string): string[] {
    const statements: string[] = [];
    const rawLines = script.split('\n');
    let current = '';
    let braceDepth = 0;
    let parenDepth = 0;

    for (const rawLine of rawLines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('#')) {
        continue;
      }

      current = current ? `${current} ${line}` : line;
      braceDepth += (line.match(/\{/g) ?? []).length;
      braceDepth -= (line.match(/\}/g) ?? []).length;
      parenDepth += (line.match(/\(/g) ?? []).length;
      parenDepth -= (line.match(/\)/g) ?? []).length;

      if (braceDepth <= 0 && parenDepth <= 0) {
        statements.push(current);
        current = '';
        braceDepth = 0;
        parenDepth = 0;
      }
    }

    if (current) {
      statements.push(current);
    }

    return statements;
  }

  private isArgDefinition(line: string): boolean {
    // Match: key = { ... }
    return /^\w+\s*=\s*\{/.test(line);
  }

  private parseArgDefinition(line: string): ArgDefinition | null {
    // Match: key = { json-like content }
    const match = line.match(/^(\w+)\s*=\s*(\{.*\})$/);
    if (!match) return null;

    const [, key, valueStr] = match;
    
    try {
      // Convert the JSON-like format to proper JSON
      // Handle cases like: { channelSums:[[0]] } -> { "channelSums":[[0]] }
      // and: { expandFactor = 4 } -> { "expandFactor": 4 }
      const jsonStr = this.convertToJson(valueStr);
      const value = JSON.parse(jsonStr);
      return { key, value };
    } catch (e) {
      console.warn(`Failed to parse arg definition: ${line}`, e);
      return null;
    }
  }

  private convertToJson(str: string): string {
    // Convert JSON-like syntax to proper JSON in a string-literal-aware way.
    //
    // Supported source syntax:
    //   - Bare identifier keys followed by `:` or `=` get quoted: foo: 1 -> "foo": 1
    //   - `=` between key and value is rewritten to `:`            : foo = 1 -> "foo": 1
    //   - Single-quoted strings are converted to double-quoted JSON strings.
    //   - Already-quoted keys are preserved.
    //
    // Crucially, contents of string literals are passed through verbatim, so
    // descriptions like "τ_excess = -d∠(H/H_min)/dω" are not corrupted by the
    // key-rewriting regex.
    let out = '';
    let i = 0;
    const n = str.length;
    const isIdStart = (c: string) => /[A-Za-z_$]/.test(c);
    const isIdPart = (c: string) => /[A-Za-z0-9_$]/.test(c);

    while (i < n) {
      const ch = str[i];

      // String literal — copy verbatim, normalizing single quotes to double
      // and escaping any embedded double quotes when re-quoting.
      if (ch === '"' || ch === "'") {
        const quote = ch;
        out += '"';
        i++;
        while (i < n && str[i] !== quote) {
          if (str[i] === '\\' && i + 1 < n) {
            out += str[i] + str[i + 1];
            i += 2;
            continue;
          }
          if (quote === "'" && str[i] === '"') {
            out += '\\"';
            i++;
            continue;
          }
          out += str[i];
          i++;
        }
        if (i < n) i++; // skip closing quote
        out += '"';
        continue;
      }

      // Bare identifier — if followed (after whitespace) by `:` or `=`, treat
      // as object key and emit `"key":`. Otherwise pass through (covers
      // literals like true/false/null).
      if (isIdStart(ch)) {
        let j = i + 1;
        while (j < n && isIdPart(str[j])) j++;
        const ident = str.slice(i, j);
        let k = j;
        while (k < n && /\s/.test(str[k])) k++;
        if (k < n && (str[k] === ':' || str[k] === '=')) {
          out += `"${ident}":`;
          i = k + 1;
          continue;
        }
        out += ident;
        i = j;
        continue;
      }

      out += ch;
      i++;
    }

    return out;
  }

  private parseLine(line: string, argDefinitions: Map<string, any>): ParsedOperation | null {
    // Parse: KEY = OPERATION(ARG1, ARG2, ...) or KEY = OPERATION(ARG1, arg=argVar)
    const match = line.match(/^(\w+)\s*=\s*(\w+)\s*\((.*)\)$/);
    if (!match) {
      console.warn(`Failed to parse line: ${line}`);
      return null;
    }

    const [, key, type, argsStr] = match;
    
    // Parse arguments, handling arg= parameter
    const { args, argSettings } = this.parseOperationArgs(argsStr, argDefinitions);

    return {
      key,
      type,
      args,
      isVisualization: type.startsWith('VIS_'),
      argSettings
    };
  }

  private parseOperationArgs(argsStr: string, argDefinitions: Map<string, any>): { args: CONTEXT_KEY[], argSettings?: any } {
    const parts = argsStr.split(',').map(arg => arg.trim()).filter(arg => arg);
    const args: CONTEXT_KEY[] = [];
    let argSettings: any = undefined;

    for (const part of parts) {
      // Check if this is an arg= parameter
      const argMatch = part.match(/^arg\s*=\s*(\w+)$/);
      if (argMatch) {
        const argKey = argMatch[1];
        argSettings = argDefinitions.get(argKey);
        if (!argSettings) {
          console.warn(`Undefined arg variable: ${argKey}`);
        }
      } else {
        // Regular argument (context key)
        args.push(part);
      }
    }

    return { args, argSettings };
  }

  getExecutionOrder(operations: Map<CONTEXT_KEY, ParsedOperation>): CONTEXT_KEY[] {
    return this.topologicalSort(Array.from(operations.values()));
  }

  private topologicalSort(operations: ParsedOperation[]): CONTEXT_KEY[] {
    const graph = new Map<CONTEXT_KEY, CONTEXT_KEY[]>();
    const inDegree = new Map<CONTEXT_KEY, number>();
    
    // Build dependency graph
    for (const op of operations) {
      graph.set(op.key, op.args);
      if (!inDegree.has(op.key)) {
        inDegree.set(op.key, 0);
      }
      
      // Count dependencies (args that are not built-in)
      for (const arg of op.args) {
        if (arg !== 'x_c' && arg !== 'y_c' && arg !== 'Y_c') {
          inDegree.set(op.key, (inDegree.get(op.key) || 0) + 1);
        }
      }
    }

    // Kahn's algorithm
    const sorted: CONTEXT_KEY[] = [];
    const queue: CONTEXT_KEY[] = [];

    // Find nodes with no incoming edges
    for (const op of operations) {
      if ((inDegree.get(op.key) || 0) === 0) {
        queue.push(op.key);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      // Reduce in-degree for dependent nodes
      for (const op of operations) {
        if (op.args.includes(current)) {
          const degree = (inDegree.get(op.key) || 1) - 1;
          inDegree.set(op.key, degree);
          if (degree === 0) {
            queue.push(op.key);
          }
        }
      }
    }

    if (sorted.length !== operations.length) {
      throw new Error('Circular dependency detected in script');
    }

    return sorted;
  }

  validate(script: string, validOperations: Set<string>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    try {
      const parsed = this.parse(script);
      const keys = new Set<string>(['x_c', 'y_c']); // Built-in keys

      for (const [key, op] of parsed.operations) {
        // Check if operation exists
        if (!validOperations.has(op.type)) {
          errors.push(`Unknown operation: ${op.type} in line with key ${key}`);
        }

        // Check if arguments are defined
        for (const arg of op.args) {
          if (!keys.has(arg)) {
            errors.push(`Undefined variable: ${arg} used in ${key}`);
          }
        }

        keys.add(key);
      }

      // Check for circular dependencies (already done in getExecutionOrder)
    } catch (e) {
      errors.push(`Parse error: ${(e as Error).message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
