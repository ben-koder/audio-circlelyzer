/**
 * Matrix Math Utilities for WebGPU
 */

export type Mat4 = Float32Array;

/**
 * Create an identity 4x4 matrix
 */
export function mat4Identity(): Mat4 {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

/**
 * Create a scaling matrix
 */
export function mat4Scale(sx: number, sy: number, sz: number): Mat4 {
  return new Float32Array([sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1]);
}

/**
 * Create a translation matrix
 */
export function mat4Translation(tx: number, ty: number, tz: number): Mat4 {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1]);
}

/**
 * Create a rotation matrix around the X axis
 */
export function mat4RotationX(angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}

/**
 * Create a rotation matrix around the Y axis
 */
export function mat4RotationY(angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}

/**
 * Create a rotation matrix around the Z axis
 */
export function mat4RotationZ(angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

/**
 * Multiply two 4x4 matrices
 */
export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const result = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      result[i * 4 + j] =
        a[0 * 4 + j] * b[i * 4 + 0] +
        a[1 * 4 + j] * b[i * 4 + 1] +
        a[2 * 4 + j] * b[i * 4 + 2] +
        a[3 * 4 + j] * b[i * 4 + 3];
    }
  }
  return result;
}

/**
 * Multiply a chain of matrices
 */
export function mat4MultiplyChain(...matrices: Mat4[]): Mat4 {
  if (matrices.length === 0) return mat4Identity();
  let result = matrices[0];
  for (let i = 1; i < matrices.length; i++) {
    result = mat4Multiply(result, matrices[i]);
  }
  return result;
}

/**
 * Create a perspective projection matrix
 */
export function mat4Perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1.0 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);

  return new Float32Array([
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) * nf,
    -1,
    0,
    0,
    2 * far * near * nf,
    0,
  ]);
}

/**
 * Create a look-at view matrix
 */
export function mat4LookAt(
  eyeX: number,
  eyeY: number,
  eyeZ: number,
  targetX: number,
  targetY: number,
  targetZ: number,
  upX: number,
  upY: number,
  upZ: number
): Mat4 {
  // Calculate forward vector (z axis)
  let zx = eyeX - targetX;
  let zy = eyeY - targetY;
  let zz = eyeZ - targetZ;
  let len = Math.sqrt(zx * zx + zy * zy + zz * zz);
  if (len > 0) {
    zx /= len;
    zy /= len;
    zz /= len;
  }

  // Calculate right vector (x axis) = up × forward
  let xx = upY * zz - upZ * zy;
  let xy = upZ * zx - upX * zz;
  let xz = upX * zy - upY * zx;
  len = Math.sqrt(xx * xx + xy * xy + xz * xz);
  if (len > 0) {
    xx /= len;
    xy /= len;
    xz /= len;
  }

  // Calculate up vector (y axis) = forward × right
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  return new Float32Array([
    xx,
    yx,
    zx,
    0,
    xy,
    yy,
    zy,
    0,
    xz,
    yz,
    zz,
    0,
    -(xx * eyeX + xy * eyeY + xz * eyeZ),
    -(yx * eyeX + yy * eyeY + yz * eyeZ),
    -(zx * eyeX + zy * eyeY + zz * eyeZ),
    1,
  ]);
}
