/**
 * Shared 3D Box Utilities
 * Contains logic for determining wall and label positions based on camera view
 */

import { Plot3DDynamicOptions } from '../../types';

export interface WallPositions {
  /** X position of the YZ wall (farthest from camera) */
  backX: number;
  /** Y position of the XZ wall (farthest from camera) */
  backY: number;
  /** Z position of the XY wall (farthest from camera) */
  backZ: number;
}

export interface LabelEdgePositions {
  /** Edge for X-axis labels: constant Y and Z */
  xAxis: { y: number; z: number };
  /** Edge for Y-axis labels: constant X and Z */
  yAxis: { x: number; z: number };
  /** Edge for Z-axis labels: constant X and Y */
  zAxis: { x: number; y: number };
}

/**
 * Compute depth (z2) after rotation transform
 * This matches the projection transform used in both Canvas 2D and WebGPU renderers
 * Larger z2 = farther from camera
 */
function computeDepth(
  x: number,
  y: number,
  z: number,
  cosX: number,
  sinX: number,
  cosY: number,
  sinY: number
): number {
  const z1 = -x * sinY + z * cosY;
  return y * sinX + z1 * cosX;
}

/**
 * Calculate which wall positions are farthest from camera (should be "back" walls)
 * This directly matches the projection transform to ensure walls are behind data
 */
export function getBackWallPositions(dynOpts: Plot3DDynamicOptions): WallPositions {
  // Use the same rotation parameters as the projection (with negated rotationX)
  const cosX = Math.cos(-dynOpts.rotationX);
  const sinX = Math.sin(-dynOpts.rotationX);
  const cosY = Math.cos(dynOpts.rotationY);
  const sinY = Math.sin(dynOpts.rotationY);

  // For each axis, determine which extreme (-1 or +1) is farther from camera
  const backX = computeDepth(-1, 0, 0, cosX, sinX, cosY, sinY) > computeDepth(1, 0, 0, cosX, sinX, cosY, sinY) ? -1 : 1;
  const backY = computeDepth(0, -1, 0, cosX, sinX, cosY, sinY) > computeDepth(0, 1, 0, cosX, sinX, cosY, sinY) ? -1 : 1;
  const backZ = computeDepth(0, 0, -1, cosX, sinX, cosY, sinY) > computeDepth(0, 0, 1, cosX, sinX, cosY, sinY) ? -1 : 1;

  return { backX, backY, backZ };
}

/**
 * Calculate edge positions for axis labels
 * 
 * Requirements:
 * - Labels should be placed along the FRONT edges of the rendered (back) walls
 * - X-axis labels: Along front edge of XZ wall (floor), at y = backY
 * - Y-axis labels: Along front edge of YZ wall, at x = backX
 * - Z-axis labels: Along the front edge closest to viewer, on a rendered wall
 */
export function getLabelEdgePositions(dynOpts: Plot3DDynamicOptions): LabelEdgePositions {
  const walls = getBackWallPositions(dynOpts);
  
  // Rotation parameters for depth computation
  const cosX = Math.cos(-dynOpts.rotationX);
  const sinX = Math.sin(-dynOpts.rotationX);
  const cosY = Math.cos(dynOpts.rotationY);
  const sinY = Math.sin(dynOpts.rotationY);
  
  // Front positions are opposite to back (closer to viewer)
  const frontX = -walls.backX;
  const frontY = -walls.backY;
  const frontZ = -walls.backZ;

  // X-axis labels: run along X on the XZ wall (floor at y=backY)
  // Place at the front Z edge of this wall (z=frontZ)
  const xAxis = { y: walls.backY, z: frontZ };

  // Y-axis labels: run along Y on the YZ wall (at x=backX)
  // Place at the front Z edge of this wall (z=frontZ)
  const yAxis = { x: walls.backX, z: frontZ };

  // Z-axis labels: run along Z, at constant X and Y
  // Should be on the front edge closest to viewer while still being on a rendered wall
  // 
  // Option 1: Edge of YZ wall (x=backX) at y=frontY (front Y edge)
  // Option 2: Edge of XZ wall (y=backY) at x=frontX (front X edge)
  // Pick the one closer to the viewer
  const yzWallFrontEdge = { x: walls.backX, y: frontY };
  const xzWallFrontEdge = { x: frontX, y: walls.backY };
  
  // Pick the edge closer to the viewer
  const depthYZ = computeDepth(yzWallFrontEdge.x, yzWallFrontEdge.y, 0, cosX, sinX, cosY, sinY);
  const depthXZ = computeDepth(xzWallFrontEdge.x, xzWallFrontEdge.y, 0, cosX, sinX, cosY, sinY);
  
  const zAxis = depthYZ < depthXZ ? yzWallFrontEdge : xzWallFrontEdge;

  return { xAxis, yAxis, zAxis };
}
