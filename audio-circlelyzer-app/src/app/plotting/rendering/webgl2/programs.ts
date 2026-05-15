/**
 * WebGL2 Program Management
 *
 * Compiles GLSL shaders, links programs, and caches them keyed by type.
 */

import { WebGL2Program, WebGL2Resources } from '../../types';
import {
  LINE_VERTEX, LINE_FRAGMENT,
  BAR_VERTEX, BAR_FRAGMENT,
  HEATMAP_VERTEX, HEATMAP_FRAGMENT,
  GRID_VERTEX, GRID_FRAGMENT,
} from './shaders/2d.glsl';
import {
  SURFACE_VERTEX, SURFACE_FRAGMENT,
  LINESTRIP_VERTEX, LINESTRIP_FRAGMENT,
  WALL_VERTEX, WALL_FRAGMENT,
  GRID_3D_VERTEX, GRID_3D_FRAGMENT,
} from './shaders/3d.glsl';

export type ProgramType =
  | 'line'
  | 'bar'
  | 'heatmap'
  | 'grid'
  | 'surface'
  | 'linestrip'
  | 'wall'
  | 'grid3d';

interface ShaderDef {
  vertex: string;
  fragment: string;
  attribs: string[];
  uniforms: string[];
}

const SHADER_DEFS: Record<ProgramType, ShaderDef> = {
  line: {
    vertex: LINE_VERTEX,
    fragment: LINE_FRAGMENT,
    attribs: ['a_position', 'a_color'],
    uniforms: ['u_plotBounds', 'u_xTransform', 'u_yTransform'],
  },
  bar: {
    vertex: BAR_VERTEX,
    fragment: BAR_FRAGMENT,
    attribs: ['a_corner', 'a_barRect', 'a_color'],
    uniforms: ['u_transform', 'u_plotBounds'],
  },
  heatmap: {
    vertex: HEATMAP_VERTEX,
    fragment: HEATMAP_FRAGMENT,
    attribs: ['a_position', 'a_texCoord'],
    uniforms: ['u_transform', 'u_plotBounds', 'u_valueRange', 'u_heatmapTexture'],
  },
  grid: {
    vertex: GRID_VERTEX,
    fragment: GRID_FRAGMENT,
    attribs: ['a_position', 'a_color'],
    uniforms: ['u_plotBounds'],
  },
  surface: {
    vertex: SURFACE_VERTEX,
    fragment: SURFACE_FRAGMENT,
    attribs: ['a_position', 'a_normal', 'a_color'],
    uniforms: ['u_modelMatrix', 'u_viewMatrix', 'u_projectionMatrix', 'u_lightDirection'],
  },
  linestrip: {
    vertex: LINESTRIP_VERTEX,
    fragment: LINESTRIP_FRAGMENT,
    attribs: ['a_position', 'a_color'],
    uniforms: ['u_modelMatrix', 'u_viewMatrix', 'u_projectionMatrix'],
  },
  wall: {
    vertex: WALL_VERTEX,
    fragment: WALL_FRAGMENT,
    attribs: ['a_position', 'a_color'],
    uniforms: ['u_modelMatrix', 'u_viewMatrix', 'u_projectionMatrix'],
  },
  grid3d: {
    vertex: GRID_3D_VERTEX,
    fragment: GRID_3D_FRAGMENT,
    attribs: ['a_position', 'a_color'],
    uniforms: ['u_modelMatrix', 'u_viewMatrix', 'u_projectionMatrix'],
  },
};

/**
 * Create an empty WebGL2Resources container.
 */
export function createWebGL2Resources(): WebGL2Resources {
  return {
    programs: new Map(),
    vaos: new Map(),
    buffers: new Map(),
    bufferSizes: new Map(),
    textures: new Map(),
    textureSizes: new Map(),
  };
}

/**
 * Get or create a WebGL2 program for the given type.
 */
export function ensureProgram(
  gl: WebGL2RenderingContext,
  resources: WebGL2Resources,
  type: ProgramType
): WebGL2Program {
  const existing = resources.programs.get(type);
  if (existing) return existing;

  const def = SHADER_DEFS[type];
  const program = compileAndLink(gl, def.vertex, def.fragment);

  const attribLocations: Record<string, number> = {};
  for (const name of def.attribs) {
    attribLocations[name] = gl.getAttribLocation(program, name);
  }

  const uniformLocations: Record<string, WebGLUniformLocation | null> = {};
  for (const name of def.uniforms) {
    uniformLocations[name] = gl.getUniformLocation(program, name);
  }

  const entry: WebGL2Program = { program, attribLocations, uniformLocations };
  resources.programs.set(type, entry);
  return entry;
}

/**
 * Compile a shader from source.
 */
function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }
  return shader;
}

/**
 * Link vertex + fragment shaders into a program.
 */
function compileAndLink(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);

  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    throw new Error(`Program link error: ${info}`);
  }

  // Shaders can be detached after linking
  gl.detachShader(program, vs);
  gl.detachShader(program, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  return program;
}

/**
 * Clean up all WebGL2 resources.
 */
export function cleanupWebGL2Resources(gl: WebGL2RenderingContext, resources: WebGL2Resources): void {
  for (const p of resources.programs.values()) {
    gl.deleteProgram(p.program);
  }
  resources.programs.clear();

  for (const vao of resources.vaos.values()) {
    gl.deleteVertexArray(vao);
  }
  resources.vaos.clear();

  for (const buf of resources.buffers.values()) {
    gl.deleteBuffer(buf);
  }
  resources.buffers.clear();
  resources.bufferSizes.clear();

  for (const tex of resources.textures.values()) {
    gl.deleteTexture(tex);
  }
  resources.textures.clear();
  resources.textureSizes.clear();

  if (resources.depthRenderbuffer) {
    gl.deleteRenderbuffer(resources.depthRenderbuffer);
    resources.depthRenderbuffer = undefined;
  }
}
