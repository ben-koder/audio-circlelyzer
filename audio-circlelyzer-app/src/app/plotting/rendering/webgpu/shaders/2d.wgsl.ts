/**
 * 2D WGSL Shaders
 */

export const LINE_SHADER = /* wgsl */ `
  struct Uniforms {
    plotBounds: vec4<f32>,
    xTransform: vec4<f32>,  // scale, offset, logFlag, unused
    yTransform: vec4<f32>,  // scale, offset, logFlag, unused
  }

  @group(0) @binding(0) var<uniform> uniforms: Uniforms;

  struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) color: vec4<f32>,
  }

  struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
  }

  @vertex
  fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    // Apply log10 if flagged, then affine transform to [-1,1]
    let xVal = select(input.position.x, log(max(input.position.x, 1e-10)) * 0.4342944819, uniforms.xTransform.z > 0.5);
    let yVal = select(input.position.y, log(max(input.position.y, 1e-10)) * 0.4342944819, uniforms.yTransform.z > 0.5);
    let xNorm = xVal * uniforms.xTransform.x + uniforms.xTransform.y;
    let yNorm = yVal * uniforms.yTransform.x + uniforms.yTransform.y;
    // Map from [-1,1] to plot-area clip space
    let x = uniforms.plotBounds.x + (xNorm * 0.5 + 0.5) * (uniforms.plotBounds.z - uniforms.plotBounds.x);
    let y = uniforms.plotBounds.y + (yNorm * 0.5 + 0.5) * (uniforms.plotBounds.w - uniforms.plotBounds.y);
    output.position = vec4<f32>(x, y, 0.0, 1.0);
    output.color = input.color;
    return output;
  }

  @fragment
  fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    return input.color;
  }
`;

export const BAR_SHADER = /* wgsl */ `
  struct Uniforms {
    transform: mat4x4<f32>,
    plotBounds: vec4<f32>,
  }

  @group(0) @binding(0) var<uniform> uniforms: Uniforms;

  struct VertexInput {
    @location(0) corner: vec2<f32>,
    @location(1) barRect: vec4<f32>,
    @location(2) color: vec4<f32>,
  }

  struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
  }

  @vertex
  fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let localX = input.barRect.x + input.corner.x * input.barRect.z;
    let localY = input.barRect.y + input.corner.y * input.barRect.w;
    let transformed = uniforms.transform * vec4<f32>(localX, localY, 0.0, 1.0);
    let x = uniforms.plotBounds.x + (transformed.x * 0.5 + 0.5) * (uniforms.plotBounds.z - uniforms.plotBounds.x);
    let y = uniforms.plotBounds.y + (transformed.y * 0.5 + 0.5) * (uniforms.plotBounds.w - uniforms.plotBounds.y);
    output.position = vec4<f32>(x, y, 0.0, 1.0);
    output.color = input.color;
    return output;
  }

  @fragment
  fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    return input.color;
  }
`;

export const HEATMAP_SHADER = /* wgsl */ `
  struct Uniforms {
    transform: mat4x4<f32>,
    plotBounds: vec4<f32>,
    valueRange: vec2<f32>,
    channelInfo: vec2<f32>,
  }

  @group(0) @binding(0) var<uniform> uniforms: Uniforms;
  @group(0) @binding(1) var heatmapTexture: texture_2d<f32>;

  struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) texCoord: vec2<f32>,
  }

  struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texCoord: vec2<f32>,
  }

  @vertex
  fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    let transformed = uniforms.transform * vec4<f32>(input.position, 0.0, 1.0);
    let x = uniforms.plotBounds.x + (transformed.x * 0.5 + 0.5) * (uniforms.plotBounds.z - uniforms.plotBounds.x);
    let y = uniforms.plotBounds.y + (transformed.y * 0.5 + 0.5) * (uniforms.plotBounds.w - uniforms.plotBounds.y);
    output.position = vec4<f32>(x, y, 0.0, 1.0);
    output.texCoord = input.texCoord;
    return output;
  }

  fn valueToHeatColor(value: f32) -> vec4<f32> {
    let v = clamp(value, 0.0, 1.0);
    var r: f32; var g: f32; var b: f32;
    if (v < 0.25) {
      r = 0.0; g = v * 4.0; b = 1.0;
    } else if (v < 0.5) {
      r = 0.0; g = 1.0; b = 1.0 - (v - 0.25) * 4.0;
    } else if (v < 0.75) {
      r = (v - 0.5) * 4.0; g = 1.0; b = 0.0;
    } else {
      r = 1.0; g = 1.0 - (v - 0.75) * 4.0; b = 0.0;
    }
    return vec4<f32>(r, g, b, 1.0);
  }

  @fragment
  fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let texDims = textureDimensions(heatmapTexture);
    let flippedTexCoord = vec2<f32>(input.texCoord.x, 1.0 - input.texCoord.y);
    let pixelCoord = vec2<i32>(
      clamp(i32(flippedTexCoord.x * f32(texDims.x)), 0, i32(texDims.x) - 1),
      clamp(i32(flippedTexCoord.y * f32(texDims.y)), 0, i32(texDims.y) - 1)
    );
    let rawValue = textureLoad(heatmapTexture, pixelCoord, 0).r;
    let normalized = (rawValue - uniforms.valueRange.x) / (uniforms.valueRange.y - uniforms.valueRange.x);
    return valueToHeatColor(normalized);
  }
`;

export const GRID_SHADER = /* wgsl */ `
  struct Uniforms {
    transform: mat4x4<f32>,
    plotBounds: vec4<f32>,
  }

  @group(0) @binding(0) var<uniform> uniforms: Uniforms;

  struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) color: vec4<f32>,
  }

  struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
  }

  @vertex
  fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    // Grid vertices are in -1 to 1 range (normalized to visible range)
    // Convert to 0..1 then map to plot bounds
    let normX = input.position.x * 0.5 + 0.5;
    let normY = input.position.y * 0.5 + 0.5;
    let x = uniforms.plotBounds.x + normX * (uniforms.plotBounds.z - uniforms.plotBounds.x);
    let y = uniforms.plotBounds.y + normY * (uniforms.plotBounds.w - uniforms.plotBounds.y);
    output.position = vec4<f32>(x, y, 0.0, 1.0);
    output.color = input.color;
    return output;
  }

  @fragment
  fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    return input.color;
  }
`;
