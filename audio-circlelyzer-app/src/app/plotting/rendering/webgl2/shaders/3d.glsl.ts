/**
 * WebGL2 3D GLSL Shaders
 *
 * GLSL 300 es equivalents of the WGSL 3D shaders.
 */

// =============================================================================
// SURFACE Shader — position(3)+normal(3)+color(4), with lighting
// =============================================================================

export const SURFACE_VERTEX = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec4 a_color;

uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;

out vec4 v_color;
out vec3 v_normal;
out vec3 v_worldPos;

void main() {
  vec4 worldPos = u_modelMatrix * vec4(a_position, 1.0);
  vec4 viewPos = u_viewMatrix * worldPos;
  gl_Position = u_projectionMatrix * viewPos;
  mat3 normalMatrix = mat3(u_modelMatrix);
  v_normal = normalize(normalMatrix * a_normal);
  v_worldPos = worldPos.xyz;
  v_color = a_color;
}
`;

export const SURFACE_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec4 v_color;
in vec3 v_normal;
in vec3 v_worldPos;

uniform vec4 u_lightDirection;

out vec4 fragColor;

void main() {
  vec3 lightDir = normalize(u_lightDirection.xyz);
  vec3 normal = normalize(v_normal);
  float diffuse = max(dot(normal, lightDir), 0.0);
  float ambient = 0.3;
  float lighting = ambient + diffuse * 0.7;
  fragColor = vec4(v_color.rgb * lighting, v_color.a);
}
`;

// =============================================================================
// LINESTRIP Shader — position(3)+color(4)
// =============================================================================

export const LINESTRIP_VERTEX = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec3 a_position;
layout(location = 1) in vec4 a_color;

uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;

out vec4 v_color;

void main() {
  vec4 worldPos = u_modelMatrix * vec4(a_position, 1.0);
  vec4 viewPos = u_viewMatrix * worldPos;
  gl_Position = u_projectionMatrix * viewPos;
  v_color = a_color;
}
`;

export const LINESTRIP_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  fragColor = v_color;
}
`;

// =============================================================================
// WALL Shader — position(3)+color(4), transparent fill
// =============================================================================

export const WALL_VERTEX = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec3 a_position;
layout(location = 1) in vec4 a_color;

uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;

out vec4 v_color;

void main() {
  vec4 worldPos = u_modelMatrix * vec4(a_position, 1.0);
  vec4 viewPos = u_viewMatrix * worldPos;
  gl_Position = u_projectionMatrix * viewPos;
  v_color = a_color;
}
`;

export const WALL_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  fragColor = v_color;
}
`;

// =============================================================================
// GRID_3D Shader — position(3)+color(4), drawn as LINES
// =============================================================================

export const GRID_3D_VERTEX = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec3 a_position;
layout(location = 1) in vec4 a_color;

uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;

out vec4 v_color;

void main() {
  vec4 worldPos = u_modelMatrix * vec4(a_position, 1.0);
  vec4 viewPos = u_viewMatrix * worldPos;
  gl_Position = u_projectionMatrix * viewPos;
  v_color = a_color;
}
`;

export const GRID_3D_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  fragColor = v_color;
}
`;
