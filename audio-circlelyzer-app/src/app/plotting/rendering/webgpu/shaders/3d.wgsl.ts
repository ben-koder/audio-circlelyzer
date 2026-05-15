/**
 * 3D WGSL Shaders
 */

export const SURFACE_SHADER = /* wgsl */ `
  struct Uniforms {
    modelMatrix: mat4x4<f32>,
    viewMatrix: mat4x4<f32>,
    projectionMatrix: mat4x4<f32>,
    lightDirection: vec4<f32>,
  }

  @group(0) @binding(0) var<uniform> uniforms: Uniforms;

  struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) color: vec4<f32>,
  }

  struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) worldPos: vec3<f32>,
  }

  @vertex
  fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let worldPos = uniforms.modelMatrix * vec4<f32>(input.position, 1.0);
    let viewPos = uniforms.viewMatrix * worldPos;
    output.position = uniforms.projectionMatrix * viewPos;
    let normalMatrix = mat3x3<f32>(
      uniforms.modelMatrix[0].xyz,
      uniforms.modelMatrix[1].xyz,
      uniforms.modelMatrix[2].xyz
    );
    output.normal = normalize(normalMatrix * input.normal);
    output.worldPos = worldPos.xyz;
    output.color = input.color;
    return output;
  }

  @fragment
  fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let lightDir = normalize(uniforms.lightDirection.xyz);
    let normal = normalize(input.normal);
    let diffuse = max(dot(normal, lightDir), 0.0);
    let ambient = 0.3;
    let lighting = ambient + diffuse * 0.7;
    return vec4<f32>(input.color.rgb * lighting, input.color.a);
  }
`;

export const LINESTRIP_SHADER = /* wgsl */ `
  struct Uniforms {
    modelMatrix: mat4x4<f32>,
    viewMatrix: mat4x4<f32>,
    projectionMatrix: mat4x4<f32>,
  }

  @group(0) @binding(0) var<uniform> uniforms: Uniforms;

  struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) color: vec4<f32>,
  }

  struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
  }

  @vertex
  fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let worldPos = uniforms.modelMatrix * vec4<f32>(input.position, 1.0);
    let viewPos = uniforms.viewMatrix * worldPos;
    output.position = uniforms.projectionMatrix * viewPos;
    output.color = input.color;
    return output;
  }

  @fragment
  fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    return input.color;
  }
`;

export const WALL_SHADER = /* wgsl */ `
  struct Uniforms {
    modelMatrix: mat4x4<f32>,
    viewMatrix: mat4x4<f32>,
    projectionMatrix: mat4x4<f32>,
  }

  @group(0) @binding(0) var<uniform> uniforms: Uniforms;

  struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) color: vec4<f32>,
  }

  struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
  }

  @vertex
  fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let worldPos = uniforms.modelMatrix * vec4<f32>(input.position, 1.0);
    let viewPos = uniforms.viewMatrix * worldPos;
    output.position = uniforms.projectionMatrix * viewPos;
    output.color = input.color;
    return output;
  }

  @fragment
  fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    return input.color;
  }
`;

export const GRID_3D_SHADER = /* wgsl */ `
  struct Uniforms {
    modelMatrix: mat4x4<f32>,
    viewMatrix: mat4x4<f32>,
    projectionMatrix: mat4x4<f32>,
  }

  @group(0) @binding(0) var<uniform> uniforms: Uniforms;

  struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) color: vec4<f32>,
  }

  struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
  }

  @vertex
  fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let worldPos = uniforms.modelMatrix * vec4<f32>(input.position, 1.0);
    let viewPos = uniforms.viewMatrix * worldPos;
    output.position = uniforms.projectionMatrix * viewPos;
    output.color = input.color;
    return output;
  }

  @fragment
  fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    return input.color;
  }
`;

export const OVERLAY_COMPOSITE_SHADER = /* wgsl */ `
  @group(0) @binding(0) var overlayTexture: texture_2d<f32>;
  @group(0) @binding(1) var overlaySampler: sampler;

  struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texCoord: vec2<f32>,
  }

  @vertex
  fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    let x = f32((vertexIndex & 1u) * 2u) - 1.0;
    let y = f32((vertexIndex >> 1u) * 2u) - 1.0;
    output.position = vec4<f32>(x, y, 0.0, 1.0);
    output.texCoord = vec2<f32>((x + 1.0) * 0.5, 1.0 - (y + 1.0) * 0.5);
    return output;
  }

  @fragment
  fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    return textureSample(overlayTexture, overlaySampler, input.texCoord);
  }
`;
