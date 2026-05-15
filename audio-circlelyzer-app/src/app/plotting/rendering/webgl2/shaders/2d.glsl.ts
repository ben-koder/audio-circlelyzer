/**
 * WebGL2 2D GLSL Shaders
 * 
 * GLSL 300 es equivalents of the WGSL 2D shaders.
 * Each constant contains { vertex, fragment } source strings.
 */

// =============================================================================
// LINE Shader — position(2) + color(4), drawn as LINE_STRIP
// =============================================================================

export const LINE_VERTEX = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec4 a_color;

uniform vec4 u_plotBounds; // left, bottom (NDC), right, top (NDC)
uniform vec4 u_xTransform; // scale, offset, logFlag, unused
uniform vec4 u_yTransform; // scale, offset, logFlag, unused

out vec4 v_color;

void main() {
  // Apply log10 if flagged, then affine transform to [-1,1]
  float xVal = u_xTransform.z > 0.5 ? log(max(a_position.x, 1e-10)) * 0.4342944819 : a_position.x;
  float yVal = u_yTransform.z > 0.5 ? log(max(a_position.y, 1e-10)) * 0.4342944819 : a_position.y;
  float xNorm = xVal * u_xTransform.x + u_xTransform.y;
  float yNorm = yVal * u_yTransform.x + u_yTransform.y;
  // Map from [-1,1] to plot-area clip space
  float x = u_plotBounds.x + (xNorm * 0.5 + 0.5) * (u_plotBounds.z - u_plotBounds.x);
  float y = u_plotBounds.y + (yNorm * 0.5 + 0.5) * (u_plotBounds.w - u_plotBounds.y);
  gl_Position = vec4(x, y, 0.0, 1.0);
  v_color = a_color;
}
`;

export const LINE_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  fragColor = v_color;
}
`;

// =============================================================================
// BAR Shader — instanced: corner(2) per-vertex, barRect(4)+color(4) per-instance
// =============================================================================

export const BAR_VERTEX = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_barRect;
layout(location = 2) in vec4 a_color;

uniform mat4 u_transform;
uniform vec4 u_plotBounds;

out vec4 v_color;

void main() {
  float localX = a_barRect.x + a_corner.x * a_barRect.z;
  float localY = a_barRect.y + a_corner.y * a_barRect.w;
  vec4 transformed = u_transform * vec4(localX, localY, 0.0, 1.0);
  float x = u_plotBounds.x + (transformed.x * 0.5 + 0.5) * (u_plotBounds.z - u_plotBounds.x);
  float y = u_plotBounds.y + (transformed.y * 0.5 + 0.5) * (u_plotBounds.w - u_plotBounds.y);
  gl_Position = vec4(x, y, 0.0, 1.0);
  v_color = a_color;
}
`;

export const BAR_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  fragColor = v_color;
}
`;

// =============================================================================
// HEATMAP Shader — position(2)+texCoord(2), samples R32F texture
// =============================================================================

export const HEATMAP_VERTEX = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texCoord;

uniform mat4 u_transform;
uniform vec4 u_plotBounds;

out vec2 v_texCoord;

void main() {
  vec4 transformed = u_transform * vec4(a_position, 0.0, 1.0);
  float x = u_plotBounds.x + (transformed.x * 0.5 + 0.5) * (u_plotBounds.z - u_plotBounds.x);
  float y = u_plotBounds.y + (transformed.y * 0.5 + 0.5) * (u_plotBounds.w - u_plotBounds.y);
  gl_Position = vec4(x, y, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

export const HEATMAP_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_heatmapTexture;
uniform vec2 u_valueRange;

out vec4 fragColor;

vec4 valueToHeatColor(float value) {
  float v = clamp(value, 0.0, 1.0);
  float r, g, b;
  if (v < 0.25) {
    r = 0.0; g = v * 4.0; b = 1.0;
  } else if (v < 0.5) {
    r = 0.0; g = 1.0; b = 1.0 - (v - 0.25) * 4.0;
  } else if (v < 0.75) {
    r = (v - 0.5) * 4.0; g = 1.0; b = 0.0;
  } else {
    r = 1.0; g = 1.0 - (v - 0.75) * 4.0; b = 0.0;
  }
  return vec4(r, g, b, 1.0);
}

void main() {
  vec2 flippedCoord = vec2(v_texCoord.x, 1.0 - v_texCoord.y);
  float rawValue = texture(u_heatmapTexture, flippedCoord).r;
  float normalized = (rawValue - u_valueRange.x) / (u_valueRange.y - u_valueRange.x);
  fragColor = valueToHeatColor(normalized);
}
`;

// =============================================================================
// GRID Shader — position(2)+color(4), drawn as LINES
// =============================================================================

export const GRID_VERTEX = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec4 a_color;

uniform vec4 u_plotBounds;

out vec4 v_color;

void main() {
  float normX = a_position.x * 0.5 + 0.5;
  float normY = a_position.y * 0.5 + 0.5;
  float x = u_plotBounds.x + normX * (u_plotBounds.z - u_plotBounds.x);
  float y = u_plotBounds.y + normY * (u_plotBounds.w - u_plotBounds.y);
  gl_Position = vec4(x, y, 0.0, 1.0);
  v_color = a_color;
}
`;

export const GRID_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  fragColor = v_color;
}
`;
