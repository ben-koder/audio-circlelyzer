/**
 * WebGL2 Buffer Management
 *
 * Utilities for creating and resizing WebGL2 buffers, textures, and renderbuffers.
 */

import { WebGL2Resources } from '../../types';

/**
 * Ensure a buffer exists and is large enough. Creates or re-creates as needed.
 */
export function ensureBuffer(
  gl: WebGL2RenderingContext,
  resources: WebGL2Resources,
  key: string,
  requiredBytes: number,
  usage: number
): WebGLBuffer {
  const existing = resources.buffers.get(key);
  const existingSize = resources.bufferSizes.get(key) ?? 0;

  if (existing && existingSize >= requiredBytes) {
    return existing;
  }

  if (existing) gl.deleteBuffer(existing);

  const buffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, requiredBytes, usage);

  resources.buffers.set(key, buffer);
  resources.bufferSizes.set(key, requiredBytes);
  return buffer;
}

/**
 * Ensure an element-array (index) buffer.
 */
export function ensureIndexBuffer(
  gl: WebGL2RenderingContext,
  resources: WebGL2Resources,
  key: string,
  requiredBytes: number,
  usage: number
): WebGLBuffer {
  const existing = resources.buffers.get(key);
  const existingSize = resources.bufferSizes.get(key) ?? 0;

  if (existing && existingSize >= requiredBytes) {
    return existing;
  }

  if (existing) gl.deleteBuffer(existing);

  const buffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, requiredBytes, usage);

  resources.buffers.set(key, buffer);
  resources.bufferSizes.set(key, requiredBytes);
  return buffer;
}

/**
 * Ensure a depth renderbuffer for 3D rendering.
 */
export function ensureDepthRenderbuffer(
  gl: WebGL2RenderingContext,
  resources: WebGL2Resources,
  width: number,
  height: number
): WebGLRenderbuffer {
  if (resources.depthRenderbuffer) {
    // Check if dimensions match via stored size
    const stored = resources.textureSizes.get('__depth');
    if (stored && stored.width === width && stored.height === height) {
      return resources.depthRenderbuffer;
    }
    gl.deleteRenderbuffer(resources.depthRenderbuffer);
  }

  const rb = gl.createRenderbuffer()!;
  gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);

  resources.depthRenderbuffer = rb;
  resources.textureSizes.set('__depth', { width, height });
  return rb;
}

/**
 * Ensure a R32F texture exists at the given size. Returns the texture.
 */
export function ensureFloatTexture(
  gl: WebGL2RenderingContext,
  resources: WebGL2Resources,
  key: string,
  width: number,
  height: number
): WebGLTexture {
  const existing = resources.textures.get(key);
  const stored = resources.textureSizes.get(key);

  if (existing && stored && stored.width === width && stored.height === height) {
    return existing;
  }

  if (existing) gl.deleteTexture(existing);

  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, width, height, 0, gl.RED, gl.FLOAT, null);

  resources.textures.set(key, tex);
  resources.textureSizes.set(key, { width, height });
  return tex;
}
